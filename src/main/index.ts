import { app, BrowserWindow, nativeTheme, Menu, ipcMain, dialog, shell, session, type MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { autoUpdater } from 'electron-updater'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { TabManager } from './tabs'
import { getSettings, updateSettings } from './settings'
import { initAdblock, applyAdblock, getBlocked, isPausedHost, setGlobalAdblock, toggleSite } from './adblock'
import {
  getBookmarks, addBookmark, removeBookmark, findBookmark, onBookmarksChange,
  listChromeProfiles, importChrome
} from './bookmarks'
import {
  loadAllExtensions, listExtensions, addExtension, removeExtension, setExtensionEnabled, extensionsDir
} from './extensions'
import { getHistory, removeHistory, clearHistory, flushHistory } from './history'
import {
  initDownloads, listDownloads, openDownload, showDownload, cancelDownload, clearDownloads
} from './downloads'
import type { AdblockStatus, BookmarkNode, ClearOptions, SessionTab, Settings } from '../shared/types'

// ---- Economia de memória (antes do app ficar pronto) ----
app.commandLine.appendSwitch('enable-low-end-device-mode')
app.commandLine.appendSwitch('renderer-process-limit', '6')
app.commandLine.appendSwitch('disk-cache-size', String(100 * 1024 * 1024))
app.commandLine.appendSwitch('js-flags', '--max-lazy --optimize-for-size')
app.commandLine.appendSwitch(
  'disable-features',
  'MediaRouter,OptimizationHints,Translate,InterestFeedContentSuggestions,AutofillServerCommunication,CalculateNativeWinOcclusion'
)
app.setName('WD - Navegador')
// mantém a pasta de dados antiga (configurações, favoritos) mesmo com o novo nome
app.setPath('userData', process.env.WD_USER_DATA || join(app.getPath('appData'), 'WADGE'))
if (!app.requestSingleInstanceLock()) app.quit()

const ICON = join(__dirname, '../../build/icon.png')
let win: BrowserWindow
let manager: BrowserWindow | null = null
let tabs: TabManager

function load(w: BrowserWindow, page: string, query = ''): void {
  const dev = process.env['ELECTRON_RENDERER_URL']
  if (dev) void w.loadURL(`${dev}/${page}.html${query ? '?' + query : ''}`)
  else void w.loadFile(join(__dirname, `../renderer/${page}.html`), { search: query })
}

function openManager(page = 'appearance'): void {
  if (manager && !manager.isDestroyed()) {
    manager.focus()
    manager.webContents.send('manager:tab', page)
    return
  }
  manager = new BrowserWindow({
    width: 1040, height: 700, minWidth: 720, minHeight: 480, title: 'WD - Configurações', icon: ICON,
    autoHideMenuBar: true, backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1f3a' : '#fdfcf8',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true }
  })
  manager.removeMenu()
  load(manager, 'manager', 'tab=' + page)
}

function adblockStatus(): AdblockStatus {
  const t = tabs?.active
  let host = ''
  try { host = t ? new URL(t.url).hostname : '' } catch { /* url inválida */ }
  return {
    enabled: getSettings().adblockEnabled,
    pausedHere: !!host && isPausedHost(host),
    host,
    blocked: t?.view ? getBlocked(t.view.webContents.id) : 0
  }
}

const overlay = (): { color: string; symbolColor: string; height: number } =>
  nativeTheme.shouldUseDarkColors
    ? { color: '#151833', symbolColor: '#e8e4d8', height: 40 }
    : { color: '#ece8da', symbolColor: '#1c1c1c', height: 40 }

function applyTheme(): void {
  nativeTheme.themeSource = getSettings().theme
  if (win && !win.isDestroyed()) win.setTitleBarOverlay(overlay())
}

function pushState(): void {
  if (win.isDestroyed()) return
  win.webContents.send('tabs:state', tabs.snapshot())
  win.webContents.send('adblock:status', adblockStatus())
  win.webContents.send('vault:state', tabs.vaultOpen)
}

function folderMenu(nodes: BookmarkNode[]): MenuItemConstructorOptions[] {
  if (!nodes.length) return [{ label: '(vazio)', enabled: false }]
  return nodes.map((n) =>
    n.type === 'folder'
      ? { label: n.name, submenu: folderMenu(n.children ?? []) }
      : { label: n.name.slice(0, 60) || n.url, click: () => tabs.createTab(n.url!, true) }
  )
}

function addCurrentBookmark(): void {
  const t = tabs.active
  if (t && /^https?:/i.test(t.url)) addBookmark(t.title, t.url)
}

async function clearData(ses: Electron.Session, o: ClearOptions): Promise<void> {
  if (o.history) clearHistory()
  if (o.downloads) clearDownloads()
  if (o.cache) await ses.clearCache()
  if (o.cookies)
    await ses.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage']
    })
}

