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

## 2026-10-12 — Capacity grid (read-only)

- **Range state** lives in `App` and mirrors to `?from=&to=` with `replaceState`, so a view can be linked and survives a reload. Back/forward browser history isn't wired (pushState + popstate would do it). Malformed URL dates fall back to the default; anything else, like a 27-week span, goes to the server and shows its error.
- **Requested vs served range:** the URL and date inputs keep what the user asked for, e.g. Mar 4–20. Everything drawn (summary, week columns) comes from the response (Mar 2–22), because the server snaps to whole weeks. Prev/Next/This week snap client-side the same way and keep the week span, so they don't wait on a pending load.
- **Out-of-order responses:** each range change aborts the previous fetch, and a resolved-but-aborted response is dropped. Mutation check: removing the guard makes the race test fail.
- **Loading** keeps the previous table, dimmed (`aria-busy`, "Loading…" status), rather than blanking the grid.
- **Errors:** the server's `{error}` message is shown with Retry. If an older table is still visible, the banner says which range it actually is.
- **Over-allocation without relying on color:** a "▲ +Nh" badge, bold text and tinted cell, a fill bar, and an aria-label/tooltip such as "45h of 40h (113%)". Zero capacity reads "20h allocated, no capacity" and still gets "▲ +20".
- Compare with a 1e-6 tolerance (allocations are sums of fractional rows). Display rounds to 1 decimal. Summary line counts people over in at least one week.
- **Client-side range check** (order, ≤26 weeks) duplicates `maxWeeks` from Go as `MAX_WEEKS`. Keep them in sync, or later have the API expose it.
- **Dates:** all date arithmetic is on UTC (`dates.ts`). Only "today" uses the viewer's local calendar date.
- **Verified in headless Chrome** (screenshots plus clicks driven over the DevTools protocol):
  - The default range matches the API numbers.
  - Next/Prev/This week, Apply with a mid-week range, the reversed-range hint, the 27-week server error banner, a 26-week view, and dark mode all work.
  - Name order is en_US collation, with non-Latin names last.
- **Not done:**
  - Rows aren't virtualized; 500 × 26 renders fine, but thousands of people will need windowing.
  - No filter or sort (e.g. "only over-allocated").
  - The loading state isn't visible in screenshots (local responses are too fast); it's covered by the component tests instead.

## 2026-10-12 — Editing weekly hours

- **PATCH contract:** the stub defined no format, so I reused the GET field name. `PATCH /api/people/{id}` with `{"weeklyHours": n}` returns the saved `{id, name, weeklyHours}` (`UPDATE … RETURNING`). 400 for a bad id, bad JSON, unknown fields, or a value outside 0–168 (decimals allowed). 404 for an unknown person. Last write wins: there's no version column for a conditional update.
- **Not optimistic.** The capacity column and every ▲ flag keep showing the server's value until the PATCH succeeds; meanwhile the editor shows "Saving…". A capacity change can flip flags across up to 26 weeks, and flashing them in and then reverting on failure seemed worse than a short wait.
- **No refetch after save.** Allocation doesn't depend on capacity, so replacing that person's `weeklyHours` with the server's returned value recomputes the whole row (and the "N over capacity" summary). Capacity isn't effective-dated, so the new value applies to every week, past ones included. That's a limit of the data model (see the first entry), not of the UI.
- **Race:** a range fetch that started before a save finished can return the old capacity. Confirmed saves are stamped from a counter shared with fetch starts and re-applied to older responses. Mutation check: removing it fails the test.
- **Failed save:** the editor stays open with the draft and "Not saved — still 40h: <server message>", and Save retries. A second save for the same person is blocked while one is pending.
- **Verified:**
  - curl: all the 400/404 cases, a 37.5h save reflected in GET, then Dee restored to 40.
  - Headless Chrome: save 40→45 cleared Dee's ▲ +5 in both weeks. Stopping the api container mid-session gave "Not saved — still 45h: Request failed (HTTP 502)" with the grid unchanged. Restarting and retrying succeeded.
  - Dee is back at 40 in the database.
- **Not done:**
  - A 502 from the Vite proxy shows a generic "Request failed (HTTP 502)"; it could say "server unreachable".
  - The capacity column widens while an error message is open.
  - There's no "Saved" confirmation beyond the value changing.
  - No keyboard flow between rows.
