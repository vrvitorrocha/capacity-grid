package main

import (
	"errors"
	"fmt"
	"net/http"
	"time"
)

const (
	dateLayout = "2006-01-02"
	// maxWeeks bounds one request. At a few thousand people this keeps a
	// response well under a few MB; the grid pages through longer spans.
	maxWeeks = 26
)

type capacityResponse struct {
	From   string           `json:"from"`
	To     string           `json:"to"`
	Weeks  []string         `json:"weeks"`
	People []personCapacity `json:"people"`
}

// personCapacity carries capacity once per person (that is how it is stored)
// and allocated hours aligned index-for-index with capacityResponse.Weeks.
type personCapacity struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	WeeklyHours float64   `json:"weeklyHours"`
	Allocated   []float64 `json:"allocated"`
}

// weekRange is a request range snapped to whole weeks: from is a Monday and
// to is the Sunday ending the last week. Both are UTC midnight dates.
type weekRange struct {
	from, to time.Time
	weeks    int
}

// parseWeekRange validates from/to (YYYY-MM-DD, inclusive) and widens them to
// whole Monday–Sunday weeks.
func parseWeekRange(fromStr, toStr string) (weekRange, error) {
	if fromStr == "" || toStr == "" {
		return weekRange{}, errors.New("from and to are required (YYYY-MM-DD)")
	}
	from, err := time.Parse(dateLayout, fromStr)
	if err != nil {
		return weekRange{}, fmt.Errorf("from: invalid date %q, want YYYY-MM-DD", fromStr)
	}
	to, err := time.Parse(dateLayout, toStr)
	if err != nil {
		return weekRange{}, fmt.Errorf("to: invalid date %q, want YYYY-MM-DD", toStr)
	}
	if to.Before(from) {
		return weekRange{}, errors.New("to must not be before from")
	}

	// time.Parse yields UTC dates, so AddDate is pure calendar arithmetic.
	from = from.AddDate(0, 0, -daysSinceMonday(from))
	to = to.AddDate(0, 0, 6-daysSinceMonday(to))
	weeks := int(to.Sub(from).Hours()/24+1) / 7
	if weeks > maxWeeks {
		return weekRange{}, fmt.Errorf("range spans %d weeks, max is %d", weeks, maxWeeks)
	}
	return weekRange{from: from, to: to, weeks: weeks}, nil
}

func daysSinceMonday(t time.Time) int {
	return (int(t.Weekday()) + 6) % 7
}

// capacityQuery returns one row per person with allocated hours per week from
// $1 (a Monday) through $2 (a Sunday). Assignment dates are inclusive and only
// Monday–Friday days count. Every assignment row is summed: the seed stores
// each logical assignment as several rows whose hours_per_day add up to the
// real figure, so de-duplicating would under-count.
//
// Date math stays in the date type (date + int, isodow) on purpose:
// generate_series over dates with an interval goes through timestamptz and
// would depend on the session time zone.
const capacityQuery = `
WITH weeks AS (
  SELECT $1::date + 7 * i AS week_start
  FROM generate_series(0, ($2::date - $1::date) / 7) AS i
),
days AS (
  SELECT a.person_id, a.hours_per_day, greatest(a.start_date, $1::date) + i AS day
  FROM assignments a
  CROSS JOIN LATERAL generate_series(0, least(a.end_date, $2::date) - greatest(a.start_date, $1::date)) AS i
  WHERE a.start_date <= $2::date
    AND a.end_date >= $1::date
),
alloc AS (
  SELECT person_id,
         day - (extract(isodow FROM day)::int - 1) AS week_start,
         sum(hours_per_day) AS hours
  FROM days
  WHERE extract(isodow FROM day) <= 5
  GROUP BY 1, 2
)
SELECT p.id,
       p.name,
       p.weekly_hours::float8,
       array_agg(coalesce(alloc.hours, 0)::float8 ORDER BY weeks.week_start)
FROM people p
CROSS JOIN weeks
LEFT JOIN alloc ON alloc.person_id = p.id AND alloc.week_start = weeks.week_start
GROUP BY p.id
ORDER BY p.name, p.id
`

// handleCapacity serves GET /api/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// The range is widened to whole Monday–Sunday weeks and echoed back, so the
// client always knows exactly which weeks it got.
func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	rng, err := parseWeekRange(q.Get("from"), q.Get("to"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	rows, err := s.db.Query(r.Context(), capacityQuery, rng.from, rng.to)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "query capacity: " + err.Error()})
		return
	}
	defer rows.Close()

	people := []personCapacity{}
	for rows.Next() {
		var p personCapacity
		if err := rows.Scan(&p.ID, &p.Name, &p.WeeklyHours, &p.Allocated); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "scan capacity: " + err.Error()})
			return
		}
		people = append(people, p)
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "read capacity: " + err.Error()})
		return
	}

	weeks := make([]string, rng.weeks)
	for i := range weeks {
		weeks[i] = rng.from.AddDate(0, 0, 7*i).Format(dateLayout)
	}

	writeJSON(w, http.StatusOK, capacityResponse{
		From:   rng.from.Format(dateLayout),
		To:     rng.to.Format(dateLayout),
		Weeks:  weeks,
		People: people,
	})
}
