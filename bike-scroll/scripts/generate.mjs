#!/usr/bin/env node
// Scroll-site generator: writes src/site.config.json from a few options.
//
//   npm run generate -- --name "My Bike" --sections 6 --accent "#00c2ff" \
//     --model /models/bike.glb
//
// Each section gets a camera angle from the preset orbit below, alternating
// text alignment. Edit the generated JSON afterwards to write your copy.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'src', 'site.config.json')

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] ?? true])
    return acc
  }, [])
)

let prev = {}
try { prev = JSON.parse(readFileSync(out, 'utf8')) } catch {}

const count = Math.max(2, Math.min(12, Number(args.sections) || 5))
const name = args.name || prev.name || 'My Bike'

// Orbit the bike once; every other section dips in close for a detail shot.
const sections = Array.from({ length: count }, (_, i) => {
  const angle = (i / count) * Math.PI * 2 + 0.6
  const close = i % 3 === 2
  const r = close ? 2.6 : 5
  return {
    id: `section-${i + 1}`,
    eyebrow: `Chapter ${String(i + 1).padStart(2, '0')}`,
    title: i === 0 ? name : `Section ${i + 1} headline`,
    body: 'Write something short and punchy about this angle of the bike.',
    align: ['left', 'right', 'center'][i % 3],
    camera: {
      position: [
        +(Math.sin(angle) * r).toFixed(2),
        +(close ? 0.5 : 1.2).toFixed(2),
        +(Math.cos(angle) * r).toFixed(2),
      ],
      target: [0, 0.5, 0],
    },
    rotation: 0,
  }
})

const config = {
  ...prev,
  name,
  model: args.model || prev.model || '/models/bike.glb',
  theme: {
    bg: args.bg || prev.theme?.bg || '#0b0b0f',
    fg: args.fg || prev.theme?.fg || '#f4f1ea',
    accent: args.accent || prev.theme?.accent || '#ff6b2c',
  },
  credit: prev.credit || {
    text: '"Model" by Author',
    url: 'https://sketchfab.com/',
    license: 'CC BY 4.0',
    licenseUrl: 'http://creativecommons.org/licenses/by/4.0/',
  },
  sections,
}

writeFileSync(out, JSON.stringify(config, null, 2) + '\n')
console.log(`Wrote ${out} with ${count} sections.`)
