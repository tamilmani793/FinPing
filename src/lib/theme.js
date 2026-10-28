import { useSyncExternalStore } from 'react'

// Colour themes = a palette (the accent colours and the tint of the backgrounds) x a mode (light / dark / follow the phone).
// Everything in the app reads CSS variables, so applying a theme only sets those variables on <html>.
const PALETTE_KEY = 'finping_palette'
const MODE_KEY = 'finping_mode'

export const PALETTES = {
  cardamon: {
    name: 'Cardamon', swatch: ['#B8924A', '#D6455D'],
    primary: '#B8924A', dim: '#8E6B2A', light: '#E8D29A', grad: ['#EBD6A1', '#C9A45C', '#B58E45'], onPrimary: '#3A2A10', accent: '#D6455D', accentBg: '#FCDDE1',
    L: { bg0: '#FBF5EC', bg2: '#F8F0E3', bg3: '#EFE4CF', txt: '#2A2119', txt2: '#75665A', txt3: '#A89A8B', line: '90,60,20' },
    D: { bg0: '#16120E', bg1: '#201B16', bg2: '#2A241D', bg3: '#352D24', txt: '#F3EBDD', txt2: '#B5A794', txt3: '#7F7364', line: '255,236,205', primary: '#D4AE63', dim: '#E3C586', accentBg: 'rgba(240,106,126,0.18)', accent: '#F06A7E' },
  },
  ocean: {
    name: 'Ocean', swatch: ['#2B7BC9', '#0FA3B1'],
    primary: '#2B7BC9', dim: '#1D5FA3', light: '#A9CDF0', grad: ['#8FC2F0', '#4A93DB', '#2B7BC9'], onPrimary: '#FFFFFF', accent: '#0A93A0', accentBg: '#D4F0F3',
    L: { bg0: '#F2F7FC', bg2: '#E8F0F9', bg3: '#D8E5F3', txt: '#142234', txt2: '#566A80', txt3: '#8FA0B3', line: '30,70,120' },
    D: { bg0: '#0D1620', bg1: '#14202D', bg2: '#1B2A3A', bg3: '#243648', txt: '#E7EEF7', txt2: '#A2B3C6', txt3: '#6F8298', line: '170,205,245', primary: '#5BA3EA', dim: '#8DC0F2', accentBg: 'rgba(53,196,212,0.18)', accent: '#35C4D4' },
  },
  forest: {
    name: 'Forest', swatch: ['#2E8B57', '#D98A1F'],
    primary: '#2E8B57', dim: '#1F6B41', light: '#A6D9BC', grad: ['#8ED1A9', '#4BAA76', '#2E8B57'], onPrimary: '#FFFFFF', accent: '#C9741A', accentBg: '#FBE7CF',
    L: { bg0: '#F3F8F2', bg2: '#E8F1E6', bg3: '#D7E6D3', txt: '#16241B', txt2: '#566B5D', txt3: '#8FA396', line: '30,90,50' },
    D: { bg0: '#0E1712', bg1: '#15211A', bg2: '#1D2C23', bg3: '#27392D', txt: '#E6F0E9', txt2: '#A3B8AA', txt3: '#6F857A', line: '175,230,195', primary: '#5BC58B', dim: '#86D8AB', accentBg: 'rgba(240,160,70,0.18)', accent: '#F0A046' },
  },
  violet: {
    name: 'Violet', swatch: ['#7B5BD6', '#D6459A'],
    primary: '#7B5BD6', dim: '#5B3FB4', light: '#C9B8F2', grad: ['#B9A3F0', '#8F72E0', '#7B5BD6'], onPrimary: '#FFFFFF', accent: '#D6459A', accentBg: '#FBDDEE',
    L: { bg0: '#F7F4FD', bg2: '#EFEAFA', bg3: '#E2DAF4', txt: '#1F1830', txt2: '#665D7D', txt3: '#9C94B0', line: '80,50,140' },
    D: { bg0: '#130F19', bg1: '#1B1723', bg2: '#251F31', bg3: '#30283F', txt: '#EEE9F7', txt2: '#B3A9C8', txt3: '#7E7396', line: '210,190,250', primary: '#A58BEE', dim: '#C0AEF4', accentBg: 'rgba(240,110,185,0.18)', accent: '#F06EB9' },
  },
  sunset: {
    name: 'Sunset', swatch: ['#E2672B', '#C2185B'],
    primary: '#E2672B', dim: '#B84C16', light: '#F6BE9B', grad: ['#F5A877', '#EB7A3C', '#E2672B'], onPrimary: '#FFFFFF', accent: '#C2185B', accentBg: '#F9D9E6',
    L: { bg0: '#FFF6F0', bg2: '#FCEADF', bg3: '#F6D9C7', txt: '#2B1A12', txt2: '#7A6155', txt3: '#AD9A8F', line: '120,60,30' },
    D: { bg0: '#1A1210', bg1: '#241A16', bg2: '#2E221D', bg3: '#3A2B24', txt: '#F6EBE4', txt2: '#BCA79B', txt3: '#85736A', line: '255,215,190', primary: '#F58A52', dim: '#F8AA80', accentBg: 'rgba(240,100,150,0.18)', accent: '#F0649A' },
  },
  slate: {
    name: 'Slate', swatch: ['#475569', '#0EA5E9'],
    primary: '#475569', dim: '#334155', light: '#B6C0CE', grad: ['#94A3B8', '#64748B', '#475569'], onPrimary: '#FFFFFF', accent: '#0284C7', accentBg: '#D6ECF8',
    L: { bg0: '#F4F6F8', bg2: '#E9EDF1', bg3: '#DAE0E7', txt: '#141B24', txt2: '#566170', txt3: '#8D97A5', line: '40,60,90' },
    D: { bg0: '#0E1116', bg1: '#161B22', bg2: '#1E252E', bg3: '#28313C', txt: '#E8ECF1', txt2: '#A5AFBC', txt3: '#707B89', line: '190,205,225', primary: '#8FA2BC', dim: '#B3C1D4', accentBg: 'rgba(56,189,248,0.18)', accent: '#38BDF8' },
  },
}
export const MODES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']]

