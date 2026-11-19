import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import type { Settings } from '../shared/types'

const defaults: Settings = {
  homepage: 'https://www.google.com',
  searchEngine: 'https://www.google.com/search?q=%s',
  suspendMinutes: 5,
  vaultUrl: '',
  adblockEnabled: true,
  adblockPausedSites: [],
  importPrompted: false,
  theme: 'system',
  memLimitMB: 1200,
  showBookmarksBar: true,
  startup: 'newtab',
  startupUrls: '',
  downloadPath: '',
  askDownload: false,
  clearOnExit: false,
  disabledExtensions: [],
  vaultMode: 'auto',
  schema: 2
}

let cache: Settings | null = null
const listeners: Array<(s: Settings) => void> = []
const file = (): string => join(app.getPath('userData'), 'settings.json')

export function getSettings(): Settings {
  if (!cache) {
    try {
      const c: Settings = { ...defaults, ...JSON.parse(readFileSync(file(), 'utf8')) }
      cache = c.schema < 2 ? { ...c, suspendMinutes: 3, schema: 2 } : c // novo padrão: 3 min
    } catch {
      cache = { ...defaults, suspendMinutes: 3 }
    }
  }
  return cache!
}

export function updateSettings(patch: Partial<Settings>): Settings {
  cache = { ...getSettings(), ...patch }
  try {
    writeFileSync(file(), JSON.stringify(cache, null, 2))
  } catch (e) {
    console.error('Falha ao salvar configurações', e)
  }
  listeners.forEach((l) => l(cache!))
  return cache
}

export function onSettingsChange(cb: (s: Settings) => void): void {
  listeners.push(cb)
}
