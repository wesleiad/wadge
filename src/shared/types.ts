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
  theme: 'system' | 'light' | 'dark'
}

export interface ChromeProfile {
  dir: string
  name: string
  count: number
}

export interface ExtensionInfo {
  id: string
  name: string
  version: string
  path: string
}
