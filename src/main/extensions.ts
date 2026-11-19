import { app, type Session } from 'electron'
import { join, basename } from 'path'
import { existsSync, mkdirSync, readdirSync, readFileSync, cpSync, rmSync, statSync } from 'fs'
import { getSettings, updateSettings } from './settings'
import { listChromeProfiles } from './bookmarks'
import type { ChromeExtEntry, ExtensionInfo } from '../shared/types'

export const extensionsDir = (): string => join(app.getPath('userData'), 'extensions')

/** Aceita pasta com manifest.json ou pasta estilo Chrome (<id>/<versão>/manifest.json). */
function resolveRoot(dir: string): string | null {
  if (existsSync(join(dir, 'manifest.json'))) return dir
  try {
    const subs = readdirSync(dir).filter((s) => existsSync(join(dir, s, 'manifest.json'))).sort()
    return subs.length ? join(dir, subs[subs.length - 1]) : null
  } catch {
    return null
  }
}

interface Manifest {
  name?: string
  version?: string
  description?: string
  default_locale?: string
  icons?: Record<string, string>
  action?: { default_popup?: string }
  browser_action?: { default_popup?: string }
}

/** Página do popup (botão da barra) declarada no manifesto — MV3 "action" ou MV2 "browser_action". */
function manifestPopup(m: Manifest): string {
  return m.action?.default_popup ?? m.browser_action?.default_popup ?? ''
}

function readJson(file: string): any {
  return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''))
}

function readManifest(root: string): Manifest {
  try {
    return readJson(join(root, 'manifest.json'))
  } catch {
    return {}
  }
}

/** Resolve textos "__MSG_chave__" usando _locales. */
function localized(root: string, m: Manifest, text: string | undefined, fallback: string): string {
  if (!text) return fallback
  const mm = /^__MSG_(.+)__$/.exec(text)
  if (!mm) return text
  for (const loc of [m.default_locale, 'pt_BR', 'en', 'en_US']) {
    if (!loc) continue
    try {
      const msgs = readJson(join(root, '_locales', loc, 'messages.json'))
      const key = Object.keys(msgs).find((k) => k.toLowerCase() === mm[1].toLowerCase())
      if (key && msgs[key].message) return msgs[key].message
    } catch {
      /* tenta o próximo idioma */
    }
  }
  return fallback
}

function iconOf(root: string, m: Manifest): string {
  const sizes = Object.keys(m.icons ?? {}).map(Number).filter((n) => n > 0).sort((a, b) => b - a)
  const pick = sizes.find((n) => n <= 128) ?? sizes[0]
  if (!pick) return ''
  try {
    const f = join(root, m.icons![String(pick)])
    const ext = f.toLowerCase().endsWith('.svg') ? 'svg+xml' : 'png'
    return `data:image/${ext};base64,` + readFileSync(f).toString('base64')
  } catch {
    return ''
  }
}

function folders(): Array<{ key: string; root: string }> {
  mkdirSync(extensionsDir(), { recursive: true })
  const out: Array<{ key: string; root: string }> = []
  for (const key of readdirSync(extensionsDir())) {
    const full = join(extensionsDir(), key)
    if (!statSync(full).isDirectory()) continue
    const root = resolveRoot(full)
    if (root) out.push({ key, root })
  }
  return out
}

export async function loadAllExtensions(ses: Session): Promise<void> {
  const disabled = getSettings().disabledExtensions
  for (const { key, root } of folders()) {
    if (disabled.includes(key)) continue
    try {
      await ses.extensions.loadExtension(root, { allowFileAccess: true })
    } catch (e) {
      console.error('Falha ao carregar extensão', key, e)
    }
  }
}

export function listExtensions(ses: Session): ExtensionInfo[] {
  const loaded = ses.extensions.getAllExtensions()
  return folders().map(({ key, root }) => {
    const m = readManifest(root)
    const live = loaded.find((e) => e.path === root)
    return {
      key,
      id: live?.id ?? '',
      name: localized(root, m, m.name, key),
      version: m.version ?? '',
      description: localized(root, m, m.description, ''),
      path: root,
      enabled: !!live,
      icon: iconOf(root, m),
      popup: manifestPopup(m)
    }
  })
}

// ---------- Extensões já instaladas no Google Chrome ----------
const CHROME_EXT_ID = /^[a-p]{32}$/

