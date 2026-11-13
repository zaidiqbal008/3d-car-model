import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { sim } from './speedtest.js'
import * as THREE from 'three'
import { DEFAULTS, PAINT_TYPES, RIM_FINISHES, SEAT_FINISHES } from './customization.js'

const TARGET_SIZE = 3 // longest side of the model, in scene units

const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

/**
 * Loads the GLB, then recentres and rescales it so the camera keyframes in
 * site.config.json work regardless of the model's original units/origin.
 * The model is centred on X/Z and rests on y = 0.
 *
 * `variant` (index or null) switches KHR_materials_variants finishes.
 * `custom` layers the configurator on top: custom paint, rim and caliper colours.
 */
export default function Bike({ url, variant = null, custom = DEFAULTS }) {
  const gltf = useGLTF(url)
  const { scene, parser } = gltf

  const model = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const scale = TARGET_SIZE / Math.max(size.x, size.y, size.z)
    const group = new THREE.Group()
    scene.scale.setScalar(scale)
    scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
    group.add(scene)
    return group
  }, [scene])

  // KHR_materials_transmission makes three.js re-render the whole scene into an offscreen
  // buffer every frame. Swap it for plain transparency, which looks close and costs far less.
  useEffect(() => {
    const seen = new Set()
    scene.traverse((o) => {
      const m = o.isMesh && o.material
      if (!m || Array.isArray(m) || seen.has(m) || !(m.transmission > 0)) return
      seen.add(m)
      m.transmission = 0
      m.transparent = true
      m.opacity = 0.3
      m.depthWrite = false
      m.roughness = Math.min(m.roughness, 0.08)
      m.needsUpdate = true
    })
  }, [scene])

  // Spin the wheels with the speed test. Each wheel node's local X axis is its axle.
  const wheels = useMemo(
    () => ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR'].map((n) => scene.getObjectByName(n)).filter(Boolean),
    [scene]
  )
  useFrame((_, dt) => {
    if (sim.v <= 0 || !wheels.length) return
    const metresPerSec = sim.v / 3.6
    // Tyre radius is 0.36 model units; convert metres to model units via the car's real length.
    const radiusM = 0.36 * (4.78 / (3 / scene.scale.x))
    const delta = Math.min(((metresPerSec * Math.min(dt, 0.5)) / radiusM), 0.9)
    for (const w of wheels) w.rotateX(delta)
  })

  // Our own paint materials, used instead of the factory ones for custom colours.
  const paint = useMemo(() => {
    const make = () => new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide })
    return { body: make(), accent: make(), seat: make() }
  }, [])
  useEffect(() => () => { paint.body.dispose(); paint.accent.dispose(); paint.seat.dispose() }, [paint])

  // Factory finish (KHR_materials_variants) and custom paint assignment.
  const customPaint = isHex(custom.paint)
  const customSeat = isHex(custom.interior)
  useEffect(() => {
    let cancelled = false
    scene.traverse((o) => {
      if (!o.isMesh) return
      o.userData.baseMaterial ??= o.material
      const base = o.userData.baseMaterial
      const role = /^Paint 1/.test(base.name) ? 'body' : /^Paint 2/.test(base.name) ? 'accent' : null
      if (customPaint && role) {
        o.material = paint[role]
        return
      }
      // Seats, door cards and trim use 'Interior 3'. Borrow its grain so custom trim keeps texture.
      if (customSeat && /^Interior 3/.test(base.name)) {
        if (!paint.seat.normalMap && base.normalMap) {
          paint.seat.normalMap = base.normalMap
          paint.seat.normalScale = base.normalScale.clone()
          paint.seat.needsUpdate = true
        }
        o.material = paint.seat
        return
      }
      const ext = o.userData.gltfExtensions?.KHR_materials_variants
      if (!ext || variant == null) {
        o.material = base
        return
      }
      const map = ext.mappings.find((m) => m.variants.includes(variant))
      if (!map) {
        o.material = base
        return
      }
      parser.getDependency('material', map.material).then((mat) => {
        if (cancelled) return
        o.material = mat
        parser.assignFinalMaterial?.(o)
      })
    })
    return () => {
      cancelled = true
    }
  }, [variant, customPaint, customSeat, scene, parser, paint])

  // Custom paint colour and finish.
  useEffect(() => {
    if (!customPaint) return
    const t = PAINT_TYPES.find((p) => p.id === custom.paintType) ?? PAINT_TYPES[0]
    const body = new THREE.Color(custom.paint)
    const accent = custom.twoTone ? body.clone().multiplyScalar(0.1) : body
    const apply = (m, color, gloss) => {
      const wasIri = m.iridescence
      m.color.copy(color)
      m.metalness = t.metalness
      m.roughness = gloss ? 0.2 : t.roughness
      m.clearcoat = gloss ? 1 : t.clearcoat
      m.clearcoatRoughness = t.clearcoatRoughness
      m.iridescence = t.iridescence
      m.iridescenceIOR = 1.3
      m.iridescenceThicknessRange = [100, 400]
      if ((wasIri > 0) !== (m.iridescence > 0)) m.needsUpdate = true
    }
    apply(paint.body, body, false)
    // A dark accent reads best glossy, whatever the body finish.
    apply(paint.accent, accent, custom.twoTone)
  }, [customPaint, custom.paint, custom.paintType, custom.twoTone, paint])

  // Custom seat and trim colour and material.
  useEffect(() => {
    if (!customSeat) return
    const f = SEAT_FINISHES.find((x) => x.id === custom.seatFinish) ?? SEAT_FINISHES[0]
    const m = paint.seat
    m.color.set(custom.interior)
    m.metalness = 0
    m.roughness = f.roughness
    m.clearcoat = f.clearcoat
    m.clearcoatRoughness = f.clearcoatRoughness
    const wasSheen = m.sheen
    m.sheen = f.sheen
    m.sheenRoughness = 0.6
    m.sheenColor.set(custom.interior).lerp(new THREE.Color('#ffffff'), 0.35)
    if ((wasSheen > 0) !== (m.sheen > 0)) m.needsUpdate = true
  }, [customSeat, custom.interior, custom.seatFinish, paint])

  // Rims and brake calipers. three.js clones materials for meshes without tangents, so
  // edit the materials actually on the meshes (matched by name), remembering originals.
  useEffect(() => {
    const remember = (m) => (m.userData.orig ??= {
      color: m.color.clone(),
      metalness: m.metalness,
      roughness: m.roughness,
      emissiveIntensity: m.emissiveIntensity,
      emissive: m.emissive.clone(),
    })
    const restore = (m) => {
      const o = remember(m)
      m.color.copy(o.color)
      m.metalness = o.metalness
      m.roughness = o.roughness
      m.emissiveIntensity = o.emissiveIntensity
      m.emissive.copy(o.emissive)
    }
    // Rim2 is the wheel's centre star, Rim1 its spokes. Calipers are 'Brake'.
    const rimFinish = RIM_FINISHES.find((x) => x.id === custom.rimFinish) ?? RIM_FINISHES[0]
    scene.traverse((o) => {
      const m = o.isMesh && o.material
      if (!m || Array.isArray(m)) return
      if (m.name === 'Rim2' || m.name === 'Rim1') {
        remember(m)
        if (isHex(custom.rim)) {
          m.color.set(custom.rim)
          m.metalness = rimFinish.metalness
          m.roughness = rimFinish.roughness
          m.emissiveIntensity = 0
        } else restore(m)
      } else if (m.name === 'Hardware') {
        remember(m)
        if (isHex(custom.hardware)) {
          m.color.set(custom.hardware)
          m.metalness = 1
          m.roughness = 0.3
          m.emissiveIntensity = 0
        } else restore(m)
      } else if (m.name === 'Floormat') {
        remember(m)
        if (isHex(custom.mats)) m.color.set(custom.mats)
        else restore(m)
      } else if (m.name === 'Dashboard') {
        remember(m)
        if (isHex(custom.dash)) m.emissive.set(custom.dash)
        else restore(m)
      } else if (m.name === 'Brake') {
        remember(m)
        if (isHex(custom.caliper)) {
          m.color.set(custom.caliper)
          m.emissiveIntensity = 0
        } else restore(m)
      }
    })
  }, [scene, custom.rim, custom.rimFinish, custom.caliper, custom.hardware, custom.mats, custom.dash])

  return <primitive object={model} />
}

