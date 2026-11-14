import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, useFrame } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import { sim, UNITS_PER_METRE } from './speedtest.js'
import { hand } from './handState.js'
import { EXPLODE_PARTS, EXPLODE_SECONDS, ASSEMBLE_SECONDS, EXPLODE_SPAN } from './explode.js'
import * as THREE from 'three'
import { DEFAULTS, PAINT_TYPES, RIM_FINISHES, SEAT_FINISHES } from './customization.js'

const TARGET_SIZE = 3 // longest side of the model, in scene units
const SHOW_AT = new THREE.Vector3(0, 1.15, 0.3) // where a selected part is displayed

const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

/**
 * Loads the GLB, then recentres and rescales it so the camera keyframes in
 * site.config.json work regardless of the model's original units/origin.
 * The model is centred on X/Z and rests on y = 0.
 *
 * `variant` (index or null) switches KHR_materials_variants finishes.
 * `custom` layers the configurator on top: custom paint, rim and caliper colours.
 */
const ORBIT_C = new THREE.Vector3()
const Y_AXIS = new THREE.Vector3(0, 1, 0)

export default function Bike({ url, variant = null, custom = DEFAULTS, doorsOpen = false, exploded = false, centered = false, progress = null, selected = null, viewRef = null, onSelectPart = () => {} }) {
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

  // Scissor doors. Each door node (with its window, mirror and trim as children) is moved
  // under a pivot placed at the door's front edge, then the pivot is rotated about the
  // car's lateral axis so the rear of the door lifts. The nose points to +Z, left is +X.
  const doorRig = useRef({ list: [], level: 0 })
  useEffect(() => {
    const list = []
    model.updateWorldMatrix(true, true)
    for (const [name, side] of [['BodyDoorLColor1', 1], ['BodyDoorRColor1', -1]]) {
      const door = scene.getObjectByName(name)
      if (!door) continue
      const parent = door.parent
      const box = new THREE.Box3().setFromObject(door)
      const hinge = new THREE.Vector3(
        (box.min.x + box.max.x) / 2,
        box.min.y + (box.max.y - box.min.y) * 0.55,
        box.max.z - (box.max.z - box.min.z) * 0.1
      )
      const pivot = new THREE.Group()
      pivot.position.copy(hinge)
      model.add(pivot)
      pivot.updateMatrixWorld(true)
      pivot.attach(door)
      door.userData.pivot = pivot // the exploded view moves the pivot, not the door
      list.push({ door, parent, pivot, side })
    }
    doorRig.current.list = list
    return () => {
      for (const d of list) {
        d.pivot.rotation.set(0, 0, 0)
        delete d.door.userData.pivot
        d.parent.attach(d.door)
        d.pivot.removeFromParent()
      }
      doorRig.current.list = []
    }
  }, [scene, model])

  useFrame((_, dt) => {
    const rig = doorRig.current
    const target = doorsOpen ? 1 : 0
    if (Math.abs(rig.level - target) < 0.0005) return
    rig.level = THREE.MathUtils.damp(rig.level, target, 2.6, Math.min(dt, 0.05))
    const e = rig.level * rig.level * (3 - 2 * rig.level)
    for (const d of rig.list) {
      d.pivot.rotation.x = e * 1.15 // lifts the rear of the door
      d.pivot.rotation.z = -d.side * e * 0.1 // a touch of outward tilt, like a wing
    }
  })

  // Exploded view. Every part gets a pivot at its own centre, so it can slide apart, and when
  // selected, scale up and spin about itself. `p` is the timeline (0 assembled, 1 fully apart).
  const [callouts, setCallouts] = useState([])
  const [labelsOn, setLabelsOn] = useState(false)
  const explodeRig = useRef({ p: 0, parts: [], spin: 0, sway: 0, orbit: 0, labels: false, engine: null, rootMat: null })
  useEffect(() => {
    model.updateWorldMatrix(true, true)
    const parts = []
    const found = []
    for (const def of EXPLODE_PARTS) {
      const nodes = def.nodes
        .map((n) => model.getObjectByName(n.replace(/ /g, '_'))) // not `scene`: doors live under pivots
        .filter(Boolean)
        .map((n) => n.userData.pivot ?? n)
      if (!nodes.length) continue
      const box = new THREE.Box3()
      nodes.forEach((n) => box.expandByObject(n, true))
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const pivot = new THREE.Group()
      pivot.position.copy(center)
      model.add(pivot)
      pivot.updateMatrixWorld(true)
      const parents = nodes.map((n) => n.parent)
      nodes.forEach((n) => pivot.attach(n))
      parts.push({
        def, pivot, nodes, parents, center,
        off: new THREE.Vector3(...def.off),
        showScale: THREE.MathUtils.clamp(3.4 / Math.max(size.x, size.y, size.z), 1, 4),
        sel: 0, hide: 0,
      })
      if (def.label) found.push({ id: def.id, def, node: pivot })
    }

    // The stock engine material is nearly black, which disappears on the dark background.
    let engine = null
    model.getObjectByName('Engine')?.traverse((o) => {
      if (o.isMesh && !engine) {
        const original = o.material
        const mat = original.clone()
        o.material = mat
        engine = { mesh: o, original, mat, steel: new THREE.Color('#9aa3b2'), base: original.color.clone() }
      }
    })
    // The chassis mesh is the scene root and cannot be moved; hide it while a part is on show.
    const rootMesh = model.getObjectByName('BodyUnderside')
    let rootMat = null
    if (rootMesh?.isMesh && !Array.isArray(rootMesh.material)) {
      rootMat = rootMesh.material.clone()
      rootMesh.userData.origMaterial = rootMesh.material
      rootMesh.material = rootMat
    }
    explodeRig.current.engine = engine
    explodeRig.current.rootMat = rootMat
    explodeRig.current.parts = parts
    setCallouts(found)
    return () => {
      for (const part of parts) {
        part.nodes.forEach((n, i) => part.parents[i].attach(n))
        part.pivot.removeFromParent()
      }
      if (engine) { engine.mesh.material = engine.original; engine.mat.dispose() }
      if (rootMesh?.userData.origMaterial) { rootMesh.material = rootMesh.userData.origMaterial; rootMat?.dispose() }
      explodeRig.current.engine = null
      explodeRig.current.rootMat = null
      explodeRig.current.parts = []
      setCallouts([])
    }
  }, [scene, model])

  // A new selection starts from a pleasant three-quarter angle.
  useEffect(() => {
    if (viewRef) Object.assign(viewRef.current, { rx: 0.25, ry: -0.6, zoom: 1, drag: false })
  }, [selected, viewRef])

  useFrame((_, dt) => {
    const rig = explodeRig.current
    dt = Math.min(dt, 0.25)
    const target = exploded ? 1 : 0
    if (rig.p !== target) {
      const secs = exploded ? EXPLODE_SECONDS : ASSEMBLE_SECONDS
      rig.p = rig.p < target ? Math.min(target, rig.p + dt / secs) : Math.max(target, rig.p - dt / secs)
    }
    const view = viewRef?.current
    if (selected && view && !view.drag) view.ry += dt * 0.45 // slow turntable until grabbed

    let anySelected = false
    for (const part of rig.parts) {
      const isSel = selected === part.def.id
      part.sel = THREE.MathUtils.damp(part.sel, isSel ? 1 : 0, 4, dt)
      part.hide = THREE.MathUtils.damp(part.hide, selected && !isSel ? 1 : 0, 5, dt)
      if (part.sel > 0.01) anySelected = true
      const u = THREE.MathUtils.clamp((rig.p - part.def.start) / EXPLODE_SPAN, 0, 1)
      const e = u * u * (3 - 2 * u)
      const k = part.sel * part.sel * (3 - 2 * part.sel)
      part.pivot.position.copy(part.center).addScaledVector(part.off, e)
      part.pivot.position.lerp(SHOW_AT, k)
      const scale = THREE.MathUtils.lerp(1, part.showScale * (view?.zoom ?? 1), k) * (1 - part.hide)
      part.pivot.scale.setScalar(Math.max(scale, 0.0001))
      part.pivot.visible = scale > 0.02
      part.pivot.rotation.set((view?.rx ?? 0) * k, (view?.ry ?? 0) * k, 0)
      if (part.def.id === 'engine' && rig.engine) {
        const m = rig.engine.mat
        m.color.lerpColors(rig.engine.base, rig.engine.steel, e)
        m.metalness = THREE.MathUtils.lerp(0.2, 0.9, e)
        m.roughness = THREE.MathUtils.lerp(0.5, 0.3, e)
        m.emissive.set('#ff4d2e')
        m.emissiveIntensity = e * 0.12
      }
    }
    if (rig.rootMat) rig.rootMat.visible = !anySelected

    // Show callouts only while fully apart and nothing is on show.
    const on = exploded && rig.p >= 0.999 && !selected
    if (on !== rig.labels) {
      rig.labels = on
      setLabelsOn(on)
    }
    // Gentle sway while apart (keeps callouts on the same sides); still while inspecting a part.
    // While apart the whole car slowly sweeps left to right and back (paused while inspecting a part).
    if (exploded && rig.p > 0.7 && !selected) rig.sway += dt
    const sweep = exploded && rig.p > 0.7 && !selected && !hand.active ? Math.sin(rig.sway * 0.6) * 0.5 : 0
    rig.spin = THREE.MathUtils.damp(rig.spin, sweep, 2.5, dt)
    model.position.x = rig.spin
    rig.turn = THREE.MathUtils.damp(rig.turn ?? 0, hand.active ? hand.ry : 0, 6, dt)
    model.rotation.y = rig.turn
  })

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
    // Tyre radius is 0.36 model units; convert to metres with the car's real length.
    const radiusM = (0.36 * scene.scale.x) / UNITS_PER_METRE
    const delta = Math.min(((metresPerSec * Math.min(dt, 0.5)) / radiusM), 0.9)
    for (const w of wheels) w.rotateX(delta)
  })

  // Wheels turn as the page scrolls (down = forward, up = backward).
  const lastP = useRef(null)
  useFrame(() => {
    if (!progress || !wheels.length) return
    const p = progress.get()
    if (lastP.current === null) lastP.current = p
    const dp = p - lastP.current
    lastP.current = p
    if (Math.abs(dp) < 1e-6 || Math.abs(dp) > 0.2) return
    for (const w of wheels) w.rotateX(THREE.MathUtils.clamp(dp * 70, -0.8, 0.8))
  })

  // Drive to the middle of the screen: the car rolls along its own length (nose is +Z), wheels turning,
  // until it projects to the screen centre, and rolls back after reassembly.
  const drive = useRef({ d: 0, need: 0, v: new THREE.Vector3(), w: new THREE.Vector3() })
  useFrame(({ camera }, dt) => {
    const r = drive.current
    if (centered) {
      const z0 = model.position.z
      model.position.z = 0
      model.updateWorldMatrix(true, false)
      r.v.set(0, 0.6, 0).applyMatrix4(model.matrixWorld).project(camera)
      const x0 = r.v.x
      r.w.set(0, 0.6, 1).applyMatrix4(model.matrixWorld).project(camera)
      const slope = r.w.x - x0
      model.position.z = z0
      r.need = Math.abs(slope) > 0.01 ? THREE.MathUtils.clamp(-x0 / slope, -6, 6) : 0
    }
    const target = centered ? r.need : 0
    const step = THREE.MathUtils.damp(model.position.z, target, 2.4, Math.min(dt, 0.25)) - model.position.z
    if (Math.abs(step) < 1e-5) return
    model.position.z += step
    // wheels roll: distance / radius
    for (const w of wheels) w.rotateX(step / (0.36 * scene.scale.x))
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

  return (
    <>
      <primitive object={model} />
      {callouts.map((c) =>
        createPortal(
          <Html zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
            <div
              className={`xl ${c.def.side}${labelsOn ? ' on' : ''}${c.def.hero ? ' hero' : ''}`}
              style={{
                '--dy': `${c.def.dy ?? 0}px`,
                '--len': `${Math.hypot(44, c.def.dy ?? 0)}px`,
                '--ang': `${Math.atan2(c.def.dy ?? 0, 44)}rad`,
              }}
            >
              <i className="dot" />
              <span className="line" />
              <button type="button" className="tag" tabIndex={labelsOn ? 0 : -1} onClick={() => onSelectPart(c.id)}>
                <b>{c.def.label}</b>
                <small>{c.def.note}</small>
              </button>
            </div>
          </Html>,
          c.node
        )
      )}
    </>
  )
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
