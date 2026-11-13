import { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useSpring } from 'framer-motion'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import config from './site.config.json'
import content from './content.json'
import Scene from './Scene.jsx'
import Configurator from './Configurator.jsx'
import Lamp3D from './Lamp3D.jsx'
import { sim, configure as configureSim, launch, brake, reset as resetSim } from './speedtest.js'
import { loadCustom, saveCustom } from './customization.js'

const { sections, theme, credit, variants = [] } = config
const LIGHT = { bg: '#f1eee8', fg: '#14151a' }
const THEME_KEY = 'concept-car-theme'
configureSim(content.speedTest)
const configureSection = sections.find((s) => s.id === 'configure')

const fade = {
  initial: { opacity: 0, y: 32 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
}

const ICONS = {
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  battery: 'M3 8h14v8H3zM17 11h3v2h-3zM6 11v2M9 11v2',
  layers: 'm12 3 9 5-9 5-9-5zM3 13l9 5 9-5',
  lamp: 'M3 10c4-4 14-4 18 0v3c-4 3-14 3-18 0zM7 12h3',
  seat: 'M8 3c-1 0-2 1-2 2l1 9h8l3 3v3H6v-3M10 14v4',
}

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  )
}

function goTo(e, href) {
  if (!href.startsWith('#')) return
  e.preventDefault()
  document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' })
}

function SectionHead({ eyebrow, title, intro }) {
  return (
    <motion.header className="head" {...fade}>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {intro && <p className="lede">{intro}</p>}
    </motion.header>
  )
}