function buildAppMenu(): void {
  const focusAddr = (): void => win.webContents.send('ui:focus-address')
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Navegador',
      submenu: [
        { label: 'Nova aba', accelerator: 'CmdOrCtrl+T', click: () => tabs.createTab(getSettings().homepage) },
        { label: 'Fechar aba', accelerator: 'CmdOrCtrl+W', click: () => tabs.closeTab(tabs.activeId) },
        { label: 'Endereço', accelerator: 'CmdOrCtrl+L', click: focusAddr },
        { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => tabs.reload() },
        { label: 'Recarregar (F5)', accelerator: 'F5', click: () => tabs.reload() },
        { label: 'Próxima aba', accelerator: 'Ctrl+Tab', click: () => tabs.cycle(1) },
        { label: 'Aba anterior', accelerator: 'Ctrl+Shift+Tab', click: () => tabs.cycle(-1) },
        { label: 'Voltar', accelerator: 'Alt+Left', click: () => tabs.back() },
        { label: 'Avançar', accelerator: 'Alt+Right', click: () => tabs.forward() },
        { label: 'Favoritar', accelerator: 'CmdOrCtrl+D', click: () => addCurrentBookmark() },
        { label: 'Histórico', accelerator: 'CmdOrCtrl+H', click: () => openManager('history') },
        { label: 'Downloads', accelerator: 'CmdOrCtrl+J', click: () => openManager('downloads') },
        { label: 'Limpar dados de navegação', accelerator: 'CmdOrCtrl+Shift+Delete', click: () => openManager('privacy') },
        { label: 'Imprimir', accelerator: 'CmdOrCtrl+P', click: () => tabs.print() },
        { label: 'Aumentar zoom', accelerator: 'CmdOrCtrl+Plus', click: () => tabs.zoom(0.5) },
        { label: 'Aumentar zoom (=)', accelerator: 'CmdOrCtrl+=', click: () => tabs.zoom(0.5) },
        { label: 'Diminuir zoom', accelerator: 'CmdOrCtrl+-', click: () => tabs.zoom(-0.5) },
        { label: 'Zoom 100%', accelerator: 'CmdOrCtrl+0', click: () => tabs.zoom(0) },
        { label: 'Ferramentas de desenvolvedor', accelerator: 'F12', click: () => tabs.devtools() }
      ]
    }
  ]))
}

