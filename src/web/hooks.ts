import { useEffect, useState } from 'react'

/** 把频繁变化的值延迟一段时间再用于请求，避免每敲一个字都发请求 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