/** Varre %LOCALAPPDATA%\Google\Chrome\User Data\<perfil>\Extensions e lê os manifestos (já vêm descompactados). */
export function listChromeExtensions(): ChromeExtEntry[] {
  const root = join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'User Data')
  const out = new Map<string, ChromeExtEntry>()
  for (const p of listChromeProfiles()) {
    const extRoot = join(root, p.dir, 'Extensions')
    let ids: string[] = []
    try {
      ids = readdirSync(extRoot).filter((d) => CHROME_EXT_ID.test(d))
    } catch {
      continue
    }
    for (const id of ids) {
      if (out.has(id)) continue
      const idDir = join(extRoot, id)
      let versions: string[] = []
      try {
        versions = readdirSync(idDir).filter((v) => existsSync(join(idDir, v, 'manifest.json'))).sort()
      } catch {
        continue
      }
      if (!versions.length) continue
      const vdir = join(idDir, versions[versions.length - 1])
      const m = readManifest(vdir)
      const name = localized(vdir, m, m.name, '')
      if (!name || /^__MSG_/.test(name)) continue // sem nome legível, ignora
      out.set(id, {
        id, name, version: m.version ?? '', icon: iconOf(vdir, m),
        path: vdir, profile: p.dir, popup: manifestPopup(m)
      })
    }
  }
  // extensões do Bitwarden primeiro, depois ordem alfabética
  return [...out.values()].sort(
    (a, b) => Number(/bitwarden/i.test(b.name)) - Number(/bitwarden/i.test(a.name)) || a.name.localeCompare(b.name)
  )
}

/** Copia extensões já instaladas no Chrome para a pasta do WD e carrega. Retorna quantas foram importadas. */
export async function importChromeExtensions(ses: Session, ids: string[]): Promise<number> {
  const found = listChromeExtensions().filter((e) => ids.includes(e.id))
  let n = 0
  for (const e of found) {
    const safe = e.name.replace(/[\\/:*?"<>|]/g, '').trim() || e.id
    const key = `${safe}-${e.id.slice(0, 6)}`
    const dest = join(extensionsDir(), key)
    if (!existsSync(dest)) cpSync(e.path, dest, { recursive: true })
    updateSettings({ disabledExtensions: getSettings().disabledExtensions.filter((k) => k !== key) })
    const root = resolveRoot(dest)
    if (!root) continue
    if (!ses.extensions.getAllExtensions().some((x) => x.path === root)) {
      try {
        await ses.extensions.loadExtension(root, { allowFileAccess: true })
      } catch (err) {
        console.error('Falha ao carregar extensão importada do Chrome', key, err)
        continue
      }
    }
    n++
  }
  return n
}

export async function addExtension(ses: Session, src: string): Promise<ExtensionInfo> {
  if (!resolveRoot(src)) throw new Error('A pasta não contém manifest.json (extraia o .crx antes).')
  mkdirSync(extensionsDir(), { recursive: true })
  const key = basename(src)
  const dest = join(extensionsDir(), key)
  if (!existsSync(dest)) cpSync(src, dest, { recursive: true })
  updateSettings({ disabledExtensions: getSettings().disabledExtensions.filter((k) => k !== key) })
  const root = resolveRoot(dest)!
  if (!ses.extensions.getAllExtensions().some((e) => e.path === root))
    await ses.extensions.loadExtension(root, { allowFileAccess: true })
  return listExtensions(ses).find((e) => e.key === key)!
}

export async function setExtensionEnabled(ses: Session, key: string, enabled: boolean): Promise<void> {
  const f = folders().find((x) => x.key === key)
  if (!f) return
  const live = ses.extensions.getAllExtensions().find((e) => e.path === f.root)
  const dis = getSettings().disabledExtensions.filter((k) => k !== key)
  if (enabled) {
    if (!live) await ses.extensions.loadExtension(f.root, { allowFileAccess: true })
    updateSettings({ disabledExtensions: dis })
  } else {
    if (live) ses.extensions.removeExtension(live.id)
    updateSettings({ disabledExtensions: [...dis, key] })
  }
}

export function removeExtension(ses: Session, key: string): void {
  const f = folders().find((x) => x.key === key)
  if (!f) return
  const live = ses.extensions.getAllExtensions().find((e) => e.path === f.root)
  if (live) ses.extensions.removeExtension(live.id)
  rmSync(join(extensionsDir(), key), { recursive: true, force: true })
  updateSettings({ disabledExtensions: getSettings().disabledExtensions.filter((k) => k !== key) })
}
