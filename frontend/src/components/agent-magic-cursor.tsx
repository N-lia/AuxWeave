import { motion, useAnimationFrame, useMotionValue, useSpring, useTransform } from 'motion/react'
import { useEffect } from 'react'

type Props = {
  /** Whether the WebMCP co-design agent is active and should show its cursor. */
  active: boolean
}

// The orb sits near the human pointer, not on top of it, so both cursors
// stay visibly distinct: yours (the system pointer) and the agent's (the orb).
const AGENT_OFFSET_X = 26
const AGENT_OFFSET_Y = -26
// Small idle wander so the orb feels like an independent presence rather
// than a decoration glued to your pointer.
const WANDER_RADIUS = 4
const WANDER_SPEED = 0.0016

/**
 * A second, "agent" cursor shown alongside the normal system pointer while
 * the Co-Design Agent (WebMCP) is active: a glowing orb that trails near the
 * human cursor with its own lag and gentle idle motion, rather than
 * replacing the pointer outright.
 */
export default function AgentMagicCursor({ active }: Props) {
  const pointerX = useMotionValue(-200)
  const pointerY = useMotionValue(-200)
  const wanderT = useMotionValue(0)

  const targetX = useTransform(
    [pointerX, wanderT],
    ([px, t]: number[]) => px + AGENT_OFFSET_X + Math.cos(t) * WANDER_RADIUS,
  )
  const targetY = useTransform(
    [pointerY, wanderT],
    ([py, t]: number[]) => py + AGENT_OFFSET_Y + Math.sin(t * 1.3) * WANDER_RADIUS,
  )

  // Tight-ish spring for the orb core so it noticeably trails the human cursor.
  const coreX = useSpring(targetX, { stiffness: 220, damping: 22, mass: 0.5 })
  const coreY = useSpring(targetY, { stiffness: 220, damping: 22, mass: 0.5 })
  // Looser spring for the halo so it lags further behind, giving a comet-tail feel.
  const haloX = useSpring(targetX, { stiffness: 90, damping: 16, mass: 0.7 })
  const haloY = useSpring(targetY, { stiffness: 90, damping: 16, mass: 0.7 })

  useAnimationFrame(t => {
    wanderT.set(t * WANDER_SPEED)
  })

  useEffect(() => {
    if (!active) return
    const onPointerMove = (e: PointerEvent) => {
      pointerX.set(e.clientX)
      pointerY.set(e.clientY)
    }
    window.addEventListener('pointermove', onPointerMove)
    return () => window.removeEventListener('pointermove', onPointerMove)
  }, [active, pointerX, pointerY])

  if (!active) return null

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[10070] overflow-hidden"
      aria-hidden="true"
      data-Auxweave-chrome
    >
      {/* Trailing halo */}
      <motion.div
        className="absolute rounded-full"
        style={{
          left: 0,
          top: 0,
          x: haloX,
          y: haloY,
          translateX: '-50%',
          translateY: '-50%',
          width: 44,
          height: 44,
          background:
            'radial-gradient(circle, rgba(168,85,247,0.35) 0%, rgba(99,102,241,0.18) 55%, rgba(99,102,241,0) 78%)',
          filter: 'blur(1px)',
        }}
      />

      {/* Orb core (the agent's own cursor) */}
      <motion.div
        className="absolute flex items-center justify-center rounded-full"
        style={{
          left: 0,
          top: 0,
          x: coreX,
          y: coreY,
          translateX: '-50%',
          translateY: '-50%',
          width: 14,
          height: 14,
          background: 'linear-gradient(135deg, #d8b4fe 0%, #818cf8 55%, #38bdf8 100%)',
          boxShadow: '0 0 10px 2px rgba(129,140,248,0.7), 0 0 22px 8px rgba(168,85,247,0.35)',
        }}
      >
        <motion.span
          className="absolute inset-0 rounded-full border border-white/60"
          animate={{ scale: [1, 1.7, 1], opacity: [0.55, 0, 0.55] }}
          transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        />
        <span className="h-1 w-1 rounded-full bg-white/95" />
      </motion.div>
    </div>
  )
}