/** Menu principal (⋮) no estilo do Chrome, em português. */
function appMenuTemplate(): MenuItemConstructorOptions[] {
  const s = getSettings()
  const recent = getHistory('', 8)
  const themeItem = (label: string, theme: Settings['theme']): MenuItemConstructorOptions => ({
    label, type: 'radio', checked: s.theme === theme,
    click: () => { updateSettings({ theme }); applyTheme() }
  })
  return [
    { label: 'Nova aba', accelerator: 'Ctrl+T', click: () => tabs.createTab(s.homepage) },
    { type: 'separator' },
    {
      label: 'Histórico',
      submenu: [
        { label: 'Mostrar histórico completo', accelerator: 'Ctrl+H', click: () => openManager('history') },
        { type: 'separator' },
        ...(recent.length
          ? recent.map<MenuItemConstructorOptions>((h) => ({
              label: (h.title || h.url).slice(0, 60), click: () => tabs.createTab(h.url, true)
            }))
          : [{ label: '(vazio)', enabled: false }])
      ]
    },
    { label: 'Downloads', accelerator: 'Ctrl+J', click: () => openManager('downloads') },
    {
      label: 'Favoritos',
      submenu: [
        { label: 'Favoritar esta página', accelerator: 'Ctrl+D', click: () => addCurrentBookmark() },
        { label: 'Mostrar barra de favoritos', type: 'checkbox', checked: s.showBookmarksBar,
          click: () => { updateSettings({ showBookmarksBar: !s.showBookmarksBar }); win.webContents.send('settings:changed', getSettings()) } },
        { label: 'Importar do Chrome…', click: () => openManager('bookmarks') },
        { type: 'separator' },
        ...folderMenu(getBookmarks())
      ]
    },
    { label: 'Extensões', click: () => openManager('extensions') },
    { type: 'separator' },
    {
      label: 'Zoom',
      submenu: [
        { label: 'Aumentar', accelerator: 'Ctrl+Plus', click: () => tabs.zoom(0.5) },
        { label: 'Diminuir', accelerator: 'Ctrl+-', click: () => tabs.zoom(-0.5) },
        { label: 'Redefinir (100%)', accelerator: 'Ctrl+0', click: () => tabs.zoom(0) }
      ]
    },
    { label: 'Imprimir…', accelerator: 'Ctrl+P', click: () => tabs.print() },
    {
      label: 'Mais ferramentas',
      submenu: [
        { label: 'Limpar dados de navegação…', accelerator: 'Ctrl+Shift+Del', click: () => openManager('privacy') },
        { label: 'Suspender abas inativas agora', click: () => tabs.suspendInactive(0) },
        { label: 'Ferramentas do desenvolvedor', accelerator: 'F12', click: () => tabs.devtools() }
      ]
    },
    { label: 'Tema', submenu: [themeItem('Claro', 'light'), themeItem('Escuro', 'dark'), themeItem('Sistema', 'system')] },
    { type: 'separator' },
    { label: 'Configurações', click: () => openManager('appearance') },
    { label: 'Sobre o WD - Navegador', click: () => openManager('about') },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() }
  ]
}

