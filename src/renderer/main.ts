import type { TabsState, AdblockStatus, BookmarkNode, Settings } from '../shared/types'
import { icon, hydrateIcons } from './icons'

const $ = <T extends HTMLElement>(s: string): T => document.querySelector(s) as T
const api = window.api

hydrateIcons()

const tabsEl = $('#tabs')
const address = $<HTMLInputElement>('#address')
let state: TabsState = { tabs: [], activeId: -1 }
let bookmarkUrls = new Set<string>()

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls = '', text = ''
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

// Abas são reaproveitadas por id (sem recriar o DOM): evita o "piscar" e repetir as animações.
interface TabEl { root: HTMLElement; fav: HTMLElement; title: HTMLElement; favUrl: string; ph: boolean }
const tabEls = new Map<number, TabEl>()
const plus = el('button')
plus.id = 'newtab'
plus.title = 'Nova aba (Ctrl+T)'
plus.innerHTML = icon('plus', 16)
plus.onclick = () => api.newTab()

function makeTab(id: number): TabEl {
  const root = el('div', 'tab')
  const fav = el('span', 'ph')
  const title = el('span', 'title')
  const x = el('button', 'x')
  x.innerHTML = icon('close', 14)
  x.onclick = (e) => { e.stopPropagation(); api.closeTab(id) }
  root.append(fav, title, x)
  root.onclick = () => api.activate(id)
  root.onauxclick = (e) => { if (e.button === 1) api.closeTab(id) }
  return { root, fav, title, favUrl: '', ph: true }
}

function renderTabs(): void {
  const live = new Set(state.tabs.map((t) => t.id))
  for (const [id, te] of tabEls) if (!live.has(id)) { te.root.remove(); tabEls.delete(id) }
  let prev: Element | null = null
  for (const t of state.tabs) {
    let te = tabEls.get(t.id)
    if (!te) { te = makeTab(t.id); tabEls.set(t.id, te) }
    const r = te.root
    r.classList.toggle('active', t.active)
    r.classList.toggle('suspended', t.suspended)
    r.classList.toggle('loading', t.loading)
    const tip = t.suspended ? `${t.title} (suspensa)` : t.title
    if (r.title !== tip) r.title = tip
    if (te.title.textContent !== t.title) te.title.textContent = t.title
    const wantImg = !!t.favicon && !t.loading
    if (wantImg && (te.ph || te.favUrl !== t.favicon)) {
      const img = el('img', 'fav')
      img.src = t.favicon
      img.onerror = () => { const ph = el('span', 'ph'); img.replaceWith(ph); te!.fav = ph; te!.ph = true; te!.favUrl = '' }
      te.fav.replaceWith(img); te.fav = img; te.ph = false; te.favUrl = t.favicon
    } else if (!wantImg && !te.ph && t.loading) {
      const ph = el('span', 'ph'); te.fav.replaceWith(ph); te.fav = ph; te.ph = true; te.favUrl = ''
    }
    // posição correta (só move se necessário)
    const expected: Element | null = prev ? prev.nextElementSibling : tabsEl.firstElementChild
    if (expected !== r) tabsEl.insertBefore(r, expected)
    prev = r
  }
  if (plus.parentElement !== tabsEl || tabsEl.lastElementChild !== plus) tabsEl.append(plus)

  const a = state.tabs.find((t) => t.active)
  $<HTMLButtonElement>('#back').disabled = !a?.canGoBack
  $<HTMLButtonElement>('#forward').disabled = !a?.canGoForward
  $('#reload').classList.toggle('spin', !!a?.loading)
  $('#star').classList.toggle('starred', !!a && bookmarkUrls.has(a.url))
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

// Favoritar, Vault, memória, tema, menu
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
  api.appMenu(Math.round(r.right - 240), Math.round(r.bottom))
}

// Barra de favoritos
function flat(list: BookmarkNode[], out: Set<string>): void {
  for (const n of list) { if (n.url) out.add(n.url); if (n.children) flat(n.children, out) }
}
function renderBookmarks(list: BookmarkNode[]): void {
  bookmarkUrls = new Set()
  flat(list, bookmarkUrls)
  const bar = $('#bookmarks')
  bar.replaceChildren()
  if (!list.length) {
    bar.append(el('span', 'empty', 'Nenhum favorito. Use a estrela ou importe do Chrome pelo menu.'))
  }
  for (const n of list) {
    const b = el('button')
    b.innerHTML = (n.type === 'folder' ? icon('folder', 15) : '') + `<span></span>`
    b.querySelector('span')!.textContent = n.name
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
  renderTabs()
}
api.onBookmarks((b) => renderBookmarks(b as BookmarkNode[]))
void api.getBookmarks().then(renderBookmarks)

// Mostrar/ocultar a barra de favoritos (configuração)
const applySettings = (s: Settings): void => { $('#bookmarks').classList.toggle('hidden', !s.showBookmarksBar) }
api.onSettings(applySettings)
void api.getSettings().then(applySettings)
