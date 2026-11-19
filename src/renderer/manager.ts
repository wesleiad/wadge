import type { ChromeProfile, DownloadInfo, ExtensionInfo, HistoryEntry, Settings } from '../shared/types'
import { icon } from './icons'

const api = window.api
const $ = <T extends HTMLElement>(s: string): T => document.querySelector(s) as T

// ---------- helpers de DOM ----------
type Child = Node | string | null | undefined | false
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls = '', ...kids: Child[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  for (const k of kids) if (k) e.append(k)
  return e
}
const html = (s: string): HTMLElement => { const d = h('div'); d.innerHTML = s; return d.firstElementChild as HTMLElement }

function row(title: string, desc: string, control?: Node, cls = ''): HTMLElement {
  const txt = h('div', 'txt', h('div', 't', title), desc ? h('div', 'd', desc) : null)
  return h('div', 'row ' + cls, txt, control)
}
function card(...rows: Child[]): HTMLElement { return h('div', 'card', ...rows) }
function section(title: string, ic: string, ...kids: Child[]): HTMLElement {
  const w = h('section')
  const t = h('h2')
  t.innerHTML = icon(ic, 18)
  t.append(title)
  w.append(t, ...kids.filter(Boolean) as Node[])
  return w
}
function btn(label: string, cls = '', ic = '', onclick?: () => void): HTMLButtonElement {
  const b = h('button', 'btn ' + cls)
  if (ic) b.innerHTML = icon(ic, 16)
  b.append(label)
  if (onclick) b.onclick = onclick
  return b
}
function toggle(checked: boolean, onchange: (v: boolean) => void): HTMLElement {
  const i = h('input')
  i.type = 'checkbox'
  i.checked = checked
  i.onchange = () => onchange(i.checked)
  return h('label', 'switch', i, h('i'))
}

let S: Settings
async function save(patch: Partial<Settings>): Promise<void> {
  S = await api.setSettings(patch)
}
function textInput(key: 'homepage' | 'searchEngine' | 'vaultUrl', placeholder = ''): HTMLInputElement {
  const i = h('input', 'w-full')
  i.type = 'text'
  i.value = S[key]
  i.placeholder = placeholder
  i.onchange = () => void save({ [key]: i.value.trim() } as Partial<Settings>)
  return i
}
function numberInput(key: 'suspendMinutes' | 'memLimitMB', min: number, def: number): HTMLInputElement {
  const i = h('input')
  i.type = 'number'
  i.min = String(min)
  i.style.width = '110px'
  i.value = String(S[key])
  i.onchange = () => { const v = Math.max(min, Number(i.value) || def); i.value = String(v); void save({ [key]: v } as Partial<Settings>) }
  return i
}

// ---------- páginas ----------
const ENGINES: Array<[string, string]> = [
  ['Google', 'https://www.google.com/search?q=%s'],
  ['Bing', 'https://www.bing.com/search?q=%s'],
  ['DuckDuckGo', 'https://duckduckgo.com/?q=%s'],
  ['Brave', 'https://search.brave.com/search?q=%s'],
  ['Ecosia', 'https://www.ecosia.org/search?q=%s']
]

function pageAppearance(): HTMLElement {
  const sel = h('select')
  for (const [v, l] of [['system', 'Padrão do sistema'], ['light', 'Claro'], ['dark', 'Escuro']]) {
    const o = h('option'); o.value = v; o.textContent = l; sel.append(o)
  }
  sel.value = S.theme
  sel.onchange = () => void save({ theme: sel.value as Settings['theme'] })
  return section('Aparência', 'appearance', card(
    row('Tema', 'Claro, escuro ou o mesmo do Windows', sel),
    row('Mostrar barra de favoritos', 'Exibe os favoritos abaixo da barra de endereço',
      toggle(S.showBookmarksBar, (v) => void save({ showBookmarksBar: v }))),
    row('Página inicial', 'Aberta em novas abas', textInput('homepage', 'https://'), 'col')
  ))
}

