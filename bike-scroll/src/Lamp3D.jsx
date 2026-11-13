import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'

// World units. The shade is ~1.8 wide; the camera sits a little below it so you can
// see up into the shade and the bulb.
const RIM_Y = -0.15
const ANCHOR = new THREE.Vector3(0.74, RIM_Y - 0.02, 0)
const CHAIN_LEN = 0.7
const BEADS = 14
const MAX_PULL = 0.5
const TRIGGER = 0.5 // normalised pull needed to toggle

const dome = (scale, lip) => {
  const pts = []
  for (let i = 0; i <= 28; i++) {
    const th = 0.14 + (1.5 - 0.14) * (i / 28)
    pts.push(new THREE.Vector2(0.93 * scale * Math.sin(th), RIM_Y + 0.72 * scale * Math.cos(th) + (scale < 1 ? 0.02 : 0)))
  }
  if (lip) pts.push(new THREE.Vector2(0.95, RIM_Y - 0.03), new THREE.Vector2(0.94, RIM_Y - 0.045))
  return pts
}

function makeGlow() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,240,200,1)')
  grad.addColorStop(0.2, 'rgba(255,214,140,0.5)')
  grad.addColorStop(0.55, 'rgba(255,190,100,0.12)')
  grad.addColorStop(1, 'rgba(255,170,60,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

function LampScene({ on, st, hitRef }) {
  const level = useRef(0)
  const chain = useRef([])
  const knob = useRef()
  const bulbCore = useRef()
  const inner = useRef()
  const light = useRef()
  const glow = useRef()
  const glowTex = useMemo(makeGlow, [])
  const shadeGeo = useMemo(() => new THREE.LatheGeometry(dome(1, true), 72), [])
  const innerGeo = useMemo(() => new THREE.LatheGeometry(dome(0.965, false), 72), [])
  const knobGeo = useMemo(
    () =>
      new THREE.LatheGeometry(
        [[0, -0.17], [0.045, -0.16], [0.08, -0.11], [0.092, -0.03], [0.078, 0.05], [0.045, 0.1], [0.02, 0.125], [0, 0.13]]
          .map(([r, y]) => new THREE.Vector2(r, y)),
        32
      ),
    []
  )
  const tmp = useMemo(() => new THREE.Vector3(), [])

  const invalidate = useThree((st) => st.invalidate)
  const warm = useRef(0)
  useEffect(() => { invalidate() }, [on, invalidate])

  useFrame(({ camera, size, clock }, dt) => {
    dt = Math.min(dt, 0.05)
    const s = st.current
    // Pull: follow the pointer while dragging, otherwise spring back with a little bounce.
    if (!s.drag) {
      s.vel += (-s.pull * 220 - s.vel * 13) * dt
      s.pull = Math.max(-0.2, s.pull + s.vel * dt)
    }
    // Rope sway, excited on release.
    s.swayV += (-s.sway * 38 - s.swayV * 2.2) * dt
    s.sway += s.swayV * dt
    const t = clock.elapsedTime
    const idle = 0

    const len = CHAIN_LEN + s.pull * MAX_PULL
    for (let i = 0; i < BEADS; i++) {
      const k = (i + 1) / BEADS
      const m = chain.current[i]
      if (m) m.position.set(ANCHOR.x + (s.sway + idle) * k * k * 0.5, ANCHOR.y - len * k, 0)
    }
    const end = ANCHOR.y - len
    knob.current.position.set(ANCHOR.x + (s.sway + idle) * 0.5, end - 0.12, 0)
    knob.current.rotation.z = -(s.sway + idle) * 0.4

    // Halogen warm-up: a quick flicker while it comes up to full brightness.
    level.current = THREE.MathUtils.damp(level.current, on ? 1 : 0, on ? 6 : 4, dt)
    const v = level.current
    const flick = on && v < 0.97 ? 0.82 + 0.18 * Math.sin(t * 70) : 1
    const e = v * flick
    bulbCore.current.material.emissiveIntensity = e * 4
    bulbCore.current.material.color.setScalar(0.25 + 0.75 * e)
    inner.current.material.emissiveIntensity = e * 0.9
    light.current.intensity = e * 7
    glow.current.material.opacity = e * 0.95
    glow.current.scale.setScalar(0.9 + e * 0.2)

    // Render on demand: keep going while anything is moving, then go to sleep.
    const target = on ? 1 : 0
    const moving =
      s.drag || Math.abs(s.pull) > 0.002 || Math.abs(s.vel) > 0.01 ||
      Math.abs(s.sway) > 0.001 || Math.abs(s.swayV) > 0.005 || Math.abs(level.current - target) > 0.003
    if (moving || warm.current++ < 90) invalidate()

    // Keep the invisible hit target glued to the knob so it can be grabbed and focused.
    if (hitRef.current) {
      tmp.copy(knob.current.position).project(camera)
      const x = (tmp.x * 0.5 + 0.5) * size.width
      const y = (-tmp.y * 0.5 + 0.5) * size.height
      hitRef.current.style.transform = `translate(${x}px, ${y}px)`
    }
  })

  const brass = { color: '#c9a24a', metalness: 1, roughness: 0.28 }
  return (
    <>
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2.2} position={[-3, 1.5, 3]} scale={[3, 1.2, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[3, -1, 2]} scale={[2, 2, 1]} color="#ffd9a8" />
        <Lightformer form="ring" intensity={1.5} position={[0, 4, 0]} scale={3} rotation-x={Math.PI / 2} />
      </Environment>
      <ambientLight intensity={0.15} />

      {/* ceiling cable and canopy */}
      <mesh position={[0, 1.7, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 2.3, 8]} />
        <meshStandardMaterial color="#0c0c0e" roughness={0.6} />
      </mesh>
      <mesh position={[0, RIM_Y + 0.74, 0]}>
        <cylinderGeometry args={[0.1, 0.13, 0.12, 32]} />
        <meshPhysicalMaterial {...brass} />
      </mesh>

      {/* shade: dark enamel outside, warm metal inside that picks up the bulb light */}
      <mesh geometry={shadeGeo}>
        <meshPhysicalMaterial color="#17191e" metalness={0.55} roughness={0.32}
          clearcoat={1} clearcoatRoughness={0.12} side={THREE.FrontSide} />
      </mesh>
      <mesh ref={inner} geometry={innerGeo}>
        <meshStandardMaterial color="#e2cfa5" metalness={0.8} roughness={0.35}
          emissive="#ff9d3a" emissiveIntensity={0} side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, RIM_Y - 0.002, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.945, 0.016, 12, 96]} />
        <meshPhysicalMaterial {...brass} />
      </mesh>

      {/* halogen capsule bulb */}
      <group position={[0, RIM_Y + 0.12, 0]}>
        <mesh>
          <capsuleGeometry args={[0.11, 0.16, 8, 24]} />
          <meshPhysicalMaterial color="#ffffff" transparent opacity={0.22} roughness={0}
            metalness={0} clearcoat={1} depthWrite={false} />
        </mesh>
        <mesh ref={bulbCore}>
          <capsuleGeometry args={[0.045, 0.1, 6, 16]} />
          <meshStandardMaterial color="#555" emissive="#ffd9a0" emissiveIntensity={0} toneMapped={false} />
        </mesh>
        <sprite ref={glow} scale={[0.9, 0.9, 1]}>
          <spriteMaterial map={glowTex} transparent opacity={0} depthWrite={false}
            blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
        <pointLight ref={light} color="#ffcf8f" intensity={0} distance={3.5} decay={2} />
      </group>

      {/* ball chain and brass pull */}
      {Array.from({ length: BEADS }, (_, i) => (
        <mesh key={i} ref={(m) => (chain.current[i] = m)} position={[ANCHOR.x, ANCHOR.y, 0]}>
          <sphereGeometry args={[0.02, 16, 12]} />
          <meshPhysicalMaterial {...brass} />
        </mesh>
      ))}
      <mesh ref={knob} geometry={knobGeo}>
        <meshPhysicalMaterial {...brass} roughness={0.22} clearcoat={0.4} />
      </mesh>
    </>
  )
}

