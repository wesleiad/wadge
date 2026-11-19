import { BrowserWindow, WebContents, WebContentsView, Menu, clipboard } from 'electron'
import { getSettings, onSettingsChange } from './settings'
import { resetBlocked } from './adblock'
import { recordVisit, updateTitle } from './history'
import type { TabInfo, TabsState, SessionTab } from '../shared/types'

/** abas 40 + barra 44 (+ favoritos 30 quando visível) */
export const chromeHeight = (): number => (getSettings().showBookmarksBar ? 114 : 84)

interface Tab {
  id: number
  url: string
  title: string
  favicon: string
  loading: boolean
  view: WebContentsView | null
  lastActive: number
}

export interface ExtHooks {
  addTab(wc: WebContents): void
  selectTab(wc: WebContents): void
}

export function normalizeInput(input: string): string {
  const t = input.trim()
  if (!t) return getSettings().homepage
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^(about|data|file|chrome-extension):/i.test(t)) return t
  if (/^localhost(:\d+)?(\/|$)/i.test(t) || (/^[^\s/]+\.[^\s/]{2,}(\/.*)?$/.test(t) && !/\s/.test(t))) {
    return 'https://' + t
  }
  return getSettings().searchEngine.replace('%s', encodeURIComponent(t))
}

export class TabManager {
  tabs: Tab[] = []
  activeId = -1
  private nextId = 1
  private vaultView: WebContentsView | null = null
  vaultOpen = false
  private vaultUrl = ''
  private changeListeners: Array<() => void> = []

  constructor(
    private win: BrowserWindow,
    private ext: ExtHooks
  ) {
    win.on('resize', () => this.layout())
    this.vaultUrl = getSettings().vaultUrl
    onSettingsChange((st) => {
      // só reage se a URL do cofre mudou (não em tema/adblock etc.)
      this.layout()
      if (st.vaultUrl === this.vaultUrl) return
      this.vaultUrl = st.vaultUrl
      if (this.vaultView) this.loadVault()
    })
  }

  onChange(cb: () => void): void {
    this.changeListeners.push(cb)
  }
  private emit(): void {
    this.changeListeners.forEach((l) => l())
  }

  get active(): Tab | undefined {
    return this.tabs.find((t) => t.id === this.activeId)
  }

  snapshot(): TabsState {
    return {
      activeId: this.activeId,
      tabs: this.tabs.map<TabInfo>((t) => {
        const wc = t.view?.webContents
        return {
          id: t.id,
          title: t.title || t.url || 'Nova aba',
          url: t.url,
          favicon: t.favicon,
          loading: t.loading,
          canGoBack: !!wc && wc.navigationHistory.canGoBack(),
          canGoForward: !!wc && wc.navigationHistory.canGoForward(),
          suspended: !t.view,
          active: t.id === this.activeId
        }
      })
    }
  }