function ThemeToggle({ mode, onToggle }) {
  const light = mode === 'light'
  return (
    <button type="button" className="theme-toggle" onClick={onToggle}
      aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
      title={light ? 'Dark mode' : 'Light mode'}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {light ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
    </button>
  )
}

/** Tabbed spec sheet shown next to the car in the story. */
function SpecCard() {
  const [i, setI] = useState(0)
  const g = content.specs.groups[i]
  const refs = useRef([])
  const onKey = (e, idx) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const n = (idx + d + content.specs.groups.length) % content.specs.groups.length
    setI(n)
    refs.current[n]?.focus()
  }
  return (
    <div className="spec-card">
      <div className="cfg-tabs" role="tablist" aria-label="Specification groups">
        {content.specs.groups.map((x, idx) => (
          <button key={x.name} ref={(el) => (refs.current[idx] = el)} role="tab" id={`spec-tab-${idx}`}
            aria-selected={i === idx} aria-controls="spec-panel" tabIndex={i === idx ? 0 : -1}
            className={i === idx ? 'on' : ''} onClick={() => setI(idx)} onKeyDown={(e) => onKey(e, idx)}>
            {x.name.split(' ')[0]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="spec-panel" aria-labelledby={`spec-tab-${i}`} className="spec-rows">
        <h3>{g.name}</h3>
        <dl>
          {g.rows.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </div>
      <p className="note">{content.specs.note}</p>
    </div>
  )
}

const fmt = (n, d = 0) => n.toFixed(d)

/** Live readout for the speed test. Reads the shared simulator, which the 3D scene steps. */
function SpeedHud({ open }) {
  const [, force] = useState(0)
  const [done, setDone] = useState('')
  useEffect(() => {
    if (!open) return
    let raf
    let last = 0
    const tick = (t) => {
      if (t - last > 60) { last = t; force((n) => n + 1) }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [open])
  // Stop and zero the run when the chapter scrolls out of view.
  useEffect(() => { if (!open) { resetSim(); setDone('') } }, [open])
  // Announce the 0–100 split once, for screen readers.
  useEffect(() => {
    if (sim.t100 != null && !done) setDone(`0 to 100 kilometres per hour in ${fmt(sim.t100, 2)} seconds`)
  })

  const running = sim.state === 'running'
  const pct = Math.min(100, (sim.v / sim.vmax) * 100)
  const stat = (label, val) => (
    <div><dt>{label}</dt><dd>{val}</dd></div>
  )
  return (
    <aside className={`cfg hud${open ? ' open' : ''}`} aria-label="Speed test" aria-hidden={!open}
      inert={open ? undefined : ''}>
      <div className="hud-top">
        <div className="hud-speed">
          <b>{fmt(sim.v)}</b><span>km/h</span>
        </div>
        <div className="hud-bar" role="presentation"><i style={{ width: `${pct}%` }} /></div>
      </div>
      <dl className="hud-stats">
        {stat('Time', `${fmt(sim.t, 2)} s`)}
        {stat('Distance', `${fmt(sim.dist)} m`)}
        {stat('0–100 km/h', sim.t100 != null ? `${fmt(sim.t100, 2)} s` : '—')}
        {stat('0–200 km/h', sim.t200 != null ? `${fmt(sim.t200, 2)} s` : '—')}
        {stat('Top speed', `${fmt(sim.top)} km/h`)}
        {stat('Target', `${content.speedTest.t100} s / ${content.speedTest.vmax}`)}
      </dl>
      <div className="hud-actions">
        <button type="button" className="btn small" onClick={launch} disabled={running}>
          {sim.state === 'idle' && sim.t === 0 ? 'Launch' : 'Launch again'}
        </button>
        <button type="button" className="btn small ghost" onClick={brake} disabled={!running}>Brake</button>
        <button type="button" className="cfg-reset" onClick={resetSim}>Reset</button>
      </div>
      <p className="hud-note">{content.speedTest.note}</p>
      <p className="sr-only" aria-live="polite">{done}</p>
    </aside>
  )
}

function Header({ mode, onToggleTheme }) {
  const [open, setOpen] = useState(false)
  const [solid, setSolid] = useState(false)
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const click = (e, href) => { goTo(e, href); setOpen(false) }
  return (
    <header className={`topbar${solid || open ? ' solid' : ''}`}>
      <a className="brand" href="#intro" onClick={(e) => click(e, '#intro')}>
        <span className="mark" aria-hidden="true" />{content.brand}
      </a>
      <ThemeToggle mode={mode} onToggle={onToggleTheme} />
      <button className="burger" aria-expanded={open} aria-controls="menu"
        aria-label="Menu" onClick={() => setOpen((o) => !o)}>
        <span /><span />
      </button>
      <nav id="menu" className={open ? 'open' : ''} aria-label="Primary">
        {content.nav.map((n) => (
          <a key={n.href} href={n.href} onClick={(e) => click(e, n.href)}>{n.label}</a>
        ))}
        <a className="btn small" href={content.cta.href} onClick={(e) => click(e, content.cta.href)}>
          {content.cta.label}
        </a>
      </nav>
    </header>
  )
}

function Reserve() {
  const [sent, setSent] = useState(false)
  return (
    <section id="reserve" className="block reserve">
      <motion.div className="reserve-card" {...fade}>
        <p className="eyebrow">{content.reserve.eyebrow}</p>
        <h2>{content.reserve.title}</h2>
        <p className="lede">{content.reserve.body}</p>
        {sent ? (
          <p className="thanks" role="status">Thanks. This is a demo form, so nothing was sent.</p>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); setSent(true) }}>
            <label>
              <span>Name</span>
              <input name="name" autoComplete="name" required />
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              <span>Preferred finish</span>
              <select name="finish" defaultValue={variants[0]?.name}>
                {variants.map((v) => <option key={v.name}>{v.name}</option>)}
              </select>
            </label>
            <button className="btn" type="submit">{content.cta.label}</button>
          </form>
        )}
      </motion.div>
    </section>
  )
}

export default function App() {
  const [custom, setCustom] = useState(loadCustom)
  const [tab, setTab] = useState('paint')
  const [lampOn, setLampOn] = useState(false)
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark' } catch { return 'dark' }
  })
  const colors = mode === 'light' ? { ...theme, ...LIGHT } : theme
  const [configOpen, setConfigOpen] = useState(false)
  const [speedOpen, setSpeedOpen] = useState(false)
  const variant = variants.length ? Math.min(custom.finish, variants.length - 1) : null
  const storyRef = useRef(null)
  const stageRef = useRef(null)
  const [dpr, setDpr] = useState(1.5)
  const [stageOn, setStageOn] = useState(true)
  // Progress is measured over the story only, so the car stops flying once you leave it.
  const { scrollYProgress } = useScroll({ target: storyRef, offset: ['start start', 'end end'] })
  const smooth = useSpring(scrollYProgress, { stiffness: 80, damping: 24, mass: 0.6 })

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = mode
    root.style.setProperty('--bg', colors.bg)
    root.style.setProperty('--fg', colors.fg)
    root.style.setProperty('--accent', colors.accent)
    root.style.colorScheme = mode
    try { localStorage.setItem(THEME_KEY, mode) } catch {}
  }, [mode, colors.bg, colors.fg, colors.accent])

  useEffect(() => {
    document.title = `${config.name} | ${content.tagline}`
  }, [])

  useEffect(() => { saveCustom(custom) }, [custom])

  // Stop drawing the 3D view once the sticky stage has scrolled away (below the story).
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setStageOn(e.isIntersecting), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Panels are only shown while their story chapter is on screen.
  useEffect(() => {
    const watch = (id, set) => {
      const el = document.getElementById(id)
      if (!el) return () => {}
      const io = new IntersectionObserver(([e]) => set(e.isIntersecting), { threshold: 0.45 })
      io.observe(el)
      return () => io.disconnect()
    }
    const a = watch('configure', setConfigOpen)
    const b = watch('speed', setSpeedOpen)
    return () => { a(); b() }
  }, [])

  const focus = configOpen ? configureSection?.focus?.[tab] ?? null : null

  const tryFinish = (i) => {
    setCustom((c) => ({ ...c, finish: i, paint: null }))
    document.getElementById('configure')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <>
      <a className="skip" href="#highlights">Skip the 3D story</a>
      <Header mode={mode} onToggleTheme={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))} />

      <div className={`story${focus ? ' focused' : ''}`} ref={storyRef}>
        <div className="stage" ref={stageRef}>
          <motion.div className="progress" style={{ scaleX: scrollYProgress }} />
          <Canvas
            dpr={[1, dpr]}
            frameloop={stageOn ? 'always' : 'never'}
            camera={{ fov: 40, near: 0.1, far: 100, position: sections[0].camera.position }}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
          >
            <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} flipflops={2} />
            <Scene progress={smooth} variant={variant} custom={custom} focus={focus} panelOpen={configOpen || speedOpen} lampOn={lampOn} speedOpen={speedOpen} bg={colors.bg} />
          </Canvas>

          <Lamp3D on={lampOn} onToggle={() => setLampOn((v) => !v)} />

          <nav className="dots" aria-label="Story sections">
            {sections.map((s, i) => (
              <a key={s.id} href={`#${s.id}`} aria-label={s.title} onClick={(e) => goTo(e, `#${s.id}`)}>
                <span>{String(i + 1).padStart(2, '0')}</span>
              </a>
            ))}
          </nav>

          <SpeedHud open={speedOpen} />

          <Configurator open={configOpen} tab={tab} setTab={setTab} custom={custom}
            setCustom={setCustom} variants={variants} />

          {variants.length > 0 && (
            <div className={`finishes${configOpen || speedOpen ? ' hide' : ''}`} role="group" aria-label="Paint finish">
              {variants.map((v, i) => (
                <button
                  key={v.name}
                  className={i === variant && !custom.paint ? 'on' : ''}
                  style={{ '--sw': v.swatch }}
                  onClick={() => setCustom((c) => ({ ...c, finish: i, paint: null }))}
                  aria-label={v.name}
                  aria-pressed={i === variant && !custom.paint}
                  title={v.name}
                />
              ))}
            </div>
          )}
        </div>

        <main>
          {sections.map((s, idx) => (
            <section key={s.id} id={s.id} className={`panel align-${s.align || 'left'}`}>
              <motion.div
                className={`copy${s.id === 'specs' ? ' wide' : ''}`}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ amount: 0.5 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="eyebrow">{s.eyebrow}</p>
                {idx === 0 ? <h1>{s.title}</h1> : <h2>{s.title}</h2>}
                {s.body && <p className="body">{s.body}</p>}
                {s.id === 'specs' && <SpecCard />}
                {idx === 0 && (
                  <>
                    <dl className="hero-stats">
                      {content.heroStats.map((h) => (
                        <div key={h.label}><dt>{h.label}</dt><dd>{h.value}</dd></div>
                      ))}
                    </dl>
                    <div className="actions">
                      <a className="btn" href={content.cta.href} onClick={(e) => goTo(e, content.cta.href)}>
                        {content.cta.label}
                      </a>
                      <a className="btn ghost" href="#configure" onClick={(e) => goTo(e, '#configure')}>Customize</a>
                    </div>
                  </>
                )}
              </motion.div>
            </section>
          ))}
        </main>
      </div>

      <div className="rest">
        <section id="highlights" className="block">
          <SectionHead {...content.highlights} />
          <div className="cards">
            {content.highlights.items.map((it, i) => (
              <motion.article key={it.title} className="card" {...fade}
                transition={{ ...fade.transition, delay: (i % 3) * 0.08 }}>
                <span className="ico"><Icon name={it.icon} /></span>
                <h3>{it.title}</h3>
                <p>{it.body}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section id="finishes" className="block">
          <SectionHead {...content.finishes} />
          <div className="cards three">
            {content.finishes.items.map((f, i) => (
              <motion.article key={f.name} className="card finish" {...fade}
                transition={{ ...fade.transition, delay: i * 0.08 }}>
                <span className="swatch" style={{ '--sw': variants[i]?.swatch }} aria-hidden="true" />
                <h3>{f.name}</h3>
                <p>{f.body}</p>
                <button className="link" onClick={() => tryFinish(i)}>Customize this finish →</button>
              </motion.article>
            ))}
          </div>
        </section>

        <section id="faq" className="block alt">
          <SectionHead eyebrow={content.faq.eyebrow} title={content.faq.title} />
          <div className="faq">
            {content.faq.items.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <Reserve />

        <footer className="foot">
          <div className="foot-top">
            <div>
              <a className="brand" href="#intro" onClick={(e) => goTo(e, '#intro')}>
                <span className="mark" aria-hidden="true" />{content.brand}
              </a>
              <p>{content.tagline}</p>
            </div>
            <nav aria-label="Footer">
              {content.footerLinks.map((l) => (
                <a key={l.href} href={l.href} onClick={(e) => goTo(e, l.href)}>{l.label}</a>
              ))}
            </nav>
          </div>
          <p className="credit">
            <a href={credit.url} target="_blank" rel="noreferrer">{credit.text}</a>
            {' · '}
            <a href={credit.licenseUrl} target="_blank" rel="noreferrer">{credit.license}</a>
          </p>
        </footer>
      </div>
    </>
  )
}
