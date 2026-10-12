// Shapes returned by the Go API (api/capacity.go).

export type PersonCapacity = {
  id: number
  name: string
  weeklyHours: number
  // Allocated hours, index-aligned with CapacityResponse.weeks.
  allocated: number[]
}

export type CapacityResponse = {
  // The range actually served, widened to whole Monday–Sunday weeks.
  from: string
  to: string
  // Monday of each week, in order.
  weeks: string[]
  people: PersonCapacity[]
}

// Mirrors maxWeeks in api/capacity.go.
export const MAX_WEEKS = 26

// Mirrors maxWeeklyHours in api/people.go.
export const MAX_WEEKLY_HOURS = 168

export type Person = {
  id: number
  name: string
  weeklyHours: number
}

export async function fetchCapacity(from: string, to: string, signal?: AbortSignal): Promise<CapacityResponse> {
  const res = await fetch(`/api/capacity?${new URLSearchParams({ from, to })}`, { signal })
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as CapacityResponse
}

// Resolves with the person as saved; rejects with the server's message.
export async function updateWeeklyHours(id: number, weeklyHours: number): Promise<Person> {
  const res = await fetch(`/api/people/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weeklyHours }),
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as Person
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json()
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      return body.error
    }
  } catch {
    // Not JSON (e.g. a proxy error page); fall through to the status.
  }
  return `Request failed (HTTP ${res.status})`
}
