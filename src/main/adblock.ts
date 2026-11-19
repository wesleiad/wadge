import { app, type Session } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { ElectronBlocker } from '@ghostery/adblocker-electron'
import { getSettings, updateSettings } from './settings'

let blocker: ElectronBlocker | null = null
let session: Session | null = null
let active = false
const blocked = new Map<number, number>()

export function getBlocked(wcId: number): number {
  return blocked.get(wcId) ?? 0
}
export function resetBlocked(wcId: number): void {
  blocked.set(wcId, 0)
}

export function hostMatches(host: string, site: string): boolean {
  return host === site || host.endsWith('.' + site)
}

export function isPausedHost(host: string): boolean {
  return getSettings().adblockPausedSites.some((s) => hostMatches(host, s))
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function wrapper(
  details: Electron.OnBeforeRequestListenerDetails,
  cb: (r: Electron.CallbackResponse) => void
): void {
  const top = details.webContents?.getURL() || details.referrer || ''
  if (top && isPausedHost(hostOf(top))) return cb({})
  blocker!.onBeforeRequest(details, cb)
}

export function applyAdblock(): void {
  if (!blocker || !session) return
  if (getSettings().adblockEnabled) {
    if (!active) {
      blocker.enableBlockingInSession(session)
      active = true
    }
    // substitui o listener para permitir pausa por site
    session.webRequest.onBeforeRequest(wrapper)
  } else if (active) {
    blocker.disableBlockingInSession(session)
    active = false
  }
}

export async function initAdblock(ses: Session): Promise<void> {
  session = ses
  try {
    blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch as never, {
      path: join(app.getPath('userData'), 'adblock-engine.bin'),
      read: fs.readFile,
      write: fs.writeFile
    })
    blocker.on('request-blocked', (r) => {
      blocked.set(r.tabId, (blocked.get(r.tabId) ?? 0) + 1)
    })
    applyAdblock()
  } catch (e) {
    console.error('AdBlock indisponível (sem rede?):', e)
  }
}

export function setGlobalAdblock(on: boolean): void {
  updateSettings({ adblockEnabled: on })
  applyAdblock()
}

export function toggleSite(host: string): void {
  if (!host) return
  const list = getSettings().adblockPausedSites
  const next = isPausedHost(host) ? list.filter((s) => !hostMatches(host, s)) : [...list, host]
  updateSettings({ adblockPausedSites: next })
}
