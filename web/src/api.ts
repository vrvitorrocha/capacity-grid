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

export async function fetchCapacity(from: string, to: string, signal?: AbortSignal): Promise<CapacityResponse> {
  const res = await fetch(`/api/capacity?${new URLSearchParams({ from, to })}`, { signal })
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as CapacityResponse
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
