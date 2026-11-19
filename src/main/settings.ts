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
  theme: 'system'
}

let cache: Settings | null = null
const listeners: Array<(s: Settings) => void> = []
const file = (): string => join(app.getPath('userData'), 'settings.json')

export function getSettings(): Settings {
  if (!cache) {
    try {
      cache = { ...defaults, ...JSON.parse(readFileSync(file(), 'utf8')) }
    } catch {
      cache = { ...defaults }
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
