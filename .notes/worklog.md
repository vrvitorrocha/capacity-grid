# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---

## 2026-10-12 — GET /api/capacity

- **Seed rows are fragments, not duplicates.** The original seed (`git show 6a29fd2:db/seed.sql`) had one row per assignment, with hours_per_day in {2,4,6,8}. The current pg_dump splits each of the 8,413 assignments into 15 rows: orig/16 ×14 plus 2×orig/16 once, adding back to the original. I checked by rebuilding the old seed in a throwaway container; all 8,413 map exactly. → Sum every row, never DISTINCT. De-duplicating under-reports by ~81%.
- `hours_per_day` = literal hours (original values were 2/4/6/8). Assignment dates are inclusive (rows with start = end exist).
- Only Mon–Fri count. The generator picked end dates without regard to weekends, so weekend days are noise (counting them turns Ana's 40/40 week into 56/40). No holiday data; Jan 1 counts as a working day.
- Weeks start Monday. The range is widened to whole Mon–Sun weeks and echoed back in `from`/`to`, so capacity is never prorated for partial weeks.
- SQL date math stays in `date` (date + int, isodow). `generate_series(date, date, interval)` goes via timestamptz and would depend on the session TZ.
- Response is columnar: `weeks[]` plus per person `{id, name, weeklyHours, allocated[]}` aligned to weeks. Capacity is sent once per person because it's stored once. People are ordered by name, then id; everyone appears, and missing weeks are 0.
- Max 26 weeks per request (`maxWeeks`). 500 people × 26 weeks ≈ 63 KB, ~250 ms.
- Verified: every person × week cell for the whole dataset (83 weeks, 4 requests) matches an independent Python calculation on the original seed; total 302,813 h. Known cells: Ana 40/0/30, Bo 0/32/8, Cem 0/4/12, Dee 0/45/40, Eli 0/20/0 with 0 capacity (weeks 2025-12-29, 01-05, 01-12).
- Deferred:
  - Postgres JIT kicks in on this query and doubles it (335 → 167 ms with jit=off). Could `SET jit=off` per connection.
  - Seq scan on assignments: the `(start_date, end_date)` btree can't serve a two-sided overlap test. A GiST index on `daterange(start_date, end_date, '[]')` would, but the schema is fixed.
  - No pagination of people yet; thousands of rows is fine as JSON but will need virtualization in the grid.
- Unit test covers range parsing only (snapping, new-year week, DST, max/reversed/invalid). No DB test harness exists; the SQL was checked against the running app as above. Run with: `docker run --rm -v "$PWD/api":/src -w /src capacity-grid-assignment-api go test ./...`
