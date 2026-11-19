// Ícones em traço único (line-art): tinta = currentColor, 24x24, pontas arredondadas.
// Cada <path> usa pathLength=1 para o efeito "caneta desenhando" ao passar o mouse.
const P: Record<string, string[]> = {
  back: ['M15 5.2c-2.2 2.4-4.6 4.8-7 6.8 2.4 2.2 4.8 4.6 7 6.8'],
  forward: ['M9 5.2c2.2 2.4 4.6 4.8 7 6.8-2.4 2.2-4.8 4.6-7 6.8'],
  reload: ['M19.2 12.4a7.2 7.2 0 1 1-2.3-5.4', 'M19.4 4.4v4.2h-4.2'],
  stop: ['M6.4 6.2c4 3.8 7.2 7.6 11.2 11.6', 'M17.6 6.2C13.6 10 10.4 13.8 6.4 17.8'],
  star: ['M12 4.2l2.5 5.2 5.6.7-4.1 3.9 1 5.6-5-2.7-5 2.7 1-5.6L3.9 10.1l5.6-.7z'],
  shield: ['M12 3.2l7 2.8v5.2c0 4.7-2.9 7.9-7 9.6-4.1-1.7-7-4.9-7-9.6V6z', 'M9.2 11.8l2.1 2.1 3.6-3.9'],
  key: ['M9.5 14.6a4.1 4.1 0 1 1 3.4-3.5L20.4 11v3.2h-2.6v2.6h-2.7v-2.4h-2.2', 'M7.4 9.3v.01'],
  moon: ['M19.8 14.3A8 8 0 0 1 9.7 4.2a8 8 0 1 0 10.1 10.1z', 'M15.5 5.2v3M14 6.7h3'],
  theme: ['M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2z', 'M12 3.4v17.2', 'M12 7.2a4.8 4.8 0 0 1 0 9.6'],
  menu: ['M12 5.6v.01', 'M12 12v.01', 'M12 18.4v.01'],
  plus: ['M12 5.2v13.6', 'M5.2 12h13.6'],
  close: ['M6.8 6.8l10.4 10.4', 'M17.2 6.8L6.8 17.2'],
  folder: ['M3.6 7.2c0-.9.7-1.6 1.6-1.6h3.9l2 2.2h7.7c.9 0 1.6.7 1.6 1.6v7.8c0 .9-.7 1.6-1.6 1.6H5.2c-.9 0-1.6-.7-1.6-1.6z'],
  appearance: ['M12 3.4a8.6 8.6 0 1 0 0 17.2c1.3 0 1.9-.9 1.5-1.9-.5-1.2.2-2.4 1.5-2.4h1.6a3.6 3.6 0 0 0 3.6-3.6C20.2 7 16.6 3.4 12 3.4z', 'M7.8 11v.01', 'M10.4 7.6v.01', 'M14.4 7.8v.01'],
  search: ['M10.8 4.4a6.4 6.4 0 1 0 0 12.8 6.4 6.4 0 0 0 0-12.8z', 'M15.6 15.6l4.8 4.8'],
  startup: ['M12 3.6v8', 'M7.2 6.4a7.6 7.6 0 1 0 9.6 0'],
  performance: ['M4.2 16.6a7.9 7.9 0 1 1 15.6 0', 'M12 16.6l3.6-4.6', 'M12 16.6v.01'],
  downloads: ['M12 4.2v10.6', 'M7.4 10.6l4.6 4.6 4.6-4.6', 'M5 19.8h14'],
  bookmarks: ['M7.2 4.2h9.6v15.6L12 16l-4.8 3.8z'],
  extensions: ['M5.2 9.2h3.1a2 2 0 1 1 3.9 0h3.1v3.1a2 2 0 1 1 0 3.9v3.2H5.2z'],
  history: ['M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4z', 'M12 7.6v4.8l3.2 2'],
  about: ['M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4z', 'M12 11v5.2', 'M12 8v.01'],
  trash: ['M5.2 7h13.6', 'M9.6 7V4.8h4.8V7', 'M6.8 7l.8 12.2h8.8L17.2 7'],
  open: ['M13.6 5h5.4v5.4', 'M19 5l-8 8', 'M17 14v4.2H5.8V7h4.2']
}

const SW: Record<string, string> = { menu: ' dot' }

export function icon(name: string, size = 20): string {
  const d = P[name] ?? P.about
  const paths = d.map((p) => `<path d="${p}" pathLength="1"/>`).join('')
  return `<svg class="ic${SW[name] ?? ''}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`
}

/** Substitui todo [data-icon] pelo SVG correspondente. */
export function hydrateIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon!, Number(el.dataset.size) || 20))
    el.removeAttribute('data-icon')
  })
}
