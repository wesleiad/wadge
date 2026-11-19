import { app } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import type { BookmarkNode, ChromeProfile } from '../shared/types'

const file = (): string => join(app.getPath('userData'), 'bookmarks.json')
let bar: BookmarkNode[] | null = null
const listeners: Array<() => void> = []

export function onBookmarksChange(cb: () => void): void {
  listeners.push(cb)
}

function save(): void {
  writeFileSync(file(), JSON.stringify(bar, null, 2))
  listeners.forEach((l) => l())
}

export function getBookmarks(): BookmarkNode[] {
  if (!bar) {
    try {
      bar = JSON.parse(readFileSync(file(), 'utf8'))
    } catch {
      bar = []
    }
  }
  return bar!
}

export function addBookmark(name: string, url: string): void {
  const list = getBookmarks()
  if (list.some((b) => b.url === url)) return
  list.push({ id: randomUUID(), type: 'url', name: name || url, url })
  save()
}

function removeFrom(list: BookmarkNode[], id: string): boolean {
  const i = list.findIndex((b) => b.id === id)
  if (i >= 0) {
    list.splice(i, 1)
    return true
  }
  return list.some((b) => b.children && removeFrom(b.children, id))
}

export function removeBookmark(id: string): void {
  if (removeFrom(getBookmarks(), id)) save()
}

export function findBookmark(id: string, list = getBookmarks()): BookmarkNode | undefined {
  for (const b of list) {
    if (b.id === id) return b
    const f = b.children && findBookmark(id, b.children)
    if (f) return f
  }
}

// ---------- Importação do Chrome ----------
const chromeRoot = (): string =>
  join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'User Data')

interface ChromeNode {
  type: string
  name: string
  url?: string
  children?: ChromeNode[]
}

function convert(n: ChromeNode): BookmarkNode | null {
  if (n.type === 'url' && n.url) return { id: randomUUID(), type: 'url', name: n.name, url: n.url }
  if (n.type === 'folder') {
    return {
      id: randomUUID(),
      type: 'folder',
      name: n.name,
      children: (n.children ?? []).map(convert).filter((x): x is BookmarkNode => !!x)
    }
  }
  return null
}

function countNodes(list: ChromeNode[] = []): number {
  return list.reduce((s, n) => s + (n.type === 'url' ? 1 : countNodes(n.children)), 0)
}

function readProfile(dir: string): Record<string, { children?: ChromeNode[] }> | null {
  try {
    const raw = JSON.parse(readFileSync(join(chromeRoot(), dir, 'Bookmarks'), 'utf8'))
    return raw.roots
  } catch {
    return null
  }
}

export function listChromeProfiles(): ChromeProfile[] {
  const root = chromeRoot()
  if (!existsSync(root)) return []
  let names: Record<string, { name?: string }> = {}
  try {
    names = JSON.parse(readFileSync(join(root, 'Local State'), 'utf8')).profile?.info_cache ?? {}
  } catch {
    /* sem Local State */
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (d.name === 'Default' || /^Profile \d+$/.test(d.name)))
    .map((d) => {
      const roots = readProfile(d.name)
      if (!roots) return null
      const count = countNodes(roots.bookmark_bar?.children) + countNodes(roots.other?.children)
      return { dir: d.name, name: names[d.name]?.name ?? d.name, count }
    })
    .filter((p): p is ChromeProfile => !!p)
}

export function importChrome(dirs: string[]): number {
  const list = getBookmarks()
  let added = 0
  for (const dir of dirs) {
    const roots = readProfile(dir)
    if (!roots) continue
    const fromBar = (roots.bookmark_bar?.children ?? []).map(convert).filter((x): x is BookmarkNode => !!x)
    for (const node of fromBar) {
      if (node.type === 'url' && list.some((b) => b.url === node.url)) continue
      if (node.type === 'folder') {
        const i = list.findIndex((b) => b.type === 'folder' && b.name === node.name)
        if (i >= 0) list.splice(i, 1)
      }
      list.push(node)
      added++
    }
    const other = (roots.other?.children ?? []).map(convert).filter((x): x is BookmarkNode => !!x)
    if (other.length) {
      const name = `Outros favoritos (${dir})`
      const i = list.findIndex((b) => b.type === 'folder' && b.name === name)
      if (i >= 0) list.splice(i, 1)
      list.push({ id: randomUUID(), type: 'folder', name, children: other })
      added += other.length
    }
  }
  save()
  return added
}