function registerIpc(ses: Electron.Session): void {
  ipcMain.handle('tabs:state', () => tabs.snapshot())
  ipcMain.on('tabs:new', (_e, url?: string) => tabs.createTab(url || getSettings().homepage))
  ipcMain.on('tabs:activate', (_e, id: number) => tabs.activate(id))
  ipcMain.on('tabs:close', (_e, id: number) => tabs.closeTab(id))
  ipcMain.on('nav:go', (_e, url: string) => tabs.navigate(url))
  ipcMain.on('nav:back', () => tabs.back())
  ipcMain.on('nav:forward', () => tabs.forward())
  ipcMain.on('nav:reload', () => tabs.reload())
  ipcMain.handle('tabs:suspend-inactive', () => tabs.suspendInactive(0))
  ipcMain.on('vault:toggle', () => tabs.toggleVault())

  ipcMain.handle('adblock:status', () => adblockStatus())
  ipcMain.on('adblock:menu', (_e, x: number, y: number) => {
    const s = adblockStatus()
    Menu.buildFromTemplate([
      { label: `Bloquear em ${s.host || 'este site'}`, type: 'checkbox', checked: !s.pausedHere, enabled: !!s.host && s.enabled,
        click: () => { toggleSite(s.host); applyAdblock(); tabs.active?.view?.webContents.reload() } },
      { label: 'AdBlock ativo (global)', type: 'checkbox', checked: s.enabled,
        click: () => { setGlobalAdblock(!s.enabled); pushState() } },
      { type: 'separator' },
      { label: `${s.blocked} requisições bloqueadas nesta página`, enabled: false }
    ]).popup({ window: win, x, y })
  })

  ipcMain.handle('bookmarks:get', () => getBookmarks())
  ipcMain.on('bookmarks:add-current', () => addCurrentBookmark())
  ipcMain.on('bookmarks:open', (_e, id: string) => {
    const b = findBookmark(id)
    if (b?.url) tabs.navigate(b.url)
  })
  ipcMain.on('bookmarks:folder', (_e, id: string, x: number, y: number) => {
    const f = findBookmark(id)
    Menu.buildFromTemplate(folderMenu(f?.children ?? [])).popup({ window: win, x, y })
  })
  ipcMain.on('bookmarks:context', (_e, id: string) => {
    Menu.buildFromTemplate([{ label: 'Remover favorito', click: () => removeBookmark(id) }]).popup({ window: win })
  })
  ipcMain.handle('chrome:profiles', () => listChromeProfiles())
  ipcMain.handle('chrome:import', (_e, dirs: string[]) => importChrome(dirs))

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const s = updateSettings(patch)
    if ('theme' in patch) applyTheme()
    applyAdblock()
    pushState()
    if (!win.isDestroyed()) win.webContents.send('settings:changed', s)
    return s
  })
  ipcMain.handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(manager ?? win, { properties: ['openDirectory'] })
    return r.canceled ? '' : r.filePaths[0]
  })

  // extensões
  ipcMain.handle('ext:list', () => listExtensions(ses))
  ipcMain.handle('ext:add', async () => {
    const r = await dialog.showOpenDialog(manager ?? win, {
      title: 'Selecione a pasta da extensão (descompactada)', properties: ['openDirectory']
    })
    if (r.canceled || !r.filePaths[0]) return null
    try { return { ok: await addExtension(ses, r.filePaths[0]) } }
    catch (e) { return { error: (e as Error).message } }
  })
  ipcMain.handle('ext:toggle', (_e, key: string, on: boolean) => setExtensionEnabled(ses, key, on))
  ipcMain.handle('ext:remove', (_e, key: string) => { removeExtension(ses, key) })
  ipcMain.on('ext:open-folder', () => { void shell.openPath(extensionsDir()) })

  // histórico, downloads, dados
  ipcMain.handle('history:get', (_e, q: string) => getHistory(q))
  ipcMain.handle('history:remove', (_e, time: number) => removeHistory(time))
  ipcMain.handle('downloads:list', () => listDownloads())
  ipcMain.on('downloads:open', (_e, id: number) => openDownload(id))
  ipcMain.on('downloads:show', (_e, id: number) => showDownload(id))
  ipcMain.on('downloads:cancel', (_e, id: number) => cancelDownload(id))
  ipcMain.handle('downloads:clear', () => clearDownloads())
  ipcMain.handle('data:clear', (_e, o: ClearOptions) => clearData(ses, o))

  ipcMain.handle('app:about', () => ({
    version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome,
    node: process.versions.node
  }))
  ipcMain.handle('app:check-update', async () => {
    if (!app.isPackaged) return 'A verificação só funciona no app instalado.'
    try {
      const r = await autoUpdater.checkForUpdates()
      return r?.isUpdateAvailable ? `Nova versão ${r.updateInfo.version} encontrada: baixando…` : 'Você está na versão mais recente.'
    } catch {
      return 'Não foi possível verificar agora.'
    }
  })

  ipcMain.on('theme:menu', (_e, x: number, y: number) => {
    const cur = getSettings().theme
    const item = (label: string, theme: Settings['theme']): MenuItemConstructorOptions => ({
      label, type: 'radio', checked: cur === theme,
      click: () => { updateSettings({ theme }); applyTheme() }
    })
    Menu.buildFromTemplate([item('Claro', 'light'), item('Escuro', 'dark'), item('Sistema', 'system')])
      .popup({ window: win, x, y })
  })
  ipcMain.on('app:menu', (_e, x: number, y: number) => {
    Menu.buildFromTemplate(appMenuTemplate()).popup({ window: win, x, y })
  })
}

const sessionFile = (): string => join(app.getPath('userData'), 'session.json')
let sessionTimer: NodeJS.Timeout | null = null
function saveSession(): void {
  if (sessionTimer) return
  sessionTimer = setTimeout(() => {
    sessionTimer = null
    try { writeFileSync(sessionFile(), JSON.stringify(tabs.sessionTabs())) } catch { /* ignora */ }
  }, 2000)
}

function startupTabs(): void {
  const s = getSettings()
  if (s.startup === 'restore') {
    try {
      const list: SessionTab[] = JSON.parse(readFileSync(sessionFile(), 'utf8'))
      if (list.length) return tabs.restoreTabs(list)
    } catch { /* sem sessão anterior */ }
  } else if (s.startup === 'custom') {
    const urls = s.startupUrls.split('\n').map((u) => u.trim()).filter(Boolean)
    if (urls.length) return tabs.restoreTabs(urls.map((url) => ({ url: url.includes('://') ? url : 'https://' + url, title: '' })))
  }
  tabs.createTab(s.homepage)
}

