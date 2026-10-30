import { Sun, Moon, SunMoon } from 'lucide-react'
import { PALETTES, MODES, useTheme, setPalette, setMode } from '../lib/theme'

const MODE_ICON = { light: Sun, dark: Moon, system: SunMoon }

// A colour theme as two overlapping dots
const Dots = ({ p, size = 24 }) => (
  <div style={{ display: 'flex', justifyContent: 'center' }}>
    <span style={{ width: size, height: size, borderRadius: '50%', background: p.swatch[0], border: '2px solid var(--bg1)' }} />
    <span style={{ width: size, height: size, borderRadius: '50%', background: p.swatch[1], border: '2px solid var(--bg1)', marginLeft: -size / 3 }} />
  </div>
)

// Profile -> Customise: mode and colour combination, each on one line (tap to switch). This is the only place they are set.
export function ThemeStrip() {
  const { palette, mode } = useTheme()
  const line = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }
  return (
    <div className="card">
      <div style={line}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Mode</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {MODES.map(([id, label]) => {
            const Icon = MODE_ICON[id], on = mode === id
            return <div key={id} onClick={() => setMode(id)} aria-label={label} title={label} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 32, padding: '0 10px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: `1.5px solid ${on ? 'var(--gold)' : 'var(--border2)'}`, background: on ? 'var(--gold-bg)' : 'var(--bg1)', color: on ? 'var(--gold-dim)' : 'var(--txt2)' }}><Icon size={15} />{label}</div>
          })}
        </div>
      </div>
      <div style={{ height: 1, background: 'var(--border)', margin: '10px 0' }} />
      <div style={line}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Colours<div style={{ fontSize: 11, fontWeight: 500, color: 'var(--txt2)' }}>{PALETTES[palette]?.name}</div></div>
        <div style={{ display: 'flex', gap: 2 }}>
          {Object.entries(PALETTES).map(([id, p]) => {
            const on = palette === id
            return (
              <div key={id} onClick={() => setPalette(id)} aria-label={p.name} title={p.name} style={{ padding: 4, borderRadius: 12, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--gold)' : 'transparent'}`, background: on ? 'var(--gold-bg)' : 'transparent' }}>
                <Dots p={p} size={17} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
