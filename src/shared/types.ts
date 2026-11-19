export interface TabInfo {
  id: number
  title: string
  url: string
  favicon: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  suspended: boolean
  active: boolean
}

export interface TabsState {
  tabs: TabInfo[]
  activeId: number
}

export interface AdblockStatus {
  enabled: boolean // bloqueador global ligado
  pausedHere: boolean // pausado para o site atual
  host: string
  blocked: number
}

export interface BookmarkNode {
  id: string
  type: 'url' | 'folder'
  name: string
  url?: string
  children?: BookmarkNode[]
}

export interface Settings {
  homepage: string
  searchEngine: string // use %s para o termo
  suspendMinutes: number
  vaultUrl: string
  adblockEnabled: boolean
  adblockPausedSites: string[]
  importPrompted: boolean
  memLimitMB: number
  showBookmarksBar: boolean
  startup: 'newtab' | 'restore' | 'custom'
  startupUrls: string
  downloadPath: string
  askDownload: boolean
  clearOnExit: boolean
  disabledExtensions: string[]
  schema: number
  theme: 'system' | 'light' | 'dark'
}

export interface ChromeProfile {
  dir: string
  name: string
  count: number
}

export interface ExtensionInfo {
  key: string // nome da pasta em extensions/
  id: string // id carregado (vazio se desativada)
  name: string
  version: string
  description: string
  path: string
  enabled: boolean
  icon: string // data URL
}

export interface HistoryEntry {
  url: string
  title: string
  time: number
}

export interface DownloadInfo {
  id: number
  name: string
  url: string
  path: string
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted'
  received: number
  total: number
  time: number
}

export interface ClearOptions {
  history: boolean
  cookies: boolean
  cache: boolean
  downloads: boolean
}

export interface SessionTab {
  url: string
  title: string
}
