import type { TabsState, AdblockStatus, BookmarkNode } from '../shared/types'

const $ = <T extends HTMLElement>(s: string): T => document.querySelector(s) as T
const api = window.api

const tabsEl = $('#tabs')
const address = $<HTMLInputElement>('#address')
let state: TabsState = { tabs: [], activeId: -1 }

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls = '', text = ''
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

function renderTabs(): void {
  tabsEl.replaceChildren()
  for (const t of state.tabs) {
    const tab = el('div', 'tab' + (t.active ? ' active' : '') + (t.suspended ? ' suspended' : ''))
    tab.title = t.suspended ? `${t.title} (suspensa)` : t.title
    if (t.favicon) {
      const img = el('img', 'fav')
      img.src = t.favicon
      tab.append(img)
    } else tab.append(el('span', 'fav ph'))
    tab.append(el('span', 'title', (t.suspended ? '💤 ' : t.loading ? '… ' : '') + t.title))
    const x = el('button', 'x', '✕')
    x.onclick = (e) => { e.stopPropagation(); api.closeTab(t.id) }
    tab.append(x)
    tab.onclick = () => api.activate(t.id)
    tab.onauxclick = (e) => { if (e.button === 1) api.closeTab(t.id) }
    tabsEl.append(tab)
  }
  const plus = el('button', '', '+')
  plus.id = 'newtab'
  plus.title = 'Nova aba (Ctrl+T)'
  plus.onclick = () => api.newTab()
  tabsEl.append(plus)

  const a = state.tabs.find((t) => t.active)
  $<HTMLButtonElement>('#back').disabled = !a?.canGoBack
  $<HTMLButtonElement>('#forward').disabled = !a?.canGoForward
  $('#reload').textContent = a?.loading ? '✕' : '⟳'
  if (document.activeElement !== address) address.value = a?.url?.startsWith('data:') ? '' : (a?.url ?? '')
}

api.onTabs((s) => { state = s as TabsState; renderTabs() })
void api.tabsState().then((s: TabsState) => { state = s; renderTabs() })

$('#back').onclick = () => api.back()
$('#forward').onclick = () => api.forward()
$('#reload').onclick = () => api.reload()
address.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { api.go(address.value); address.blur() }
  if (e.key === 'Escape') { address.blur(); renderTabs() }
})
address.addEventListener('focus', () => address.select())
api.onFocusAddress(() => address.focus())

// AdBlock
function renderAdblock(s: AdblockStatus): void {
  const b = $('#adblock')
  const active = s.enabled && !s.pausedHere
  b.classList.toggle('off', !active)
  $('#blocked').textContent = active && s.blocked ? String(s.blocked) : ''
  b.title = !s.enabled ? 'AdBlock pausado (global)' : s.pausedHere ? `AdBlock pausado em ${s.host}` : 'AdBlock ativo'
}
api.onAdblock((s) => renderAdblock(s as AdblockStatus))
void api.adblockStatus().then(renderAdblock)
$('#adblock').onclick = (e) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  api.adblockMenu(Math.round(r.left), Math.round(r.bottom))
}

// Favoritar, Vault, memória, menu
$('#star').onclick = () => api.addBookmark()
$('#vault').onclick = () => api.toggleVault()
api.onVault((open) => $('#vault').classList.toggle('on', open))
api.onMemory((mb) => { $('#mem').textContent = `RAM ${mb} MB` })
$('#suspend').onclick = async () => {
  const n = await api.suspendInactive()
  $('#suspend').title = `${n} aba(s) suspensa(s) agora`
}
$('#theme').onclick = (e) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  api.themeMenu(Math.round(r.right - 140), Math.round(r.bottom))
}
$('#menu').onclick = (e) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  api.appMenu(Math.round(r.right - 180), Math.round(r.bottom))
}

// Barra de favoritos
function renderBookmarks(list: BookmarkNode[]): void {
  const bar = $('#bookmarks')
  bar.replaceChildren()
  if (!list.length) {
    bar.append(el('span', 'empty', 'Nenhum favorito. Use ☆ ou importe do Chrome pelo menu ⋮.'))
    return
  }
  for (const n of list) {
    const b = el('button', '', (n.type === 'folder' ? '📁 ' : '') + n.name)
    b.title = n.url ?? n.name
    b.onclick = () => {
      if (n.type === 'url') api.openBookmark(n.id)
      else {
        const r = b.getBoundingClientRect()
        api.folderMenu(n.id, Math.round(r.left), Math.round(r.bottom))
      }
    }
    b.oncontextmenu = (e) => { e.preventDefault(); api.bookmarkContext(n.id) }
    bar.append(b)
  }
}
api.onBookmarks((b) => renderBookmarks(b as BookmarkNode[]))
void api.getBookmarks().then(renderBookmarks)
