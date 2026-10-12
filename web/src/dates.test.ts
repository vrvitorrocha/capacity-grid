import { describe, expect, it } from 'vitest'
import { addDays, mondayOf, parseISODate, sundayOf, todayISO, weekSpan } from './dates'

describe('dates', () => {
  it('snaps to Monday–Sunday across the new year', () => {
    expect(mondayOf('2026-01-01')).toBe('2025-12-29')
    expect(sundayOf('2025-12-31')).toBe('2026-01-04')
    expect(mondayOf('2026-01-05')).toBe('2026-01-05')
    expect(sundayOf('2026-01-11')).toBe('2026-01-11')
  })

  it('adds whole days across DST changes and month ends', () => {
    expect(addDays('2026-03-23', 7)).toBe('2026-03-30')
    expect(addDays('2026-10-19', 14)).toBe('2026-11-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('counts whole weeks like the server', () => {
    expect(weekSpan('2025-12-29', '2026-01-16')).toBe(3)
    expect(weekSpan('2026-01-11', '2026-01-11')).toBe(1)
    expect(weekSpan('2026-01-05', '2026-07-05')).toBe(26)
  })

  it('rejects malformed and impossible dates', () => {
    expect(parseISODate('2026-02-30')).toBeNull()
    expect(parseISODate('05/01/2026')).toBeNull()
    expect(parseISODate('')).toBeNull()
    expect(parseISODate('2026-02-28')).not.toBeNull()
  })

  it('takes today from the local calendar date', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})
