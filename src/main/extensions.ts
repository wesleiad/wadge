import { app, type Session } from 'electron'
import { join, basename } from 'path'
import { existsSync, mkdirSync, readdirSync, readFileSync, cpSync, rmSync, statSync } from 'fs'
import type { ExtensionInfo } from '../shared/types'

export const extensionsDir = (): string => join(app.getPath('userData'), 'extensions')

/** Aceita pasta com manifest.json ou pasta estilo Chrome (<id>/<versão>/manifest.json). */
function resolveRoot(dir: string): string | null {
  if (existsSync(join(dir, 'manifest.json'))) return dir
  try {
    const subs = readdirSync(dir)
      .filter((s) => existsSync(join(dir, s, 'manifest.json')))
      .sort()
    return subs.length ? join(dir, subs[subs.length - 1]) : null
  } catch {
    return null
  }
}

export async function loadAllExtensions(ses: Session): Promise<void> {
  mkdirSync(extensionsDir(), { recursive: true })
  for (const name of readdirSync(extensionsDir())) {
    const full = join(extensionsDir(), name)
    if (!statSync(full).isDirectory()) continue
    const root = resolveRoot(full)
    if (!root) continue
    try {
      await ses.extensions.loadExtension(root, { allowFileAccess: true })
    } catch (e) {
      console.error('Falha ao carregar extensão', name, e)
    }
  }
}

export function listExtensions(ses: Session): ExtensionInfo[] {
  return ses.extensions
    .getAllExtensions()
    .filter((e) => e.path.startsWith(extensionsDir()))
    .map((e) => ({ id: e.id, name: e.name, version: e.version, path: e.path }))
}

export async function addExtension(ses: Session, src: string): Promise<ExtensionInfo> {
  const root = resolveRoot(src)
  if (!root) throw new Error('A pasta não contém manifest.json (extraia o .crx antes).')
  mkdirSync(extensionsDir(), { recursive: true })
  const dest = join(extensionsDir(), basename(src))
  if (!existsSync(dest)) cpSync(src, dest, { recursive: true })
  const finalRoot = resolveRoot(dest)!
  const ext = await ses.extensions.loadExtension(finalRoot, { allowFileAccess: true })
  return { id: ext.id, name: ext.name, version: ext.version, path: ext.path }
}

export function removeExtension(ses: Session, id: string): void {
  const ext = ses.extensions.getExtension(id)
  if (!ext) return
  ses.extensions.removeExtension(id)
  // apaga a pasta de topo dentro de extensions/
  const rel = ext.path.slice(extensionsDir().length + 1).split(/[\\/]/)[0]
  if (rel) rmSync(join(extensionsDir(), rel), { recursive: true, force: true })
}

export function readManifestName(dir: string): string {
  try {
    const root = resolveRoot(dir)
    return JSON.parse(readFileSync(join(root!, 'manifest.json'), 'utf8')).name
  } catch {
    return basename(dir)
  }
}