function pageSearch(): HTMLElement {
  const sel = h('select')
  for (const [l, u] of ENGINES) { const o = h('option'); o.value = u; o.textContent = l; sel.append(o) }
  const custom = h('option'); custom.value = '__custom'; custom.textContent = 'Personalizado'; sel.append(custom)
  const cur = ENGINES.find(([, u]) => u === S.searchEngine)
  sel.value = cur ? cur[1] : '__custom'
  const inp = textInput('searchEngine', 'https://exemplo.com/?q=%s')
  inp.style.display = cur ? 'none' : ''
  sel.onchange = () => {
    if (sel.value === '__custom') { inp.style.display = ''; inp.focus() }
    else { inp.style.display = 'none'; inp.value = sel.value; void save({ searchEngine: sel.value }) }
  }
  return section('Mecanismo de pesquisa', 'search', card(
    row('Mecanismo usado na barra de endereço', 'Use %s no endereço personalizado onde vai o termo pesquisado', sel),
    h('div', 'row col', inp)
  ))
}

function pageStartup(): HTMLElement {
  const opts: Array<[Settings['startup'], string]> = [
    ['newtab', 'Abrir a página inicial'],
    ['restore', 'Continuar de onde você parou (abas voltam suspensas, sem gastar memória)'],
    ['custom', 'Abrir uma página específica ou um conjunto de páginas']
  ]
  const ta = h('textarea')
  ta.rows = 3
  ta.placeholder = 'Um endereço por linha'
  ta.value = S.startupUrls
  ta.onchange = () => void save({ startupUrls: ta.value })
  const radios = opts.map(([v, l]) => {
    const i = h('input'); i.type = 'radio'; i.name = 'startup'; i.checked = S.startup === v
    i.onchange = () => void save({ startup: v })
    return h('label', 'radio', i, l)
  })
  return section('Ao iniciar', 'startup', card(...radios, h('div', 'row col', ta)))
}

function pagePrivacy(): HTMLElement {
  const opt = { history: true, cookies: true, cache: true, downloads: false }
  const mk = (k: keyof typeof opt, label: string): HTMLElement => {
    const i = h('input'); i.type = 'checkbox'; i.checked = opt[k]; i.onchange = () => { opt[k] = i.checked }
    return h('label', '', i, label)
  }
  const msg = h('span', 'toast')
  const clear = btn('Limpar dados', 'primary', 'trash', async () => {
    await api.clearData(opt)
    msg.textContent = 'Dados apagados ✓'
    setTimeout(() => (msg.textContent = ''), 2500)
  })
  const paused = h('textarea')
  paused.rows = 3
  paused.placeholder = 'Um site por linha (ex.: exemplo.com.br)'
  paused.value = S.adblockPausedSites.join('\n')
  paused.onchange = () => void save({ adblockPausedSites: paused.value.split('\n').map((x) => x.trim().toLowerCase()).filter(Boolean) })
  return h('div', '',
    section('Limpar dados de navegação', 'trash', card(
      h('div', 'row col checks',
        mk('history', 'Histórico de navegação'),
        mk('cookies', 'Cookies e outros dados de sites'),
        mk('cache', 'Imagens e arquivos armazenados em cache'),
        mk('downloads', 'Lista de downloads'),
        h('div', '', clear, msg))
    )),
    section('Segurança e bloqueio', 'shield', card(
      row('Bloquear anúncios e rastreadores', 'AdBlock nativo, na camada de rede', toggle(S.adblockEnabled, (v) => void save({ adblockEnabled: v }))),
      row('Limpar dados ao fechar o navegador', 'Apaga histórico, cookies e cache toda vez que você sair', toggle(S.clearOnExit, (v) => void save({ clearOnExit: v }))),
      row('Sites com o AdBlock pausado', '', paused, 'col')
    ))
  )
}

function pagePerformance(): HTMLElement {
  const msg = h('span', 'toast')
  const now = btn('Suspender agora', '', 'moon', async () => {
    const n = await api.suspendInactive()
    msg.textContent = `${n} aba(s) suspensa(s)`
  })
  return section('Desempenho', 'performance', card(
    row('Suspender abas inativas após (minutos)', 'Abas em segundo plano liberam a memória e recarregam ao clicar', numberInput('suspendMinutes', 1, 5)),
    row('Limite de memória do navegador (MB)', 'Acima disso, abas inativas são suspensas mais cedo', numberInput('memLimitMB', 400, 1200)),
    row('Suspender abas inativas agora', '', h('div', '', now, msg))
  ))
}

