// Presets and persisted state for the car configurator.

export const PAINTS = [
  { name: 'Carmine', hex: '#b3122b' },
  { name: 'Signal orange', hex: '#ff5a1f' },
  { name: 'Sunburst', hex: '#f2b705' },
  { name: 'Forest', hex: '#1f5a3d' },
  { name: 'Ocean', hex: '#1456c2' },
  { name: 'Violet', hex: '#6a2fb5' },
  { name: 'Midnight', hex: '#10162b' },
  { name: 'Slate', hex: '#4a4d55' },
  { name: 'Arctic', hex: '#eef0f3' },
]

// Values are three.js MeshPhysicalMaterial settings.
export const PAINT_TYPES = [
  { id: 'gloss', name: 'Gloss', metalness: 0, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0 },
  { id: 'metallic', name: 'Metallic', metalness: 0.85, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0 },
  { id: 'matte', name: 'Matte', metalness: 0, roughness: 0.85, clearcoat: 0, clearcoatRoughness: 0.5, iridescence: 0 },
  { id: 'pearl', name: 'Pearl', metalness: 0.2, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.05, iridescence: 0.8 },
]

export const RIM_COLORS = [
  { name: 'Polished', hex: '#d9dce2' },
  { name: 'Gloss black', hex: '#0d0d10' },
  { name: 'Graphite', hex: '#3c4047' },
  { name: 'Gold', hex: '#c9a24a' },
  { name: 'Bronze', hex: '#8a5a2b' },
  { name: 'Copper', hex: '#b4552d' },
  { name: 'Red', hex: '#b3122b' },
]

export const RIM_FINISHES = [
  { id: 'chrome', name: 'Mirror', metalness: 1, roughness: 0.08 },
  { id: 'satin', name: 'Satin', metalness: 1, roughness: 0.4 },
  { id: 'gloss', name: 'Gloss', metalness: 0.2, roughness: 0.15 },
]

export const CALIPERS = [
  { name: 'Red', hex: '#d40000' },
  { name: 'Yellow', hex: '#ffc400' },
  { name: 'Orange', hex: '#ff6a00' },
  { name: 'Blue', hex: '#1a73ff' },
  { name: 'White', hex: '#f2f2f2' },
  { name: 'Black', hex: '#111114' },
]

export const SEATS = [
  { name: 'Obsidian', hex: '#17171a' },
  { name: 'Cognac', hex: '#9a5a2c' },
  { name: 'Sand', hex: '#c9b48c' },
  { name: 'Bone', hex: '#e8e2d4' },
  { name: 'Racing red', hex: '#a8141f' },
  { name: 'Navy', hex: '#1c2c54' },
  { name: 'Forest', hex: '#1f4a37' },
  { name: 'Grey', hex: '#6b6f78' },
]

export const SEAT_FINISHES = [
  { id: 'leather', name: 'Leather', roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4, sheen: 0 },
  { id: 'suede', name: 'Suede', roughness: 0.95, clearcoat: 0, clearcoatRoughness: 0.5, sheen: 1 },
  { id: 'patent', name: 'Patent', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0 },
]

export const HARDWARE = [
  { name: 'Silver', hex: '#c8cbd2' },
  { name: 'Brass', hex: '#c9a24a' },
  { name: 'Copper', hex: '#b4552d' },
  { name: 'Gunmetal', hex: '#4b4f57' },
  { name: 'Black', hex: '#121214' },
]

export const MATS = [
  { name: 'Black', hex: '#111114' },
  { name: 'Charcoal', hex: '#3a3d44' },
  { name: 'Tan', hex: '#8a6a45' },
  { name: 'Red', hex: '#8a1420' },
  { name: 'Cream', hex: '#d8d0bc' },
]

export const DASH_GLOWS = [
  { name: 'Ember', hex: '#ff4200' },
  { name: 'Ice', hex: '#33b8ff' },
  { name: 'Lime', hex: '#6dff3a' },
  { name: 'Violet', hex: '#a55bff' },
  { name: 'White', hex: '#ffffff' },
]

export const DEFAULTS = {
  interior: null, // seat and trim colour hex, or null for the factory finish
  seatFinish: 'leather',
  hardware: null, // pedals, handles, emblem
  mats: null, // floor mats
  dash: null, // dashboard display glow
  finish: 0, // index into config.variants (factory finish)
  paint: null, // custom hex, or null to use the factory finish
  paintType: 'gloss',
  twoTone: true, // darker roof, mirrors and trim
  rim: null, // custom hex, or null for stock
  rimFinish: 'chrome',
  caliper: null, // custom hex, or null for stock
}

const KEY = 'concept-car-config-v1'

export function loadCustom() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (raw && typeof raw === 'object') return { ...DEFAULTS, ...raw }
  } catch {}
  return { ...DEFAULTS }
}

export function saveCustom(c) {
  try { localStorage.setItem(KEY, JSON.stringify(c)) } catch {}
}