  // ---------- criação / ciclo de vida ----------
  private makeView(tab: Tab): void {
    const view = new WebContentsView({
      webPreferences: { sandbox: true, contextIsolation: true }
    })
    tab.view = view
    const wc = view.webContents
    this.ext.addTab(wc)

    wc.on('page-title-updated', (_e, title) => {
      tab.title = title
      updateTitle(wc.getURL(), title)
      this.emit()
    })
    wc.on('page-favicon-updated', (_e, favs) => {
      tab.favicon = favs[0] ?? ''
      this.emit()
    })
    wc.on('did-start-loading', () => {
      tab.loading = true
      this.emit()
    })
    wc.on('did-stop-loading', () => {
      tab.loading = false
      tab.url = wc.getURL() || tab.url
      this.emit()
    })
    wc.on('did-navigate', (_e, url) => {
      tab.url = url
      recordVisit(url, wc.getTitle())
      this.emit()
    })
    wc.on('did-navigate-in-page', (_e, url, isMain) => {
      if (isMain) tab.url = url
      this.emit()
    })
    wc.on('did-start-navigation', (d) => {
      if (d.isMainFrame && !d.isSameDocument) resetBlocked(wc.id)
    })
    wc.setWindowOpenHandler(({ url }) => {
      this.createTab(url, true)
      return { action: 'deny' }
    })
    wc.on('context-menu', (_e, p) => {
      const items: Electron.MenuItemConstructorOptions[] = []
      if (p.linkURL) {
        items.push(
          { label: 'Abrir link em nova aba', click: () => this.createTab(p.linkURL, true) },
          { label: 'Copiar endereço do link', click: () => clipboard.writeText(p.linkURL) },
          { type: 'separator' }
        )
      }
      if (p.selectionText) items.push({ role: 'copy', label: 'Copiar' })
      if (p.isEditable) items.push({ role: 'paste', label: 'Colar' })
      items.push(
        { label: 'Voltar', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
        { label: 'Recarregar', click: () => wc.reload() },
        { type: 'separator' },
        { label: 'Inspecionar', click: () => wc.inspectElement(p.x, p.y) }
      )
      Menu.buildFromTemplate(items).popup({ window: this.win })
    })
    wc.on('render-process-gone', () => {
      tab.loading = false
      this.emit()
    })
  }

  createTab(input: string, activate = true): Tab {
    const url = normalizeInput(input)
    const tab: Tab = {
      id: this.nextId++,
      url,
      title: '',
      favicon: '',
      loading: true,
      view: null,
      lastActive: Date.now()
    }
    this.tabs.push(tab)
    this.makeView(tab)
    tab.view!.webContents.loadURL(url).catch(() => undefined)
    if (activate || this.activeId === -1) this.activate(tab.id)
    else this.emit()
    return tab
  }

  private resume(tab: Tab): void {
    if (tab.view) return
    this.makeView(tab)
    tab.loading = true
    tab.view!.webContents.loadURL(tab.url).catch(() => undefined)
  }

  activate(id: number): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab) return
    const prev = this.active
    if (prev && prev !== tab) {
      prev.lastActive = Date.now()
      if (prev.view) this.win.contentView.removeChildView(prev.view)
    }
    this.resume(tab)
    this.activeId = id
    tab.lastActive = Date.now()
    this.win.contentView.addChildView(tab.view!)
    this.layout()
    this.ext.selectTab(tab.view!.webContents)
    tab.view!.webContents.focus()
    this.emit()
  }

  private destroyView(tab: Tab): void {
    if (!tab.view) return
    try {
      this.win.contentView.removeChildView(tab.view)
    } catch {
      /* já removida */
    }
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()
    tab.view = null
  }

  closeTab(id: number): void {
    const i = this.tabs.findIndex((t) => t.id === id)
    if (i < 0) return
    const tab = this.tabs[i]
    this.destroyView(tab)
    this.tabs.splice(i, 1)
    if (this.tabs.length === 0) {
      this.activeId = -1
      this.createTab(getSettings().homepage)
    } else if (id === this.activeId) {
      this.activate(this.tabs[Math.min(i, this.tabs.length - 1)].id)
    } else this.emit()
  }

  closeByWebContents(wc: WebContents): void {
    const t = this.tabs.find((x) => x.view?.webContents === wc)
    if (t) this.closeTab(t.id)
  }
  activateByWebContents(wc: WebContents): void {
    const t = this.tabs.find((x) => x.view?.webContents === wc)
    if (t) this.activate(t.id)
  }

  cycle(dir: 1 | -1): void {
    if (this.tabs.length < 2) return
    const i = this.tabs.findIndex((t) => t.id === this.activeId)
    this.activate(this.tabs[(i + dir + this.tabs.length) % this.tabs.length].id)
  }

  // ---------- sessão, zoom, impressão ----------
  sessionTabs(): SessionTab[] {
    return this.tabs
      .filter((t) => /^(https?|file):/i.test(t.url))
      .map((t) => ({ url: t.url, title: t.title }))
  }

  /** Abre abas já suspensas (sem processo) — a primeira fica ativa. */
  restoreTabs(list: SessionTab[]): void {
    list.forEach((st, i) => {
      if (i === 0) {
        this.createTab(st.url, true)
        return
      }
      this.tabs.push({
        id: this.nextId++, url: st.url, title: st.title, favicon: '', loading: false,
        view: null, lastActive: Date.now()
      })
    })
    this.emit()
  }

  zoom(delta: number): void {
    const wc = this.active?.view?.webContents
    if (!wc) return
    wc.setZoomLevel(delta === 0 ? 0 : Math.max(-4, Math.min(6, wc.getZoomLevel() + delta)))
  }
  print(): void {
    this.active?.view?.webContents.print()
  }

  // ---------- Tab Suspender ----------
  suspend(id: number): boolean {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || !tab.view || tab.id === this.activeId) return false
    tab.url = tab.view.webContents.getURL() || tab.url
    this.destroyView(tab) // libera o processo de renderização (RAM)
    this.emit()
    return true
  }

  /** olderThanMs = 0 suspende todas as inativas (manual). Automático ignora abas com áudio. */
  suspendInactive(olderThanMs = 0): number {
    let n = 0
    for (const t of [...this.tabs]) {
      if (t.id === this.activeId || !t.view) continue
      if (olderThanMs > 0) {
        if (Date.now() - t.lastActive < olderThanMs) continue
        if (t.view.webContents.isCurrentlyAudible()) continue
      }
      if (this.suspend(t.id)) n++
    }
    return n
  }

  // ---------- navegação da aba ativa ----------
  navigate(input: string): void {
    const tab = this.active
    if (!tab) { this.createTab(input); return }
    tab.url = normalizeInput(input)
    if (!tab.view) this.makeView(tab)
    if (!this.win.contentView.children.includes(tab.view!)) this.win.contentView.addChildView(tab.view!)
    tab.view!.webContents.loadURL(tab.url).catch(() => undefined)
    this.layout()
  }
  back(): void {
    this.active?.view?.webContents.navigationHistory.goBack()
  }
  forward(): void {
    this.active?.view?.webContents.navigationHistory.goForward()
  }
  reload(): void {
    const wc = this.active?.view?.webContents
    if (wc?.isLoading()) wc.stop()
    else wc?.reload()
  }
  devtools(): void {
    this.active?.view?.webContents.openDevTools({ mode: 'detach' })
  }

  // ---------- Vault (painel lateral) ----------
  private closeVaultView(): void {
    if (!this.vaultView) return
    try {
      this.win.contentView.removeChildView(this.vaultView)
    } catch {
      /* ok */
    }
    if (!this.vaultView.webContents.isDestroyed()) this.vaultView.webContents.close()
    this.vaultView = null
  }

  private vaultPage(title: string, msg: string, retry = false): string {
    const html =
      '<meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
      ':root{color-scheme:light dark}body{font:14px Segoe UI,sans-serif;margin:0;padding:20px;' +
      'background:Canvas;color:CanvasText;word-wrap:break-word}h3{margin:0 0 10px}' +
      'a{color:#5865f2}code{opacity:.8}</style><body><h3>' + title + '</h3><p>' + msg + '</p>' +
      (retry ? '<p><a href="' + this.vaultUrl + '">Tentar novamente</a></p>' : '') + '</body>'
    return 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
  }

  private loadVault(): void {
    const wc = this.vaultView?.webContents
    if (!wc) return
    if (!this.vaultUrl) {
      void wc.loadURL(this.vaultPage('Vault',
        'Configure a URL do cofre (Vaultwarden/Bitwarden) em <b>Menu ⋮ → Configurações</b>.'))
      return
    }
    void wc.loadURL(normalizeInput(this.vaultUrl)).catch(() => undefined)
  }

  toggleVault(): void {
    this.vaultOpen = !this.vaultOpen
    if (this.vaultOpen) {
      if (!this.vaultView) {
        this.vaultView = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true } })
        const wc = this.vaultView.webContents
        wc.setWindowOpenHandler(({ url }) => {
          this.createTab(url, true)
          return { action: 'deny' }
        })
        wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
          if (!isMain || code === -3 || url.startsWith('data:')) return
          void wc.loadURL(this.vaultPage('Não foi possível abrir o cofre',
            `Endereço: <code>${this.vaultUrl}</code><br>Erro: ${desc} (${code}).<br>` +
            'Verifique a rede/VPN e a URL em Configurações.', true))
        })
        this.ext.addTab(wc)
        this.loadVault()
      }
      this.win.contentView.addChildView(this.vaultView)
    } else if (this.vaultView) {
      this.win.contentView.removeChildView(this.vaultView)
    }
    this.layout()
    this.emit()
    if (this.vaultOpen) this.vaultView?.webContents.focus()
  }

  /** Largura responsiva do painel: ~30% da janela, entre 320 e 460 px (em janelas estreitas, até a janela toda). */
  private vaultWidth(winW: number): number {
    if (!this.vaultOpen) return 0
    if (winW < 720) return winW
    return Math.min(460, Math.max(320, Math.round(winW * 0.3)))
  }

  private layout(): void {
    const [w, h] = this.win.getContentSize()
    const sb = this.vaultWidth(w)
    const height = Math.max(0, h - chromeHeight())
    const tab = this.active
    if (tab?.view) tab.view.setBounds({ x: 0, y: chromeHeight(), width: Math.max(0, w - sb), height })
    if (this.vaultView && this.vaultOpen)
      this.vaultView.setBounds({ x: w - sb, y: chromeHeight(), width: sb, height })
  }
}
