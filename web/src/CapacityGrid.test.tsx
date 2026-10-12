import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CapacityResponse } from './api'
import { CapacityGrid } from './CapacityGrid'

function response(from: string, to: string, name: string, allocated: number[], weeklyHours = 40): CapacityResponse {
  const weeks = allocated.map((_, i) => {
    const d = new Date(`${from}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 7 * i)
    return d.toISOString().slice(0, 10)
  })
  return { from, to, weeks, people: [{ id: 1, name, weeklyHours, allocated }] }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// fetch that hands back a promise per call, resolved by the test. It ignores
// the abort signal on purpose, like a response already in flight would.
function controllableFetch() {
  const pending: { url: string; resolve: (r: Response) => void }[] = []
  const fetchMock = vi.fn((url: string) => new Promise<Response>((resolve) => pending.push({ url, resolve })))
  vi.stubGlobal('fetch', fetchMock)
  return pending
}

describe('CapacityGrid', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(cleanup)

  it('keeps the newest range when an older response arrives last', async () => {
    const pending = controllableFetch()
    const { rerender } = render(<CapacityGrid from="2026-01-05" to="2026-01-11" onRangeChange={() => {}} />)
    rerender(<CapacityGrid from="2026-01-12" to="2026-01-18" onRangeChange={() => {}} />)
    expect(pending.map((p) => p.url)).toEqual([
      '/api/capacity?from=2026-01-05&to=2026-01-11',
      '/api/capacity?from=2026-01-12&to=2026-01-18',
    ])

    await act(async () => pending[1].resolve(jsonResponse(response('2026-01-12', '2026-01-18', 'Newer', [8]))))
    await act(async () => pending[0].resolve(jsonResponse(response('2026-01-05', '2026-01-11', 'Older', [8]))))

    expect(screen.getByText('Newer')).toBeInTheDocument()
    expect(screen.queryByText('Older')).not.toBeInTheDocument()
  })

  it('shows the server error and recovers on retry', async () => {
    const pending = controllableFetch()
    render(<CapacityGrid from="2026-01-05" to="2026-01-11" onRangeChange={() => {}} />)

    await act(async () => pending[0].resolve(jsonResponse({ error: 'range spans 27 weeks, max is 26' }, 400)))
    expect(screen.getByRole('alert')).toHaveTextContent('range spans 27 weeks, max is 26')

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => pending[1].resolve(jsonResponse(response('2026-01-05', '2026-01-11', 'Ana', [30]))))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })

  it('marks over-allocation with text, including zero capacity', async () => {
    const pending = controllableFetch()
    render(<CapacityGrid from="2026-01-05" to="2026-01-11" onRangeChange={() => {}} />)
    const body = response('2026-01-05', '2026-01-18', 'Dee', [45, 40])
    body.people.push({ id: 5, name: 'Eli', weeklyHours: 0, allocated: [20, 0] })
    await act(async () => pending[0].resolve(jsonResponse(body)))

    expect(screen.getByLabelText('45h of 40h (113%)')).toHaveTextContent('▲ +5')
    expect(screen.getByLabelText('40h of 40h (100%)')).not.toHaveTextContent('▲')
    expect(screen.getByLabelText('20h allocated, no capacity')).toHaveTextContent('▲ +20')
  })

  it('navigates by whole weeks, keeping the span', async () => {
    controllableFetch()
    const onRangeChange = vi.fn()
    render(<CapacityGrid from="2025-12-31" to="2026-01-16" onRangeChange={onRangeChange} />)

    fireEvent.click(screen.getByRole('button', { name: /Next week/ }))
    expect(onRangeChange).toHaveBeenLastCalledWith('2026-01-05', '2026-01-25')
    fireEvent.click(screen.getByRole('button', { name: /Prev week/ }))
    expect(onRangeChange).toHaveBeenLastCalledWith('2025-12-22', '2026-01-11')
  })
})