function fmtBytes(n: number): string {
  if (n > 1e9) return (n / 1e9).toFixed(1) + ' GB'
  if (n > 1e6) return (n / 1e6).toFixed(1) + ' MB'
  return Math.max(1, Math.round(n / 1e3)) + ' KB'
}

function renderDownloadList(host: HTMLElement, list: DownloadInfo[]): void {
  host.replaceChildren()
  if (!list.length) { host.append(h('div', 'empty', 'Nenhum download ainda')); return }
  for (const d of list) {
    const pct = d.total > 0 ? Math.min(100, (d.received / d.total) * 100) : 0
    const status = d.state === 'completed' ? fmtBytes(d.total || d.received)
      : d.state === 'progressing' ? `${fmtBytes(d.received)}${d.total ? ' de ' + fmtBytes(d.total) : ''}`
      : d.state === 'cancelled' ? 'Cancelado' : 'Falhou'
    const bar = d.state === 'progressing' ? h('div', 'bar', Object.assign(h('b'), { style: `width:${pct}%` })) : null
    const open = h('button', 'icon'); open.title = 'Abrir'; open.innerHTML = icon('open', 18); open.onclick = () => api.openDownload(d.id)
    const show = h('button', 'icon'); show.title = 'Mostrar na pasta'; show.innerHTML = icon('folder', 18); show.onclick = () => api.showDownload(d.id)
    const cancel = h('button', 'icon'); cancel.title = 'Cancelar'; cancel.innerHTML = icon('close', 18); cancel.onclick = () => api.cancelDownload(d.id)
    const ctl = d.state === 'completed' ? [open, show] : d.state === 'progressing' ? [cancel] : []
    host.append(h('div', 'row',
      h('div', 'txt', h('div', 't', d.name), h('div', 'd', status), bar), ...ctl))
  }
}

async function pageDownloads(): Promise<HTMLElement> {
  const dir = h('div', 'd', S.downloadPath || 'Pasta Downloads do Windows')
  const change = btn('Alterar', '', 'folder', async () => {
    const p = await api.pickFolder()
    if (p) { await save({ downloadPath: p }); dir.textContent = p }
  })
  const listHost = h('div')
  renderDownloadList(listHost, await api.listDownloads())
  api.onDownloads((l) => { if (listHost.isConnected) renderDownloadList(listHost, l) })
  const clear = btn('Limpar lista', '', 'trash', () => void api.clearDownloads())
  return h('div', '',
    section('Downloads', 'downloads', card(
      h('div', 'row', h('div', 'txt', h('div', 't', 'Local'), dir), change),
      row('Perguntar onde salvar cada arquivo', '', toggle(S.askDownload, (v) => void save({ askDownload: v })))
    )),
    section('Baixados', 'downloads', card(listHost), h('div', '', clear))
  )
}

function pageVault(): HTMLElement {
  return section('Cofre de senhas (Vault)', 'key', card(
    row('Endereço do cofre', 'Vaultwarden/Bitwarden da empresa. Abre no painel lateral pelo botão Vault.',
      textInput('vaultUrl', 'https://vault.suaempresa.com.br'), 'col'),
    row('Extensão do Bitwarden', 'Para preenchimento automático, carregue a extensão web do Bitwarden na página Extensões.')
  ))
}

async function pageBookmarks(): Promise<HTMLElement> {
  const profiles: ChromeProfile[] = await api.chromeProfiles()
  const msg = h('span', 'toast')
  const list = h('div', 'row col checks')
  if (!profiles.length) list.append(h('div', 'd', 'Nenhum perfil do Chrome encontrado neste computador.'))
  const boxes = profiles.map((p) => {
    const i = h('input'); i.type = 'checkbox'; i.checked = true; i.value = p.dir
    list.append(h('label', '', i, `${p.name} — ${p.count} favoritos (${p.dir})`))
    return i
  })
  const all = btn('Importar tudo do Chrome', 'primary', 'bookmarks', async () => {
    const n = await api.importChrome(profiles.map((p) => p.dir))
    msg.textContent = `${n} item(ns) importado(s) de ${profiles.length} perfil(is) ✓`
  })
  const sel = btn('Importar selecionados', '', '', async () => {
    const dirs = boxes.filter((b) => b.checked).map((b) => b.value)
    if (!dirs.length) return
    msg.textContent = `${await api.importChrome(dirs)} item(ns) importado(s) ✓`
  })
  return section('Favoritos e importação', 'bookmarks', card(
    row('Importar do Google Chrome', 'Lê %LOCALAPPDATA%\\Google\\Chrome\\User Data (todos os perfis)'),
    list,
    h('div', 'row', all, sel, msg)
  ))
}

