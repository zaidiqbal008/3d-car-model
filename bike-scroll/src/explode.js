// Exploded ("engine detailing") view. Each part is a group of glTF node names that fly apart
// together. `off` is the world-space offset in scene units at full explosion (x: +left / -right,
// y: up, z: +nose / -tail). `start` staggers the motion: parts with a small `start` leave first
// when exploding and arrive last when assembling, so the engine goes in before the body panels.
// `label` makes a callout appear when the view is fully open; `side` is the side of the line.

export const EXPLODE_PARTS = [
  { id: 'hood', nodes: ['BodyHood'], off: [0, 1.1, 2.4], start: 0.0,
    label: 'Hood and headlights', note: 'Matrix LED lamps behind one dark lens', side: 'l' },
  { id: 'windshield', nodes: ['BodyWindshield', 'BodyWindshieldGasket', 'BodyWindshieldWipers', 'BodyWindshieldWipersBase'],
    off: [0, 1.5, 0.3], start: 0.05, label: 'Windshield and wipers', note: 'Laminated glass', side: 'r' },
  { id: 'roof', nodes: ['BodyRoofPanel'], off: [0, 2.1, -0.7], start: 0.08,
    label: 'Roof panel', note: 'Low, flat roofline', side: 'r' },
  { id: 'frame', nodes: ['BodyPillars', 'BodyPanelsColor2'], off: [0, 1.0, -0.2], start: 0.12 },
  { id: 'doorL', nodes: ['BodyDoorLColor1'], off: [1.4, 0.4, 0], start: 0.1,
    label: 'Left door', note: 'Scissor door with window and mirror', side: 'r', dy: -26 },
  { id: 'doorR', nodes: ['BodyDoorRColor1'], off: [-1.4, 0.4, 0], start: 0.1,
    label: 'Right door', note: 'Mirrored scissor door', side: 'l', dy: 26 },
  { id: 'rear', nodes: ['BodyRearPanelsColor1'], off: [0, 0.6, -2.0], start: 0.14,
    label: 'Rear body and lights', note: 'Tail-lights and rear glass', side: 'r', dy: -45 },
  { id: 'plate', nodes: ['License Plate'], off: [0, 0.2, -2.3], start: 0.16 },
  { id: 'wheelFL', nodes: ['WheelFrontL'], off: [1.55, 0, 0.9], start: 0.04,
    label: 'Front wheel and brake', note: '21 in forged alloy, carbon-ceramic disc', side: 'r' },
  { id: 'wheelFR', nodes: ['WheelFrontR'], off: [-1.55, 0, 0.9], start: 0.04 },
  { id: 'wheelRL', nodes: ['WheelRearL'], off: [1.55, 0, -0.9], start: 0.04 },
  { id: 'wheelRR', nodes: ['WheelRearR'], off: [-1.55, 0, -0.9], start: 0.04,
    label: 'Rear wheel', note: 'Wider rear tyres', side: 'l', dy: 42 },
  { id: 'seats', nodes: ['InteriorSeatsColor1', 'InteriorSeatsColor2', 'InteriorSeatsFrame1', 'InteriorSeatsFrame2'],
    off: [0, 0.85, -0.9], start: 0.3, label: 'Seats', note: 'Bolstered, driver-first', side: 'r', dy: 24 },
  { id: 'cockpit',
    nodes: ['InteriorDashMid', 'InteriorDashSides', 'InteriorSteeringBase', 'InteriorSteeringCylinder', 'InteriorSteeringDash',
      'InteriorSteeringDashColumn', 'InteriorSteeringHandleL', 'InteriorSteeringHandleR'],
    off: [0, 0.95, -0.1], start: 0.28, label: 'Cockpit and steering', note: 'Dashboard, display and wheel', side: 'l', dy: -34 },
  { id: 'floor', nodes: ['InteriorFloor', 'InteriorFloormats', 'InteriorCage', 'InteriorMid', 'InteriorPillar'],
    off: [0, 0.25, 0], start: 0.32 },
  { id: 'pedals', nodes: ['InteriorPedalAccel', 'InteriorPedalAccelArm', 'InteriorPedalBrake', 'InteriorPedalBrakeArm'],
    off: [0, 0.55, 1.0], start: 0.3 },
  { id: 'axles', nodes: ['Axles'], off: [0, -0.7, 0], start: 0.5,
    label: 'Axles', note: 'Front and rear drive shafts', side: 'l', dy: 20 },
  { id: 'engine', nodes: ['Engine'], off: [0, 1.9, 1.0], start: 0.42, hero: true,
    label: 'Engine', note: 'Dual-motor drive: 710 kW, 1,150 Nm', side: 'r' },
]

export const EXPLODE_SECONDS = 3.4
export const ASSEMBLE_SECONDS = 4.2
export const EXPLODE_SPAN = 0.55 // fraction of the timeline each part takes to travel
