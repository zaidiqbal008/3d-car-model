import { Component, Suspense, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment } from '@react-three/drei'
import * as THREE from 'three'
import config from './site.config.json'
import Bike, { ProceduralBike } from './Bike.jsx'
import { sim, step as stepSim } from './speedtest.js'

const { sections } = config
// The 4.78 m long concept is scaled to 3 scene units, so one real metre is this many units.
const WORLD_PER_METRE = 3 / 4.78

const smoothstep = (t) => t * t * (3 - 2 * t)

/** Falls back to the placeholder bike if the GLB is missing or fails to parse. */
class ModelBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err) {
    console.warn(`Could not load ${config.model}; showing placeholder bike.`, err)
  }
  render() {
    return this.state.failed ? <ProceduralBike /> : this.props.children
  }
}

/**
 * Moves the camera through the section keyframes as scroll progress goes 0 -> 1.
 * `focus` ({ position, target } or null) blends the camera toward a close-up,
 * and `panelOpen` lifts the car on narrow screens so a bottom sheet doesn't cover it.
 */
function ScrollCamera({ progress, focus, panelOpen }) {
  const { camera } = useThree()
  const keys = useMemo(
    () =>
      sections.map((s) => ({
        pos: new THREE.Vector3(...s.camera.position),
        target: new THREE.Vector3(...s.camera.target),
      })),
    []
  )
  const pos = useMemo(() => new THREE.Vector3(), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  const fp = useMemo(() => new THREE.Vector3(), [])
  const ft = useMemo(() => new THREE.Vector3(), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const mix = useRef(0)
  const lift = useRef(0)
  // Screen-space shift per section so the model sits opposite the text.
  const shifts = useMemo(
    () =>
      sections.map((s) =>
        s.shift ?? (s.align === 'left' ? 0.16 : s.align === 'right' ? -0.16 : 0)
      ),
    []
  )

  useFrame(({ size }, dt) => {
    const n = keys.length
    const f = THREE.MathUtils.clamp(progress.get(), 0, 1) * (n - 1)
    const i = Math.min(Math.floor(f), n - 2)
    const t = smoothstep(f - i)
    const a = keys[Math.max(i, 0)]
    const b = keys[Math.min(i + 1, n - 1)]
    pos.lerpVectors(a.pos, b.pos, t)
    target.lerpVectors(a.target, b.target, t)

    const k = 1 - Math.exp(-5 * dt)
    if (focus) {
      tmp.set(...focus.position)
      if (mix.current < 0.01) fp.copy(tmp)
      else fp.lerp(tmp, k)
      tmp.set(...focus.target)
      if (mix.current < 0.01) ft.copy(tmp)
      else ft.lerp(tmp, k)
    }
    mix.current += ((focus ? 1 : 0) - mix.current) * k
    const m = smoothstep(THREE.MathUtils.clamp(mix.current, 0, 1))
    pos.lerp(fp, m)
    target.lerp(ft, m)
    camera.position.copy(pos)
    camera.lookAt(target)
    // Widen the lens a little as speed builds, for a sense of rush.
    const fov = 40 + (sim.v / 290) * 16
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

    const wide = size.width > 640
    const shift = wide ? THREE.MathUtils.lerp(shifts[Math.max(i, 0)], shifts[Math.min(i + 1, n - 1)], t) : 0
    const narrow = size.width <= 900
    lift.current += ((panelOpen && narrow ? 1 : 0) - lift.current) * k
    camera.setViewOffset(
      size.width, size.height, -shift * size.width, lift.current * size.height * 0.2, size.width, size.height
    )
  })
  return null
}

/** Asphalt strip with lane markings. One texture tile is ROAD_TILE world units long. */
const ROAD_TILE = 8
const ROAD_LEN = 70
const ROAD_W = 9

function makeRoadTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')
  g.fillStyle = '#17181c'
  g.fillRect(0, 0, 512, 512)
  // Fine grain so the surface reads as asphalt and shows motion.
  for (let i = 0; i < 5000; i++) {
    const v = 20 + Math.random() * 28
    g.fillStyle = `rgba(${v},${v},${v + 4},0.55)`
    g.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5)
  }
  const px = 512 / ROAD_W
  g.fillStyle = '#e9e6dc'
  for (const x of [-1.6, 1.6]) {
    for (let k = 0; k < 2; k++) g.fillRect(256 + x * px - 3, k * 256 + 20, 6, 128) // dashed lane lines
  }
  for (const x of [-3.9, 3.9]) g.fillRect(256 + x * px - 4, 0, 8, 512) // solid edge lines
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1, ROAD_LEN / ROAD_TILE)
  t.anisotropy = 8
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Steps the speed sim once per frame and scrolls the road backwards under the car. */
function SpeedWorld({ open }) {
  const mesh = useRef()
  const tex = useMemo(makeRoadTexture, [])
  const show = useRef(0)
  useFrame((_, dt) => {
    stepSim(dt)
    show.current = THREE.MathUtils.damp(show.current, open ? 1 : 0, 4, dt)
    const m = mesh.current
    m.visible = show.current > 0.01
    m.material.opacity = show.current
    const unitsPerMetre = WORLD_PER_METRE
    const d = (sim.v / 3.6) * Math.min(dt, 0.5) * unitsPerMetre
    tex.offset.y -= d / ROAD_TILE
  })
  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} position={[0, -0.004, ROAD_LEN / 2 - 22]}>
      <planeGeometry args={[ROAD_W, ROAD_LEN]} />
      <meshStandardMaterial map={tex} roughness={0.9} metalness={0} transparent opacity={0}
        polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
    </mesh>
  )
}

