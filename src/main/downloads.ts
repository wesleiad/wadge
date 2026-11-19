import { app, dialog, Notification, shell, type BrowserWindow, type Session } from 'electron'
import { join, parse } from 'path'
import { existsSync } from 'fs'
import { getSettings } from './settings'
import type { DownloadInfo } from '../shared/types'

const items: DownloadInfo[] = []
const live = new Map<number, Electron.DownloadItem>()
let nextId = 1
let notify: () => void = () => undefined

function uniquePath(p: string): string {
  if (!existsSync(p)) return p
  const { dir, name, ext } = parse(p)
  for (let i = 1; ; i++) {
    const c = join(dir, `${name} (${i})${ext}`)
    if (!existsSync(c)) return c
  }
}

export function initDownloads(ses: Session, win: BrowserWindow, onChange: () => void): void {
  notify = onChange
  ses.on('will-download', (_e, item) => {
    const s = getSettings()
    const dir = s.downloadPath || app.getPath('downloads')
    let target = uniquePath(join(dir, item.getFilename()))
    if (s.askDownload) {
      const chosen = dialog.showSaveDialogSync(win, { defaultPath: target })
      if (!chosen) {
        item.cancel()
        return
      }
      target = chosen
    }
    item.setSavePath(target)
    const rec: DownloadInfo = {
      id: nextId++, name: parse(target).base, url: item.getURL(), path: target,
      state: 'progressing', received: 0, total: item.getTotalBytes(), time: Date.now()
    }
    items.unshift(rec)
    if (items.length > 200) items.length = 200
    live.set(rec.id, item)
    item.on('updated', () => {
      rec.received = item.getReceivedBytes()
      rec.total = item.getTotalBytes()
      notify()
    })
    item.once('done', (_ev, state) => {
      rec.state = state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted'
      rec.received = item.getReceivedBytes()
      live.delete(rec.id)
      notify()
      if (rec.state === 'completed') {
        const n = new Notification({ title: 'Download concluído', body: rec.name })
        n.on('click', () => shell.showItemInFolder(rec.path))
        n.show()
      }
    })
    notify()
  })
}

export const listDownloads = (): DownloadInfo[] => items
export function openDownload(id: number): void {
  const d = items.find((x) => x.id === id)
  if (d) void shell.openPath(d.path)
}
export function showDownload(id: number): void {
  const d = items.find((x) => x.id === id)
  if (d) shell.showItemInFolder(d.path)
}
export function cancelDownload(id: number): void {
  live.get(id)?.cancel()
}
export function clearDownloads(): void {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].state !== 'progressing') items.splice(i, 1)
  notify()
}
