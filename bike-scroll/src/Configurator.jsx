import { useRef } from 'react'
import {
  PAINTS, PAINT_TYPES, RIM_COLORS, RIM_FINISHES, CALIPERS, DEFAULTS,
  SEATS, SEAT_FINISHES, HARDWARE, MATS, DASH_GLOWS,
} from './customization.js'

const TABS = [
  { id: 'paint', label: 'Paint' },
  { id: 'wheels', label: 'Wheels' },
  { id: 'brakes', label: 'Brakes' },
  { id: 'interior', label: 'Interior' },
]

function Swatches({ label, items, value, onPick }) {
  return (
    <div role="group" aria-label={label} className="cfg-swatches">
      {items.map((it) => (
        <button
          key={it.name}
          type="button"
          className={value?.toLowerCase() === it.hex.toLowerCase() ? 'on' : ''}
          style={{ '--sw': it.hex }}
          onClick={() => onPick(it.hex)}
          aria-label={it.name}
          aria-pressed={value?.toLowerCase() === it.hex.toLowerCase()}
          title={it.name}
        />
      ))}
    </div>
  )
}

function CustomColor({ label, value, fallback, onPick }) {
  return (
    <label className="cfg-custom">
      <input type="color" value={value || fallback} onChange={(e) => onPick(e.target.value)} />
      <span>{label}</span>
      <code>{(value || fallback).toUpperCase()}</code>
    </label>
  )
}

function Segmented({ label, items, value, onPick }) {
  return (
    <div className="cfg-seg" role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={value === it.id ? 'on' : ''}
          aria-pressed={value === it.id}
          onClick={() => onPick(it.id)}
        >
          {it.name}
        </button>
      ))}
    </div>
  )
}

