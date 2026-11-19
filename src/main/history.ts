import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import type { HistoryEntry } from '../shared/types'

const file = (): string => join(app.getPath('userData'), 'history.json')
const MAX = 5000
let list: HistoryEntry[] | null = null
let timer: NodeJS.Timeout | null = null

function all(): HistoryEntry[] {
  if (!list) {
    try {
      list = JSON.parse(readFileSync(file(), 'utf8'))
    } catch {
      list = []
    }
  }
  return list!
}

export function flushHistory(): void {
  if (timer) clearTimeout(timer)
  timer = null
  if (list) writeFileSync(file(), JSON.stringify(list))
}

function save(): void {
  if (!timer) timer = setTimeout(flushHistory, 3000)
}

export function recordVisit(url: string, title: string): void {
  if (!/^https?:/i.test(url)) return
  const l = all()
  const last = l[0]
  if (last && last.url === url && Date.now() - last.time < 5000) {
    if (title) last.title = title
  } else {
    l.unshift({ url, title: title || url, time: Date.now() })
    if (l.length > MAX) l.length = MAX
  }
  save()
}

export function updateTitle(url: string, title: string): void {
  const e = all().find((x) => x.url === url)
  if (e && title) {
    e.title = title
    save()
  }
}

export function getHistory(q = '', limit = 500): HistoryEntry[] {
  const t = q.trim().toLowerCase()
  const l = t ? all().filter((e) => e.title.toLowerCase().includes(t) || e.url.toLowerCase().includes(t)) : all()
  return l.slice(0, limit)
}

export function removeHistory(time: number): void {
  const l = all()
  const i = l.findIndex((e) => e.time === time)
  if (i >= 0) {
    l.splice(i, 1)
    save()
  }
}

export function clearHistory(): void {
  list = []
  save()
}