async function pageExtensions(): Promise<HTMLElement> {
  const wrap = h('div')
  const msg = h('p', 'd')
  const draw = async (): Promise<void> => {
    const list: ExtensionInfo[] = await api.listExtensions()
    const grid = h('div', 'extgrid')
    if (!list.length) grid.append(h('div', 'empty', 'Nenhuma extensão instalada'))
    for (const e of list) {
      const ic = e.icon ? Object.assign(h('img'), { src: e.icon, alt: '' }) : h('div', 'noicon')
      if (!e.icon) ic.innerHTML = icon('extensions', 22)
      const rm = btn('Remover', 'danger', 'trash', async () => { await api.removeExtension(e.key); void draw() })
      grid.append(h('div', 'ext' + (e.enabled ? '' : ' off'),
        h('div', 'head', ic, h('div', '', h('div', 'name', e.name), h('div', 'ver', e.version ? 'v' + e.version : ''))),
        h('div', 'desc', e.description || 'Sem descrição'),
        h('div', 'foot', rm, toggle(e.enabled, async (v) => { await api.toggleExtension(e.key, v); void draw() }))))
    }
    wrap.replaceChildren(grid)
  }
  await draw()
  const add = btn('Carregar sem compactação', 'primary', 'plus', async () => {
    const r = await api.addExtension()
    if (!r) return
    msg.textContent = r.error ? `Erro: ${r.error}` : `Carregada: ${r.ok!.name}`
    void draw()
  })
  const open = btn('Abrir pasta de extensões', '', 'folder', () => api.openExtensionsFolder())
  return h('div', '',
    section('Extensões', 'extensions', card(
      row('Instalar extensão', 'Selecione a pasta descompactada (um .crx precisa ser extraído antes). Ela é copiada para a pasta de extensões e carregada sempre que o navegador abre.'),
      h('div', 'row', add, open)), msg),
    wrap)
}

async function pageHistory(): Promise<HTMLElement> {
  const host = h('div')
  const q = h('input', 'w-full'); q.type = 'text'; q.placeholder = 'Pesquisar no histórico'
  const draw = async (): Promise<void> => {
    const list: HistoryEntry[] = await api.getHistory(q.value)
    host.replaceChildren()
    if (!list.length) { host.append(h('div', 'empty', 'Nenhum item no histórico')); return }
    let last = ''
    let cardEl: HTMLElement | null = null
    for (const e of list) {
      const d = new Date(e.time)
      const day = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
      if (day !== last) { last = day; host.append(h('div', 'hgroup', day)); cardEl = card(); host.append(cardEl) }
      const x = h('button', 'icon'); x.title = 'Remover'; x.innerHTML = icon('close', 16)
      x.onclick = async (ev) => { ev.stopPropagation(); await api.removeHistory(e.time); void draw() }
      const item = h('div', 'hitem',
        h('span', 'time', d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })),
        h('div', 'main', h('div', 'ttl', e.title), h('div', 'url', e.url)), x)
      item.onclick = () => api.newTab(e.url)
      cardEl!.append(item)
    }
  }
  let t: number | undefined
  q.oninput = () => { clearTimeout(t); t = window.setTimeout(() => void draw(), 200) }
  const clear = btn('Limpar dados de navegação…', '', 'trash', () => go('privacy'))
  await draw()
  return h('div', '', section('Histórico', 'history', card(h('div', 'row', q, clear))), host)
}

