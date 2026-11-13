// A tiny acceleration simulator shared by the 3D scene (road, wheels, camera) and the HUD.
// It is stepped once per frame by the scene; the HUD only reads it.
//
// Speed follows v(t) = vmax * (1 - exp(-t / tau)), with tau chosen so the car reaches
// 100 km/h at exactly `t100` seconds. That makes the readout match the concept's target
// figures in content.json; it is a simulation, not a physics model of the car.

export const sim = {
  state: 'idle', // idle | running | braking
  t: 0, // seconds since launch
  v: 0, // km/h
  dist: 0, // metres
  t100: null,
  t200: null,
  top: 0,
  vmax: 290,
  t100Target: 2.9,
  tau: 6.86,
}

const BRAKE = 38 // km/h lost per second while braking (~10.5 m/s²)

export function configure({ t100, vmax }) {
  sim.t100Target = t100
  sim.vmax = vmax
  sim.tau = -t100 / Math.log(1 - 100 / vmax)
}

export function reset() {
  Object.assign(sim, { state: 'idle', t: 0, v: 0, dist: 0, t100: null, t200: null, top: 0 })
}

export function launch() {
  reset()
  sim.state = 'running'
}

export function brake() {
  if (sim.state === 'running') sim.state = 'braking'
}

export function step(frameDt) {
  // Follow the real clock even on a slow frame, in small sub-steps so the curve stays smooth.
  let left = Math.min(frameDt, 0.5)
  while (left > 1e-6) {
    const dt = Math.min(left, 0.02)
    left -= dt
    if (sim.state === 'running') {
      sim.t += dt
      sim.v = Math.min(sim.vmax * 0.995, sim.vmax * (1 - Math.exp(-sim.t / sim.tau)))
      if (sim.t100 == null && sim.v >= 100) sim.t100 = sim.t
      if (sim.t200 == null && sim.v >= 200) sim.t200 = sim.t
    } else if (sim.state === 'braking') {
      sim.v = Math.max(0, sim.v - BRAKE * dt)
      if (sim.v === 0) sim.state = 'idle'
    }
    sim.dist += (sim.v / 3.6) * dt
    sim.top = Math.max(sim.top, sim.v)
  }
}
