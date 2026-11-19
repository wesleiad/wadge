import { contextBridge, ipcRenderer } from 'electron'
import { injectBrowserAction } from 'electron-chrome-extensions/browser-action'
import type { Settings, ClearOptions, ExtensionInfo, HistoryEntry, DownloadInfo, ChromeExtEntry } from '../shared/types'

// registra <browser-action-list> (ícones/popups das extensões)
injectBrowserAction()

const on = <T>(ch: string, cb: (v: T) => void): void => {
  ipcRenderer.on(ch, (_e, v) => cb(v as T))
}
const inv = <T>(ch: string, ...a: unknown[]): Promise<T> => ipcRenderer.invoke(ch, ...a)

const api = {
  onTabs: (cb: (s: unknown) => void) => on('tabs:state', cb),
  onAdblock: (cb: (s: unknown) => void) => on('adblock:status', cb),
  onVault: (cb: (open: boolean) => void) => on('vault:state', cb),
  onMemory: (cb: (mb: number) => void) => on('memory', cb),
  onFocusAddress: (cb: () => void) => on('ui:focus-address', cb),
  onBookmarks: (cb: (b: unknown) => void) => on('bookmarks:changed', cb),
  onManagerTab: (cb: (t: string) => void) => on('manager:tab', cb),
  onSettings: (cb: (s: Settings) => void) => on('settings:changed', cb),
  onDownloads: (cb: (d: DownloadInfo[]) => void) => on('downloads:changed', cb),

  tabsState: () => ipcRenderer.invoke('tabs:state'),
  newTab: (url?: string) => ipcRenderer.send('tabs:new', url),
  activate: (id: number) => ipcRenderer.send('tabs:activate', id),
  closeTab: (id: number) => ipcRenderer.send('tabs:close', id),
  go: (url: string) => ipcRenderer.send('nav:go', url),
  back: () => ipcRenderer.send('nav:back'),
  forward: () => ipcRenderer.send('nav:forward'),
  reload: () => ipcRenderer.send('nav:reload'),
  suspendInactive: (): Promise<number> => inv('tabs:suspend-inactive'),
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
  importChrome: (dirs: string[]): Promise<number> => inv('chrome:import', dirs),

  getSettings: (): Promise<Settings> => inv('settings:get'),
  setSettings: (p: Partial<Settings>): Promise<Settings> => inv('settings:set', p),
  pickFolder: (): Promise<string> => inv('dialog:folder'),

  listExtensions: (): Promise<ExtensionInfo[]> => inv('ext:list'),
  addExtension: (): Promise<{ ok?: ExtensionInfo; error?: string } | null> => inv('ext:add'),
  toggleExtension: (key: string, on: boolean): Promise<void> => inv('ext:toggle', key, on),
  removeExtension: (key: string): Promise<void> => inv('ext:remove', key),
  openExtensionsFolder: () => ipcRenderer.send('ext:open-folder'),
  listChromeExtensions: (): Promise<ChromeExtEntry[]> => inv('chromeext:list'),
  importChromeExtensions: (ids: string[]): Promise<number> => inv('chromeext:import', ids),

  getHistory: (q: string): Promise<HistoryEntry[]> => inv('history:get', q),
  removeHistory: (time: number): Promise<void> => inv('history:remove', time),
  listDownloads: (): Promise<DownloadInfo[]> => inv('downloads:list'),
  openDownload: (id: number) => ipcRenderer.send('downloads:open', id),
  showDownload: (id: number) => ipcRenderer.send('downloads:show', id),
  cancelDownload: (id: number) => ipcRenderer.send('downloads:cancel', id),
  clearDownloads: (): Promise<void> => inv('downloads:clear'),
  clearData: (o: ClearOptions): Promise<void> => inv('data:clear', o),

  about: (): Promise<{ version: string; electron: string; chrome: string; node: string }> => inv('app:about'),
  checkUpdate: (): Promise<string> => inv('app:check-update')
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