async function pageAbout(): Promise<HTMLElement> {
  const a = await api.about()
  const msg = h('span', 'toast')
  const chk = btn('Verificar atualizações', 'primary', 'reload', async () => {
    msg.textContent = 'Verificando…'
    msg.textContent = await api.checkUpdate()
  })
  return section('Sobre o WD - Navegador', 'about', card(
    row('WD - Navegador', `Versão ${a.version}`, h('div', '', chk, msg)),
    row('Motor', `Chromium ${a.chrome} · Electron ${a.electron} · Node ${a.node}`),
    row('Créditos', 'Feito por Weslei Domingues - 2026')
  ))
}

// ---------- navegação ----------
interface Page { label: string; ic: string; render: () => HTMLElement | Promise<HTMLElement>; searchable: boolean }
const PAGES: Record<string, Page> = {
  appearance: { label: 'Aparência', ic: 'appearance', render: pageAppearance, searchable: true },
  search: { label: 'Mecanismo de pesquisa', ic: 'search', render: pageSearch, searchable: true },
  startup: { label: 'Ao iniciar', ic: 'startup', render: pageStartup, searchable: true },
  privacy: { label: 'Privacidade e segurança', ic: 'shield', render: pagePrivacy, searchable: true },
  performance: { label: 'Desempenho', ic: 'performance', render: pagePerformance, searchable: true },
  downloads: { label: 'Downloads', ic: 'downloads', render: pageDownloads, searchable: false },
  vault: { label: 'Cofre de senhas', ic: 'key', render: pageVault, searchable: true },
  bookmarks: { label: 'Favoritos', ic: 'bookmarks', render: pageBookmarks, searchable: false },
  extensions: { label: 'Extensões', ic: 'extensions', render: pageExtensions, searchable: false },
  history: { label: 'Histórico', ic: 'history', render: pageHistory, searchable: false },
  about: { label: 'Sobre o WD - Navegador', ic: 'about', render: pageAbout, searchable: false }
}
const SEP_AFTER = new Set(['vault', 'history'])

let current = 'appearance'
async function show(id: string): Promise<void> {
  current = PAGES[id] ? id : 'appearance'
  document.querySelectorAll('.navitem').forEach((n) => n.classList.toggle('active', (n as HTMLElement).dataset.id === current))
  const page = $('#page')
  page.style.animation = 'none'
  void page.offsetWidth
  page.style.animation = ''
  page.replaceChildren(await PAGES[current].render())
  $('main').scrollTop = 0
}
function go(id: string): void { $<HTMLInputElement>('#q').value = ''; void show(id) }

function buildNav(): void {
  const nav = $('#nav')
  for (const [id, p] of Object.entries(PAGES)) {
    const n = h('div', 'navitem')
    n.dataset.id = id
    n.innerHTML = icon(p.ic, 20)
    n.append(p.label)
    n.onclick = () => go(id)
    nav.append(n)
    if (SEP_AFTER.has(id)) nav.append(h('div', 'navsep'))
  }
}

// busca: filtra as linhas das páginas estáticas
function search(q: string): void {
  const term = q.trim().toLowerCase()
  if (!term) { void show(current); return }
  const page = $('#page')
  page.replaceChildren()
  let found = 0
  for (const p of Object.values(PAGES)) {
    if (!p.searchable) continue
    const el = p.render() as HTMLElement
    const keep = [...el.querySelectorAll<HTMLElement>('.row, .radio')].filter((r) => r.textContent!.toLowerCase().includes(term))
    if (!keep.length && !p.label.toLowerCase().includes(term)) continue
    found += keep.length
    el.querySelectorAll<HTMLElement>('.row, .radio').forEach((r) => { if (!keep.includes(r)) r.remove() })
    page.append(el)
  }
  if (!found && !page.childElementCount) page.append(h('div', 'empty', 'Nenhuma configuração encontrada'))
}

async function init(): Promise<void> {
  S = await api.getSettings()
  $('#searchicon').innerHTML = icon('search', 18)
  buildNav()
  $<HTMLInputElement>('#q').oninput = (e) => search((e.target as HTMLInputElement).value)
  api.onManagerTab((t) => go(t))
  await show(new URLSearchParams(location.search).get('tab') ?? 'appearance')
}
void init()
