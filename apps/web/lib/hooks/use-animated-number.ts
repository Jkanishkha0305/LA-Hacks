import { useEffect, useRef, useState } from 'react'

export function useAnimatedNumber(target: number, duration = 300): number {
  const [current, setCurrent] = useState(target)
  const prevRef = useRef(target)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const from = prevRef.current
    const delta = target - from
    if (delta === 0) return

    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      setCurrent(from + delta * t)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        prevRef.current = target
      }
    }
    rafRef.current = requestAnimationFrame(step)

    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return current
}
