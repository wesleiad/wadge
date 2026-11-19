import { app, BrowserWindow, nativeTheme, Menu, ipcMain, dialog, shell, session, type MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { TabManager, CHROME_HEIGHT } from './tabs'
import { getSettings, updateSettings } from './settings'
import { initAdblock, applyAdblock, getBlocked, isPausedHost, setGlobalAdblock, toggleSite } from './adblock'
import {
  getBookmarks, addBookmark, removeBookmark, findBookmark, onBookmarksChange,
  listChromeProfiles, importChrome
} from './bookmarks'
import {
  loadAllExtensions, listExtensions, addExtension, removeExtension, extensionsDir
} from './extensions'
import type { AdblockStatus, BookmarkNode, Settings } from '../shared/types'

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

let win: BrowserWindow
let manager: BrowserWindow | null = null
let tabs: TabManager

function pageUrl(page: string, query = ''): { file?: string; url?: string; query: string } {
  const dev = process.env['ELECTRON_RENDERER_URL']
  return dev
    ? { url: `${dev}/${page}.html`, query }
    : { file: join(__dirname, `../renderer/${page}.html`), query }
}

function load(w: BrowserWindow, page: string, query = ''): void {
  const p = pageUrl(page, query)
  if (p.url) void w.loadURL(p.url + (query ? '?' + query : ''))
  else void w.loadFile(p.file!, { search: query })
}

function openManager(tab: 'settings' | 'extensions' | 'bookmarks'): void {
  if (manager && !manager.isDestroyed()) {
    manager.focus()
    manager.webContents.send('manager:tab', tab)
    return
  }
  manager = new BrowserWindow({
    width: 780, height: 600, parent: win, title: 'WD — Gerenciar', icon: join(__dirname, '../../build/icon.png'),
    autoHideMenuBar: true, backgroundColor: '#1e1f22',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true }
  })
  manager.removeMenu()
  load(manager, 'manager', 'tab=' + tab)
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
    ? { color: '#1e1f22', symbolColor: '#e3e5e8', height: 40 }
    : { color: '#e9eaee', symbolColor: '#1d1e22', height: 40 }

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
        { label: 'Ferramentas de desenvolvedor', accelerator: 'F12', click: () => tabs.devtools() }
      ]
    }
  ]))
}

function addCurrentBookmark(): void {
  const t = tabs.active
  if (t && /^https?:/i.test(t.url)) addBookmark(t.title, t.url)
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
    Menu.buildFromTemplate([
      { label: 'Remover favorito', click: () => removeBookmark(id) }
    ]).popup({ window: win })
  })
  ipcMain.handle('chrome:profiles', () => listChromeProfiles())
  ipcMain.handle('chrome:import', (_e, dirs: string[]) => importChrome(dirs))

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const s = updateSettings(patch)
    applyAdblock()
    pushState()
    return s
  })

  ipcMain.handle('ext:list', () => listExtensions(ses))
  ipcMain.handle('ext:add', async () => {
    const r = await dialog.showOpenDialog(manager ?? win, {
      title: 'Selecione a pasta da extensão (descompactada)', properties: ['openDirectory']
    })
    if (r.canceled || !r.filePaths[0]) return null
    try { return { ok: await addExtension(ses, r.filePaths[0]) } }
    catch (e) { return { error: (e as Error).message } }
  })
  ipcMain.handle('ext:remove', (_e, id: string) => { removeExtension(ses, id) })
  ipcMain.on('ext:open-folder', () => { void shell.openPath(extensionsDir()) })

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
    Menu.buildFromTemplate([
      { label: 'Nova aba', click: () => tabs.createTab(getSettings().homepage) },
      { type: 'separator' },
      { label: 'Importar tudo do Chrome', click: () => {
          const ps = listChromeProfiles()
          const n = importChrome(ps.map((p) => p.dir))
          void dialog.showMessageBox(win, { message: `${n} item(ns) importado(s) de ${ps.length} perfil(is) do Chrome.` })
        } },
      { label: 'Importar favoritos do Chrome…', click: () => openManager('bookmarks') },
      { label: 'Extensões…', click: () => openManager('extensions') },
      { label: 'Configurações…', click: () => openManager('settings') },
      { type: 'separator' },
      { label: 'Ferramentas de desenvolvedor', click: () => tabs.devtools() },
      { label: 'Sobre / Créditos', click: () => {
          void dialog.showMessageBox(win, {
            type: 'info', title: 'Sobre', message: 'WD - Navegador',
            detail: `Versão ${app.getVersion()}

Feito por Weslei Domingues - 2026`
          })
        } },
      { label: 'Sair', click: () => app.quit() }
    ]).popup({ window: win, x, y })
  })
}

async function main(): Promise<void> {
  await app.whenReady()
  const ses = session.defaultSession
  nativeTheme.themeSource = getSettings().theme

  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 800, minHeight: 500, title: 'WD - Navegador', icon: join(__dirname, '../../build/icon.png'),
    backgroundColor: '#1e1f22', autoHideMenuBar: true,
    titleBarStyle: 'hidden', titleBarOverlay: overlay(),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true }
  })
  win.setMenuBarVisibility(false)

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
  onBookmarksChange(() => win.webContents.send('bookmarks:changed', getBookmarks()))
  registerIpc(ses)
  buildAppMenu()

  load(win, 'index')
  await new Promise<void>((r) => win.webContents.once('did-finish-load', () => r()))

  // AdBlock e extensões antes da primeira página (com limite de tempo)
  await Promise.race([
    Promise.all([initAdblock(ses), loadAllExtensions(ses)]),
    new Promise((r) => setTimeout(r, 8000))
  ])

  tabs.createTab(getSettings().homepage)

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

  // Primeira abertura: oferece importar favoritos do Chrome
  if (!getSettings().importPrompted) {
    updateSettings({ importPrompted: true })
    if (listChromeProfiles().length) openManager('bookmarks')
  }
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
})
app.on('window-all-closed', () => app.quit())
void main()
void CHROME_HEIGHT