async function main(): Promise<void> {
  await app.whenReady()
  const ses = session.defaultSession
  nativeTheme.themeSource = getSettings().theme

  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 800, minHeight: 500, title: 'WD - Navegador', icon: ICON,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1f3a' : '#fdfcf8', autoHideMenuBar: true,
    titleBarStyle: 'hidden', titleBarOverlay: overlay(),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true }
  })
  win.setMenuBarVisibility(false)
  nativeTheme.on('updated', () => { if (!win.isDestroyed()) win.setTitleBarOverlay(overlay()) })

  const extensions = new ElectronChromeExtensions({
    session: ses,
    createTab: async (details) => {
      const t = tabs.createTab(details.url || getSettings().homepage, details.active !== false)
      return [t.view!.webContents, win]
    },
    selectTab: (wc) => tabs.activateByWebContents(wc),
    removeTab: (wc) => tabs.closeByWebContents(wc),
    createWindow: async () => win
  })
  tabs = new TabManager(win, {
    addTab: (wc) => extensions.addTab(wc, win),
    selectTab: (wc) => extensions.selectTab(wc)
  })
  tabs.onChange(pushState)
  tabs.onChange(saveSession)
  onBookmarksChange(() => win.webContents.send('bookmarks:changed', getBookmarks()))
  initDownloads(ses, win, () => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('downloads:changed', listDownloads())
  })
  registerIpc(ses)
  buildAppMenu()

  load(win, 'index')
  await new Promise<void>((r) => win.webContents.once('did-finish-load', () => r()))

  // AdBlock e extensões antes da primeira página (com limite de tempo)
  await Promise.race([
    Promise.all([initAdblock(ses), loadAllExtensions(ses)]),
    new Promise((r) => setTimeout(r, 8000))
  ])

  startupTabs()

  // Barra de memória + suspensão automática
  setInterval(() => {
    const mb = app.getAppMetrics().reduce((s, m) => s + m.memory.workingSetSize, 0) / 1024
    if (!win.isDestroyed()) win.webContents.send('memory', Math.round(mb))
  }, 4000)
  setInterval(() => {
    const s = getSettings()
    tabs.suspendInactive(s.suspendMinutes * 60_000)
    // pressão de memória: acima do limite, suspende inativas há mais de 30 s
    const mb = app.getAppMetrics().reduce((t, m) => t + m.memory.workingSetSize, 0) / 1024
    if (mb > s.memLimitMB) tabs.suspendInactive(30_000)
  }, 15_000)

  // Atualização automática (GitHub Releases) — só no app instalado
  if (app.isPackaged) {
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('error', (e) => console.error('Atualização:', e?.message))
    autoUpdater.on('update-downloaded', (info) => {
      void dialog
        .showMessageBox(win, {
          type: 'info', buttons: ['Reiniciar agora', 'Depois'], defaultId: 0,
          message: `WD - Navegador ${info.version} baixado.`, detail: 'Reinicie para concluir a atualização.'
        })
        .then((r) => { if (r.response === 0) autoUpdater.quitAndInstall() })
    })
    const check = (): void => { autoUpdater.checkForUpdates().catch(() => undefined) }
    check()
    setInterval(check, 4 * 60 * 60_000)
  }

  if (process.env.WD_OPEN_MANAGER) openManager(process.env.WD_OPEN_MANAGER)

  // Primeira abertura: oferece importar favoritos do Chrome
  if (!getSettings().importPrompted) {
    updateSettings({ importPrompted: true })
    if (listChromeProfiles().length) openManager('bookmarks')
  }
}

let cleaned = false
app.on('before-quit', (e) => {
  flushHistory()
  if (tabs) try { writeFileSync(sessionFile(), JSON.stringify(tabs.sessionTabs())) } catch { /* ignora */ }
  if (getSettings().clearOnExit && !cleaned) {
    e.preventDefault()
    cleaned = true
    void clearData(session.defaultSession, { history: true, cookies: true, cache: true, downloads: true })
      .finally(() => app.quit())
  }
})
app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
})
app.on('window-all-closed', () => app.quit())
void main()
