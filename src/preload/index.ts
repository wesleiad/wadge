import { contextBridge, ipcRenderer } from 'electron'
import { injectBrowserAction } from 'electron-chrome-extensions/browser-action'
import type { Settings } from '../shared/types'

// registra <browser-action-list> (ícones/popups das extensões)
injectBrowserAction()

const on = <T>(ch: string, cb: (v: T) => void): void => {
  ipcRenderer.on(ch, (_e, v) => cb(v as T))
}

const api = {
  onTabs: (cb: (s: unknown) => void) => on('tabs:state', cb),
  onAdblock: (cb: (s: unknown) => void) => on('adblock:status', cb),
  onVault: (cb: (open: boolean) => void) => on('vault:state', cb),
  onMemory: (cb: (mb: number) => void) => on('memory', cb),
  onFocusAddress: (cb: () => void) => on('ui:focus-address', cb),
  onBookmarks: (cb: (b: unknown) => void) => on('bookmarks:changed', cb),
  onManagerTab: (cb: (t: string) => void) => on('manager:tab', cb),

  tabsState: () => ipcRenderer.invoke('tabs:state'),
  newTab: (url?: string) => ipcRenderer.send('tabs:new', url),
  activate: (id: number) => ipcRenderer.send('tabs:activate', id),
  closeTab: (id: number) => ipcRenderer.send('tabs:close', id),
  go: (url: string) => ipcRenderer.send('nav:go', url),
  back: () => ipcRenderer.send('nav:back'),
  forward: () => ipcRenderer.send('nav:forward'),
  reload: () => ipcRenderer.send('nav:reload'),
  suspendInactive: (): Promise<number> => ipcRenderer.invoke('tabs:suspend-inactive'),
  toggleVault: () => ipcRenderer.send('vault:toggle'),
  adblockStatus: () => ipcRenderer.invoke('adblock:status'),
  adblockMenu: (x: number, y: number) => ipcRenderer.send('adblock:menu', x, y),
  themeMenu: (x: number, y: number) => ipcRenderer.send('theme:menu', x, y),
  appMenu: (x: number, y: number) => ipcRenderer.send('app:menu', x, y),

  getBookmarks: () => ipcRenderer.invoke('bookmarks:get'),
  addBookmark: () => ipcRenderer.send('bookmarks:add-current'),
  openBookmark: (id: string) => ipcRenderer.send('bookmarks:open', id),
  folderMenu: (id: string, x: number, y: number) => ipcRenderer.send('bookmarks:folder', id, x, y),
  bookmarkContext: (id: string) => ipcRenderer.send('bookmarks:context', id),
  chromeProfiles: () => ipcRenderer.invoke('chrome:profiles'),
  importChrome: (dirs: string[]): Promise<number> => ipcRenderer.invoke('chrome:import', dirs),

  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (p: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', p),

  listExtensions: () => ipcRenderer.invoke('ext:list'),
  addExtension: () => ipcRenderer.invoke('ext:add'),
  removeExtension: (id: string) => ipcRenderer.invoke('ext:remove', id),
  openExtensionsFolder: () => ipcRenderer.send('ext:open-folder')
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