/** Simple stand-in so the site works before bike.glb has been added. */
export function ProceduralBike() {
  const metal = { color: '#b9bcc4', metalness: 0.9, roughness: 0.25 }
  const paint = { color: '#c8491a', metalness: 0.6, roughness: 0.3 }
  const wheel = (x) => (
    <group position={[x, 0.45, 0]}>
      <mesh rotation={[0, 0, 0]}>
        <torusGeometry args={[0.42, 0.07, 16, 48]} />
        <meshStandardMaterial color="#15151a" roughness={0.9} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.3, 0.015, 8, 32]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial {...metal} />
      </mesh>
    </group>
  )
  return (
    <group>
      {wheel(-0.95)}
      {wheel(0.95)}
      {/* frame */}
      <mesh position={[0, 0.75, 0]} rotation={[0, 0, 0.15]}>
        <boxGeometry args={[1.7, 0.08, 0.1]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {/* tank */}
      <mesh position={[0.25, 1.0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.18, 0.55, 8, 16]} />
        <meshStandardMaterial {...paint} />
      </mesh>
      {/* seat */}
      <mesh position={[-0.45, 0.95, 0]}>
        <boxGeometry args={[0.8, 0.12, 0.28]} />
        <meshStandardMaterial color="#1c1410" roughness={0.8} />
      </mesh>
      {/* engine */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.55, 0.4, 0.3]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {/* forks + bars */}
      <mesh position={[0.82, 0.8, 0]} rotation={[0, 0, -0.35]}>
        <cylinderGeometry args={[0.03, 0.03, 0.85, 12]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[0.72, 1.2, 0]}>
        <boxGeometry args={[0.06, 0.06, 0.7]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {/* headlamp */}
      <mesh position={[0.88, 1.08, 0]}>
        <sphereGeometry args={[0.13, 20, 20]} />
        <meshStandardMaterial color="#fff3d0" emissive="#ffd88a" emissiveIntensity={0.6} />
      </mesh>
    </group>
  )
}
