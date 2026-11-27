import * as React from 'react'

export function useRetained<T extends { key: string }>(
  items: Array<T>,
  retain?: (item: T) => boolean,
) {
  const [retained, setRetained] = React.useState(items)
  const nativeDismissed = React.useRef(new Set<string>())
  const current = new Map(items.map((item) => [item.key, item]))
  const keys = new Set(retained.map((item) => item.key))
  const rendered = [
    ...retained.map((item) => current.get(item.key) ?? item),
    ...items.filter((item) => !keys.has(item.key)),
  ].filter(
    (item) =>
      current.has(item.key) ||
      (!nativeDismissed.current.has(item.key) && retain?.(item) !== false),
  )
  React.useLayoutEffect(() => {
    setRetained((previous) => {
      const current = new Map(items.map((item) => [item.key, item]))
      const keys = new Set(previous.map((item) => item.key))
      return [
        ...previous.map((item) => current.get(item.key) ?? item),
        ...items.filter((item) => !keys.has(item.key)),
      ].filter((item) => current.has(item.key) || retain?.(item) !== false)
    })
  }, [items, retain])
  const forget = (key: string) => {
    nativeDismissed.current.delete(key)
    setRetained((previous) => previous.filter((item) => item.key !== key))
  }
  return {
    rendered,
    current,
    forget,
    acknowledge: (key: string) => nativeDismissed.current.add(key),
  }
}