export const getPalette = () => { try { const v = localStorage.getItem(PALETTE_KEY); return PALETTES[v] ? v : 'cardamon' } catch (e) { return 'cardamon' } }
export const getMode = () => { try { const v = localStorage.getItem(MODE_KEY); return ['light', 'dark', 'system'].includes(v) ? v : 'light' } catch (e) { return 'light' } }

const rgb = hex => { const n = parseInt(hex.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}` }
const alpha = (hex, a) => `rgba(${rgb(hex)},${a})`

export const isDark = (mode = getMode()) => mode === 'dark' || (mode === 'system' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches)

export function themeVars(paletteId, dark) {
  const p = PALETTES[paletteId] || PALETTES.cardamon
  const t = { ...p, ...(dark ? p.D : p.L) }
  const primary = t.primary, line = t.line
  const base = {
    '--bg0': t.bg0, '--bg1': dark ? t.bg1 : '#FFFFFF', '--bg2': t.bg2, '--bg3': t.bg3,
    '--gold': primary, '--gold-dim': t.dim, '--gold-light': dark ? alpha(primary, 0.5) : p.light,
    '--gold-bg': alpha(primary, dark ? 0.2 : 0.14), '--gold-border': alpha(primary, dark ? 0.5 : 0.4),
    '--gold-grad': dark
      ? `linear-gradient(180deg, ${alpha(primary, 1)} 0%, ${alpha(primary, 0.85)} 100%)`
      : `linear-gradient(180deg, ${p.grad[0]} 0%, ${p.grad[1]} 55%, ${p.grad[2]} 100%)`,
    '--on-accent': dark ? '#16110C' : p.onPrimary, '--accent-line': alpha(primary, 0.55),
    '--pink': t.accent, '--pink-bg': t.accentBg,
    '--txt': t.txt, '--txt2': t.txt2, '--txt3': t.txt3,
    '--border': `rgba(${line},${dark ? 0.10 : 0.10})`, '--border2': `rgba(${line},${dark ? 0.18 : 0.18})`,
    '--shadow': dark ? '0 2px 10px rgba(0,0,0,0.35)' : `0 2px 10px rgba(${line},0.07)`,
    '--nav-shadow': dark ? '0 6px 22px rgba(0,0,0,0.5)' : `0 6px 22px rgba(${line},0.16)`,
    '--track': `rgba(${line},${dark ? 0.16 : 0.10})`, '--chip-grey': `rgba(${line},${dark ? 0.12 : 0.06})`,
    '--focus': alpha(primary, 0.22), '--overlay': dark ? 'rgba(0,0,0,0.62)' : `rgba(${line},0.45)`,
  }
  // status colours: deeper on light backgrounds, lighter on dark ones
  const status = dark
    ? { mint: '#4CCB8E', 'mint-dim': '#6FDBA6', indigo: '#8F88EC', 'indigo-dim': '#A8A2F2', amber: '#E8A04E', 'amber-dim': '#F0B772', red: '#E8706F', 'red-dim': '#F58E8A' }
    : { mint: '#2E9E6B', 'mint-dim': '#1F7F53', indigo: '#6B63D6', 'indigo-dim': '#5047B8', amber: '#D9822B', 'amber-dim': '#B3641A', red: '#D14B4B', 'red-dim': '#B3382F' }
  for (const k of ['mint', 'indigo', 'amber', 'red']) {
    base[`--${k}`] = status[k]; base[`--${k}-dim`] = status[`${k}-dim`]
    base[`--${k}-bg`] = alpha(status[k], dark ? 0.18 : 0.12)
    base[`--${k}-border`] = alpha(status[k], dark ? 0.4 : 0.32)
  }
  return base
}

export function applyTheme() {
  const dark = isDark()
  const vars = themeVars(getPalette(), dark)
  const root = document.documentElement
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
  root.dataset.mode = dark ? 'dark' : 'light'
  root.style.colorScheme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--bg0'])
  listeners.forEach(l => l())
}

// tiny external store so screens re-render when the theme changes
const listeners = new Set()
const subscribe = l => { listeners.add(l); return () => listeners.delete(l) }
let snap = ''
const snapshot = () => `${getPalette()}|${getMode()}|${isDark()}`

export function useTheme() {
  useSyncExternalStore(subscribe, () => (snap = snapshot()))
  return { palette: getPalette(), mode: getMode(), dark: isDark() }
}

export function setPalette(id) { if (PALETTES[id]) { localStorage.setItem(PALETTE_KEY, id); applyTheme() } }
export function setMode(mode) { localStorage.setItem(MODE_KEY, mode); applyTheme() }

// follow the phone's light / dark setting while the mode is "Auto"
export function watchSystemTheme() {
  if (typeof matchMedia !== 'function') return
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (getMode() === 'system') applyTheme() })
}
