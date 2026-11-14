import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { hand } from './handState.js'

const BASE = import.meta.env.BASE_URL
const HOLD = 7 // frames a gesture must hold before it counts

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
// A finger is straight when its tip is farther from the wrist than its middle joint.
const extended = (lm, tip, pip) => dist(lm[tip], lm[0]) > dist(lm[pip], lm[0]) * 1.1

function readGesture(lm) {
  const n = [[8, 6], [12, 10], [16, 14], [20, 18]].filter(([t, p]) => extended(lm, t, p)).length
  return n >= 3 ? 'open' : n <= 1 ? 'fist' : null
}

/**
 * Webcam hand control. Open hand takes the car apart, a fist puts it back together,
 * and moving the hand left or right turns it. Video never leaves the browser.
 */
export default function HandControl({ onOpen, onFist }) {
  const [state, setState] = useState('off') // off | loading | on | error
  const [seen, setSeen] = useState(false)
  const videoRef = useRef(null)
  const cb = useRef({ onOpen, onFist })
  cb.current = { onOpen, onFist }

  useEffect(() => {
    if (state !== 'loading' && state !== 'on') return
    let stop = false
    let raf = 0
    let stream = null
    let landmarker = null
    ;(async () => {
      try {
        const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
        const files = await FilesetResolver.forVisionTasks(`${BASE}mediapipe`)
        landmarker = await HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: `${BASE}mediapipe/hand_landmarker.task`, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 1,
        })
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })
        if (stop) return
        const v = videoRef.current
        v.srcObject = stream
        await v.play()
        setState('on')

        let last = null
        let count = 0
        let fired = null
        let lastT = -1
        let wasSeen = false
        const loop = () => {
          if (stop) return
          raf = requestAnimationFrame(loop)
          if (v.readyState < 2 || v.currentTime === lastT) return
          lastT = v.currentTime
          const res = landmarker.detectForVideo(v, performance.now())
          const lm = res.landmarks?.[0]
          if (!lm) {
            hand.active = false
            count = 0
            last = null
            if (wasSeen) { wasSeen = false; setSeen(false) }
            return
          }
          if (!wasSeen) { wasSeen = true; setSeen(true) }
          hand.active = true
          // Video is shown mirrored, so flip x. Centre of the frame = car facing forward.
          const x = 1 - lm[9].x
          const target = (x - 0.5) * 2 * 1.2
          hand.ry += (target - hand.ry) * 0.15

          const g = readGesture(lm)
          if (g && g === last) count++
          else { last = g; count = 0 }
          if (g && count === HOLD && g !== fired) {
            fired = g
            g === 'open' ? cb.current.onOpen() : cb.current.onFist()
          }
        }
        loop()
      } catch (e) {
        console.warn('Hand control failed', e)
        if (!stop) setState('error')
      }
    })()
    return () => {
      stop = true
      cancelAnimationFrame(raf)
      hand.active = false
      hand.ry = 0
      stream?.getTracks().forEach((t) => t.stop())
      landmarker?.close()
    }
  }, [state === 'off' || state === 'error'])

  const on = state === 'loading' || state === 'on'
  return (
    <>
      <button type="button" className="btn small ghost" aria-pressed={on}
        onClick={() => setState(on ? 'off' : 'loading')}>
        {state === 'loading' ? 'Starting camera...' : on ? 'Stop hand control' : 'Hand control'}
      </button>
      {createPortal(<div className={`hand-cam${on ? ' open' : ''}${seen ? ' seen' : ''}`} aria-hidden={!on}>
        <video ref={videoRef} muted playsInline />
        <span>{seen ? 'Open hand: apart. Fist: together. Move: turn.' : 'Show your hand to the camera'}</span>
      </div>, document.body)}
      {state === 'error' && <span className="hand-err" role="alert">Camera or hand model unavailable</span>}
    </>
  )
}
