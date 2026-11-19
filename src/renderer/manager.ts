import type { ChromeProfile, ExtensionInfo, Settings } from '../shared/types'

const api = window.api
const $ = <T extends HTMLElement>(s: string): T => document.querySelector(s) as T

function showTab(name: string): void {
  document.querySelectorAll('section').forEach((s) => s.classList.toggle('active', s.id === name))
  document.querySelectorAll<HTMLButtonElement>('nav button').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === name))
  if (name === 'extensions') void loadExtensions()
  if (name === 'bookmarks') void loadProfiles()
}
document.querySelectorAll<HTMLButtonElement>('nav button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab!)))
api.onManagerTab(showTab)
showTab(new URLSearchParams(location.search).get('tab') ?? 'settings')

// ---- Configurações ----
const text = ['homepage', 'searchEngine', 'vaultUrl'] as const
void api.getSettings().then((s: Settings) => {
  text.forEach((k) => ($<HTMLInputElement>('#' + k).value = s[k]))
  $<HTMLInputElement>('#suspendMinutes').value = String(s.suspendMinutes)
  $<HTMLInputElement>('#adblockEnabled').checked = s.adblockEnabled
  $<HTMLTextAreaElement>('#adblockPausedSites').value = s.adblockPausedSites.join('\n')
})
$('#saveSettings').onclick = async () => {
  const patch: Partial<Settings> = {
    homepage: $<HTMLInputElement>('#homepage').value.trim() || 'https://www.google.com',
    searchEngine: $<HTMLInputElement>('#searchEngine').value.trim() || 'https://www.google.com/search?q=%s',
    vaultUrl: $<HTMLInputElement>('#vaultUrl').value.trim(),
    suspendMinutes: Math.max(1, Number($<HTMLInputElement>('#suspendMinutes').value) || 5),
    adblockEnabled: $<HTMLInputElement>('#adblockEnabled').checked,
    adblockPausedSites: $<HTMLTextAreaElement>('#adblockPausedSites').value
      .split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean)
  }
  await api.setSettings(patch)
  $('#saved').textContent = 'Salvo ✓'
  setTimeout(() => ($('#saved').textContent = ''), 2000)
}

// ---- Extensões ----
async function loadExtensions(): Promise<void> {
  const list: ExtensionInfo[] = await api.listExtensions()
  const ul = $('#extList')
  ul.replaceChildren()
  if (!list.length) ul.innerHTML = '<li>Nenhuma extensão carregada.</li>'
  for (const e of list) {
    const li = document.createElement('li')
    const info = document.createElement('div')
    info.className = 'grow'
    info.textContent = `${e.name} v${e.version}`
    const small = document.createElement('small')
    small.textContent = e.path
    info.append(small)
    const rm = document.createElement('button')
    rm.textContent = 'Remover'
    rm.onclick = async () => { await api.removeExtension(e.id); void loadExtensions() }
    li.append(info, rm)
    ul.append(li)
  }
}
$('#addExt').onclick = async () => {
  const r = await api.addExtension()
  if (!r) return
  $('#extMsg').textContent = r.error ? `Erro: ${r.error}` : `Carregada: ${r.ok.name}`
  void loadExtensions()
}
$('#openExt').onclick = () => api.openExtensionsFolder()

// ---- Importar favoritos do Chrome ----
async function loadProfiles(): Promise<void> {
  const profiles: ChromeProfile[] = await api.chromeProfiles()
  const ul = $('#profiles')
  ul.replaceChildren()
  if (!profiles.length) ul.innerHTML = '<li>Nenhum perfil do Chrome encontrado.</li>'
  for (const p of profiles) {
    const li = document.createElement('li')
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = true
    cb.value = p.dir
    const info = document.createElement('div')
    info.className = 'grow'
    info.textContent = p.name
    const small = document.createElement('small')
    small.textContent = `${p.dir} — ${p.count} favoritos`
    info.append(small)
    li.append(cb, info)
    ul.append(li)
  }
}
$('#importBtn').onclick = async () => {
  const dirs = [...document.querySelectorAll<HTMLInputElement>('#profiles input:checked')].map((c) => c.value)
  if (!dirs.length) return
  const n = await api.importChrome(dirs)
  $('#importMsg').textContent = `${n} item(ns) importado(s) ✓`
}
