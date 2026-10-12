import { useEffect, useState } from 'react'
import { CapacityGrid } from './CapacityGrid'
import { parseISODate } from './dates'

// The range shown when the URL doesn't name one.
const DEFAULT_FROM = '2025-12-29'
const DEFAULT_TO = '2026-01-16'

type Range = { from: string; to: string }

// The URL (?from=&to=) holds the range so a view can be linked and survives a
// reload. Anything malformed falls back to the default; the server validates
// the rest (span, order) and the grid shows its error.
function rangeFromURL(): Range {
  const params = new URLSearchParams(window.location.search)
  const from = params.get('from')
  const to = params.get('to')
  if (from && to && parseISODate(from) && parseISODate(to)) return { from, to }
  return { from: DEFAULT_FROM, to: DEFAULT_TO }
}

export function App() {
  const [range, setRange] = useState(rangeFromURL)

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('from', range.from)
    url.searchParams.set('to', range.to)
    window.history.replaceState(null, '', url)
  }, [range])

  return (
    <main>
      <h1>Team capacity</h1>
      <CapacityGrid from={range.from} to={range.to} onRangeChange={(from, to) => setRange({ from, to })} />
    </main>
  )
}