/** Soft radial gradient used for the pool of light on the floor. */
function makeGlowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

/**
 * Studio lights plus the pull-cord lamp. Switching the lamp on dims the studio fill and
 * fades up a warm halogen spotlight (and a pool of light on the floor) over the car.
 */
function Lighting({ lampOn }) {
  const { scene } = useThree()
  const level = useRef(0)
  const ambient = useRef()
  const key = useRef()
  const rim = useRef()
  const halogen = useRef()
  const pool = useRef()
  const target = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.set(0, 0.3, 0)
    return o
  }, [])
  const glow = useMemo(makeGlowTexture, [])

  useFrame((_, dt) => {
    level.current = THREE.MathUtils.damp(level.current, lampOn ? 1 : 0, 3.2, dt)
    const v = level.current
    const dim = THREE.MathUtils.lerp(1, 0.22, v)
    scene.environmentIntensity = dim
    ambient.current.intensity = 0.35 * dim
    key.current.intensity = 1.6 * dim
    rim.current.intensity = 0.6 * dim
    halogen.current.intensity = v * 70
    pool.current.material.opacity = v * 0.55
  })

  return (
    <>
      <ambientLight ref={ambient} intensity={0.35} />
      <directionalLight ref={key} position={[5, 6, 4]} intensity={1.6} />
      <directionalLight ref={rim} position={[-5, 3, -4]} intensity={0.6} color={config.theme.accent} />
      <primitive object={target} />
      <spotLight
        ref={halogen}
        position={[0, 4.4, 0.1]}
        target={target}
        angle={0.55}
        penumbra={0.75}
        decay={2}
        color="#ffd9a0"
        intensity={0}
      />
      <mesh ref={pool} rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} renderOrder={1}>
        <circleGeometry args={[2.6, 64]} />
        <meshBasicMaterial map={glow} color="#ffcf8a" transparent opacity={0}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </>
  )
}

export default function Scene({ progress, variant, custom, focus, panelOpen, lampOn = false, speedOpen = false, bg = config.theme.bg }) {
  return (
    <>
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 10, 24]} />
      <Lighting lampOn={lampOn} />
      <SpeedWorld open={speedOpen} />

      <ScrollCamera progress={progress} focus={focus} panelOpen={panelOpen} />

      <ModelBoundary>
        <Suspense fallback={null}>
          <Bike url={config.model} variant={variant} custom={custom} />
          <Environment preset="city" />
        </Suspense>
      </ModelBoundary>

      <ContactShadows position={[0, 0, 0]} opacity={0.6} scale={12} blur={2.4} far={3} resolution={256} />
    </>
  )
}