export default function Configurator({ open, tab, setTab, custom, setCustom, variants }) {
  const set = (patch) => setCustom((c) => ({ ...c, ...patch }))
  const tabRefs = useRef([])

  const onTabKey = (e, i) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = (i + d + TABS.length) % TABS.length
    setTab(TABS[next].id)
    tabRefs.current[next]?.focus()
  }

  const summary = [
    custom.paint
      ? `${PAINTS.find((p) => p.hex.toLowerCase() === custom.paint.toLowerCase())?.name ?? 'Custom'} ${PAINT_TYPES.find((t) => t.id === custom.paintType)?.name.toLowerCase()}`
      : variants[custom.finish]?.name ?? 'Stock paint',
    custom.rim
      ? `${RIM_COLORS.find((p) => p.hex.toLowerCase() === custom.rim.toLowerCase())?.name ?? 'Custom'} wheels`
      : 'Stock wheels',
    custom.caliper
      ? `${CALIPERS.find((p) => p.hex.toLowerCase() === custom.caliper.toLowerCase())?.name ?? 'Custom'} calipers`
      : 'Stock calipers',
    custom.interior
      ? `${SEATS.find((p) => p.hex.toLowerCase() === custom.interior.toLowerCase())?.name ?? 'Custom'} ${SEAT_FINISHES.find((f) => f.id === custom.seatFinish)?.name.toLowerCase()} seats`
      : 'Stock interior',
  ]

  return (
    <aside className={`cfg${open ? ' open' : ''}`} aria-label="Car configurator" aria-hidden={!open}
      inert={open ? undefined : ''}>
      <div className="cfg-tabs" role="tablist" aria-label="Customize">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => (tabRefs.current[i] = el)}
            role="tab"
            id={`cfg-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`cfg-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="cfg-body">
        {tab === 'paint' && (
          <div role="tabpanel" id="cfg-panel-paint" aria-labelledby="cfg-tab-paint">
            {variants.length > 0 && (
              <>
                <h3>Factory finishes</h3>
                <Swatches
                  label="Factory finish"
                  items={variants.map((v) => ({ name: v.name, hex: v.swatch }))}
                  value={custom.paint ? null : variants[custom.finish]?.swatch}
                  onPick={(hex) => set({ finish: variants.findIndex((v) => v.swatch === hex), paint: null })}
                />
              </>
            )}
            <h3>Custom colour</h3>
            <Swatches label="Paint colour" items={PAINTS} value={custom.paint} onPick={(hex) => set({ paint: hex })} />
            <CustomColor label="Pick any colour" value={custom.paint} fallback="#b3122b" onPick={(hex) => set({ paint: hex })} />
            <h3>Finish</h3>
            <Segmented label="Paint finish" items={PAINT_TYPES} value={custom.paintType}
              onPick={(paintType) => set({ paintType, paint: custom.paint ?? PAINTS[0].hex })} />
            <label className="cfg-check">
              <input type="checkbox" checked={custom.twoTone}
                onChange={(e) => set({ twoTone: e.target.checked, paint: custom.paint ?? PAINTS[0].hex })} />
              <span>Dark roof, mirrors and trim</span>
            </label>
          </div>
        )}

        {tab === 'wheels' && (
          <div role="tabpanel" id="cfg-panel-wheels" aria-labelledby="cfg-tab-wheels">
            <h3>Rim colour</h3>
            <Swatches label="Rim colour" items={RIM_COLORS} value={custom.rim} onPick={(hex) => set({ rim: hex })} />
            <CustomColor label="Pick any colour" value={custom.rim} fallback="#d9dce2" onPick={(hex) => set({ rim: hex })} />
            <h3>Rim finish</h3>
            <Segmented label="Rim finish" items={RIM_FINISHES} value={custom.rimFinish}
              onPick={(rimFinish) => set({ rimFinish, rim: custom.rim ?? RIM_COLORS[0].hex })} />
            <button type="button" className="cfg-link" onClick={() => set({ rim: null, rimFinish: DEFAULTS.rimFinish })}>
              Back to stock wheels
            </button>
          </div>
        )}

        {tab === 'brakes' && (
          <div role="tabpanel" id="cfg-panel-brakes" aria-labelledby="cfg-tab-brakes">
            <h3>Caliper colour</h3>
            <Swatches label="Caliper colour" items={CALIPERS} value={custom.caliper} onPick={(hex) => set({ caliper: hex })} />
            <CustomColor label="Pick any colour" value={custom.caliper} fallback="#d40000" onPick={(hex) => set({ caliper: hex })} />
            <button type="button" className="cfg-link" onClick={() => set({ caliper: null })}>
              Back to stock calipers
            </button>
          </div>
        )}

        {tab === 'interior' && (
          <div role="tabpanel" id="cfg-panel-interior" aria-labelledby="cfg-tab-interior">
            <h3>Seats and trim</h3>
            <Swatches label="Seat colour" items={SEATS} value={custom.interior} onPick={(hex) => set({ interior: hex })} />
            <CustomColor label="Pick any colour" value={custom.interior} fallback="#9a5a2c" onPick={(hex) => set({ interior: hex })} />
            <Segmented label="Seat material" items={SEAT_FINISHES} value={custom.seatFinish}
              onPick={(seatFinish) => set({ seatFinish, interior: custom.interior ?? SEATS[1].hex })} />
            <h3>Hardware</h3>
            <Swatches label="Hardware finish" items={HARDWARE} value={custom.hardware} onPick={(hex) => set({ hardware: hex })} />
            <h3>Floor mats</h3>
            <Swatches label="Floor mat colour" items={MATS} value={custom.mats} onPick={(hex) => set({ mats: hex })} />
            <h3>Dashboard glow</h3>
            <Swatches label="Dashboard glow" items={DASH_GLOWS} value={custom.dash} onPick={(hex) => set({ dash: hex })} />
            <button type="button" className="cfg-link"
              onClick={() => set({ interior: null, seatFinish: DEFAULTS.seatFinish, hardware: null, mats: null, dash: null })}>
              Back to stock interior
            </button>
          </div>
        )}
      </div>

      <div className="cfg-foot">
        <p aria-live="polite">{summary.join(' · ')}</p>
        <button type="button" className="cfg-reset" onClick={() => setCustom({ ...DEFAULTS })}>Reset all</button>
      </div>
    </aside>
  )
}
