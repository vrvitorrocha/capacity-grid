import { useEffect, useState, type FormEvent } from 'react'
import { fetchCapacity, MAX_WEEKS, type CapacityResponse } from './api'
import { addDays, formatDate, mondayOf, parseISODate, sundayOf, todayISO, weekSpan } from './dates'

type Props = {
  from: string
  to: string
  onRangeChange: (from: string, to: string) => void
}

// Hours are summed from fractional rows; compare with a tolerance so 40.0000001
// never reads as over-allocated.
const EPSILON = 1e-6

const hoursFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const hours = (h: number) => hoursFormat.format(h)

// CapacityGrid renders one row per person and one column per week, showing
// how allocated each person is and making over-allocation obvious.
//
// The range props are what was asked for; everything drawn (weeks, range
// label) comes from the response, because the server widens the range to
// whole weeks.
export function CapacityGrid({ from, to, onRangeChange }: Props) {
  // data is the last successful response. It stays on screen while the next
  // range loads, so navigating doesn't blank the grid.
  const [data, setData] = useState<CapacityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // Each range change aborts the previous request, and a response for an
    // aborted request is dropped even if it still arrives — so a slow, older
    // range can never overwrite a newer one.
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchCapacity(from, to, controller.signal).then(
      (next) => {
        if (controller.signal.aborted) return
        setData(next)
        setLoading(false)
      },
      (err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      },
    )
    return () => controller.abort()
  }, [from, to, attempt])

  // Navigation works from the requested range (snapped the same way the
  // server does), so it responds immediately even while a load is pending.
  const span = weekSpan(from, to)
  const shift = (weeks: number) =>
    onRangeChange(addDays(mondayOf(from), 7 * weeks), addDays(sundayOf(to), 7 * weeks))
  const thisWeek = () => {
    const monday = mondayOf(todayISO())
    onRangeChange(monday, addDays(monday, 7 * span - 1))
  }
  const retry = () => setAttempt((n) => n + 1)

  return (
    <section className="capacity" aria-busy={loading}>
      <div className="toolbar">
        <div className="nav" role="group" aria-label="Move range by one week">
          <button type="button" onClick={() => shift(-1)}>
            ‹ Prev week
          </button>
          <button type="button" onClick={thisWeek}>
            This week
          </button>
          <button type="button" onClick={() => shift(1)}>
            Next week ›
          </button>
        </div>
        {/* Keyed on the range so the draft resets whenever navigation moves it. */}
        <RangeForm key={`${from}|${to}`} from={from} to={to} onApply={onRangeChange} />
        <p className="status" role="status">
          {loading ? 'Loading…' : ''}
        </p>
      </div>

      {error && (
        <div className="error" role="alert">
          <span>
            Couldn’t load {formatRange(from, to)}: {error}
            {data && <> — showing {formatRange(data.from, data.to)} instead.</>}
          </span>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {data ? <Table data={data} stale={loading || error !== null} /> : loading && <p className="placeholder">Loading capacity…</p>}
    </section>
  )
}

function RangeForm({ from, to, onApply }: { from: string; to: string; onApply: (from: string, to: string) => void }) {
  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState(to)

  const problem = rangeProblem(draftFrom, draftTo)
  const unchanged = draftFrom === from && draftTo === to

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!problem) onApply(draftFrom, draftTo)
  }

  return (
    <form className="range-form" onSubmit={submit}>
      <label>
        From <input type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} required />
      </label>
      <label>
        To <input type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} required />
      </label>
      <button type="submit" disabled={problem !== null || unchanged}>
        Apply
      </button>
      {problem && <span className="hint">{problem}</span>}
    </form>
  )
}

function rangeProblem(from: string, to: string): string | null {
  if (!parseISODate(from) || !parseISODate(to)) return 'Pick both dates.'
  if (to < from) return 'End date is before start date.'
  const weeks = weekSpan(from, to)
  if (weeks > MAX_WEEKS) return `That’s ${weeks} weeks; the maximum is ${MAX_WEEKS}.`
  return null
}

function Table({ data, stale }: { data: CapacityResponse; stale: boolean }) {
  const overCount = data.people.filter((p) => p.allocated.some((a) => a - p.weeklyHours > EPSILON)).length

  return (
    <>
      <p className="summary">
        <strong>{formatRange(data.from, data.to)}</strong> · {data.weeks.length} {data.weeks.length === 1 ? 'week' : 'weeks'} ·{' '}
        {data.people.length} people · <span className="summary-over">{overCount} over capacity</span> in at least one week
      </p>
      <Legend />
      {data.people.length === 0 ? (
        <p className="placeholder">No people to show.</p>
      ) : (
        <div className={stale ? 'table-wrap stale' : 'table-wrap'}>
          <table>
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col" className="num">
                  Capacity
                </th>
                {data.weeks.map((week) => (
                  <th key={week} scope="col" className="num" title={`Week of ${week}`}>
                    {formatDate(week, { day: 'numeric', month: 'short' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.people.map((person) => (
                <tr key={person.id}>
                  <th scope="row">{person.name}</th>
                  <td className="num capacity-col">{hours(person.weeklyHours)}h</td>
                  {person.allocated.map((allocated, i) => (
                    <Cell key={data.weeks[i]} allocated={allocated} capacity={person.weeklyHours} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

type CellStatus = 'idle' | 'under' | 'full' | 'over'

function cellStatus(allocated: number, capacity: number): CellStatus {
  if (allocated - capacity > EPSILON) return 'over'
  if (allocated <= EPSILON) return 'idle'
  if (capacity - allocated <= EPSILON) return 'full'
  return 'under'
}

function Cell({ allocated, capacity }: { allocated: number; capacity: number }) {
  const status = cellStatus(allocated, capacity)
  const fill = capacity > 0 ? Math.min(allocated / capacity, 1) : allocated > 0 ? 1 : 0
  const label =
    capacity > 0
      ? `${hours(allocated)}h of ${hours(capacity)}h (${Math.round((allocated / capacity) * 100)}%)`
      : allocated > 0
        ? `${hours(allocated)}h allocated, no capacity`
        : 'No capacity, nothing allocated'

  return (
    <td className={`num cell ${status}`} title={label} aria-label={label}>
      <span className="cell-hours">{status === 'idle' ? '–' : hours(allocated)}</span>
      {status === 'over' && <span className="over-badge">▲ +{hours(allocated - capacity)}</span>}
      <span className="bar" aria-hidden="true">
        <span style={{ width: `${fill * 100}%` }} />
      </span>
    </td>
  )
}

function Legend() {
  return (
    <ul className="legend" aria-label="Legend">
      <li>
        <span className="swatch over" /> Over capacity <span className="over-badge">▲ +h over</span>
      </li>
      <li>
        <span className="swatch full" /> At capacity
      </li>
      <li>
        <span className="swatch under" /> Under capacity
      </li>
      <li>
        <span className="swatch idle" /> Nothing allocated (–)
      </li>
    </ul>
  )
}

function formatRange(from: string, to: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
  return `${formatDate(from, opts)} – ${formatDate(to, opts)}`
}
