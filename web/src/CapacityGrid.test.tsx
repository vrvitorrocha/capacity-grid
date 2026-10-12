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
  const pending: { url: string; init?: RequestInit; resolve: (r: Response) => void }[] = []
  const fetchMock = vi.fn(
    (url: string, init?: RequestInit) => new Promise<Response>((resolve) => pending.push({ url, init, resolve })),
  )
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

  describe('editing weekly hours', () => {
    // Dee: 40h capacity, 45h then 40h allocated. Eli: 0h capacity, 20h allocated.
    async function renderLoaded() {
      const pending = controllableFetch()
      const view = render(<CapacityGrid from="2026-01-05" to="2026-01-18" onRangeChange={() => {}} />)
      await act(async () => pending[0].resolve(jsonResponse(deeAndEli(40))))
      return { pending, ...view }
    }

    function deeAndEli(deeHours: number): CapacityResponse {
      return {
        from: '2026-01-05',
        to: '2026-01-18',
        weeks: ['2026-01-05', '2026-01-12'],
        people: [
          { id: 4, name: 'Dee', weeklyHours: deeHours, allocated: [45, 40] },
          { id: 5, name: 'Eli', weeklyHours: 0, allocated: [20, 0] },
        ],
      }
    }

    function editDee(value: string) {
      fireEvent.click(screen.getByRole('button', { name: 'Edit weekly hours for Dee, currently 40h' }))
      fireEvent.change(screen.getByLabelText('Weekly hours for Dee'), { target: { value } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    }

    it('saves, then shows the server value and recomputes the row', async () => {
      const { pending } = await renderLoaded()
      editDee('45')

      expect(pending[1].url).toBe('/api/people/4')
      expect(pending[1].init?.method).toBe('PATCH')
      expect(pending[1].init?.body).toBe('{"weeklyHours":45}')
      // Pending: nothing claims the new capacity yet.
      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
      expect(screen.getByLabelText('45h of 40h (113%)')).toHaveTextContent('▲ +5')

      await act(async () => pending[1].resolve(jsonResponse({ id: 4, name: 'Dee', weeklyHours: 45 })))

      expect(screen.getByRole('button', { name: 'Edit weekly hours for Dee, currently 45h' })).toBeInTheDocument()
      expect(screen.getByLabelText('45h of 45h (100%)')).not.toHaveTextContent('▲')
      expect(screen.getByLabelText('40h of 45h (89%)')).toBeInTheDocument()
      // Other people are untouched.
      expect(screen.getByLabelText('20h allocated, no capacity')).toHaveTextContent('▲ +20')
    })

    it('keeps the saved capacity on failure and lets the user retry', async () => {
      const { pending } = await renderLoaded()
      editDee('45')
      await act(async () => pending[1].resolve(jsonResponse({ error: 'database unavailable' }, 500)))

      expect(screen.getByRole('alert')).toHaveTextContent('Not saved — still 40h: database unavailable')
      expect(screen.getByLabelText('Weekly hours for Dee')).toHaveValue(45)
      expect(screen.getByLabelText('45h of 40h (113%)')).toHaveTextContent('▲ +5')
      expect(screen.queryByRole('button', { name: /currently 45h/ })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await act(async () => pending[2].resolve(jsonResponse({ id: 4, name: 'Dee', weeklyHours: 45 })))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByLabelText('45h of 45h (100%)')).toBeInTheDocument()
    })

    it('does not let a range fetch that started before the save undo it', async () => {
      const { pending, rerender } = await renderLoaded()
      rerender(<CapacityGrid from="2026-01-12" to="2026-01-18" onRangeChange={() => {}} />)
      editDee('45')
      expect(pending.map((p) => p.init?.method ?? 'GET')).toEqual(['GET', 'GET', 'PATCH'])

      await act(async () => pending[2].resolve(jsonResponse({ id: 4, name: 'Dee', weeklyHours: 45 })))
      // The fetch was answered before the save committed, so it still says 40.
      await act(async () => pending[1].resolve(jsonResponse(deeAndEli(40))))

      expect(screen.getByRole('button', { name: 'Edit weekly hours for Dee, currently 45h' })).toBeInTheDocument()
      expect(screen.getByLabelText('45h of 45h (100%)')).not.toHaveTextContent('▲')
    })

    it('blocks saving out-of-range values', async () => {
      await renderLoaded()
      fireEvent.click(screen.getByRole('button', { name: 'Edit weekly hours for Dee, currently 40h' }))
      fireEvent.change(screen.getByLabelText('Weekly hours for Dee'), { target: { value: '200' } })
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
      expect(screen.getByText('0–168 hours')).toBeInTheDocument()
    })
  })
})