/** The pendant lamp: a small 3D scene with its own transparent canvas, plus the drag target. */
export default function Lamp3D({ on, onToggle, hide = false }) {
  const st = useRef({ pull: 0, vel: 0, drag: false, sway: 0, swayV: 0, startY: 0, moved: 0 })
  const hit = useRef()

  const down = (e) => {
    const s = st.current
    s.drag = true
    s.startY = e.clientY
    s.moved = 0
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e) => {
    const s = st.current
    if (!s.drag) return
    const dy = e.clientY - s.startY
    s.moved = Math.max(s.moved, Math.abs(dy))
    s.pull = THREE.MathUtils.clamp(dy / 70, -0.1, 1)
    s.vel = 0
  }
  const up = () => {
    const s = st.current
    if (!s.drag) return
    s.drag = false
    const pulled = s.pull > TRIGGER
    if (pulled || s.moved < 5) {
      if (!pulled) s.pull = 0.6 // a plain click gives the cord a visible tug
      onToggle()
    }
    s.swayV += 0.9
  }
  const key = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    st.current.pull = 0.6
    st.current.swayV += 0.9
    onToggle()
  }

  return (
    <div className={`lamp3d${on ? ' on' : ''}${hide ? ' hide' : ''}`}>
      <div className="lamp3d-beam" aria-hidden="true"><i /></div>
      <Canvas
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, -1.1, 6], fov: 28 }}
        onCreated={({ camera }) => camera.lookAt(0, -0.35, 0)}
        style={{ pointerEvents: 'none' }}
      >
        <LampScene on={on} st={st} hitRef={hit} />
      </Canvas>
      <button
        ref={hit}
        type="button"
        className="lamp-hit"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        aria-label="Pull the cord to turn the lamp on or off"
        aria-pressed={on}
      />
    </div>
  )
}
