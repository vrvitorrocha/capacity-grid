package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

// maxWeeklyHours is every hour in a week; anything above is a typo, not a
// schedule.
const maxWeeklyHours = 168

type person struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	WeeklyHours float64 `json:"weeklyHours"`
}

type updatePersonRequest struct {
	WeeklyHours *float64 `json:"weeklyHours"`
}

// parseUpdatePerson validates the path id and request body.
func parseUpdatePerson(idStr string, body io.Reader) (id int, weeklyHours float64, err error) {
	id, err = strconv.Atoi(idStr)
	if err != nil || id < 1 {
		return 0, 0, fmt.Errorf("invalid person id %q", idStr)
	}

	var req updatePersonRequest
	dec := json.NewDecoder(body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		return 0, 0, fmt.Errorf("invalid JSON body: %v", err)
	}
	if req.WeeklyHours == nil {
		return 0, 0, errors.New("weeklyHours is required")
	}
	// JSON has no NaN or Infinity, so the range check is enough.
	if h := *req.WeeklyHours; h < 0 || h > maxWeeklyHours {
		return 0, 0, fmt.Errorf("weeklyHours must be between 0 and %d", maxWeeklyHours)
	}
	return id, *req.WeeklyHours, nil
}

// handleUpdatePerson serves PATCH /api/people/{id} with {"weeklyHours": n}.
//
// It returns the person as saved, so the grid can show exactly what the
// database holds rather than what it sent.
func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	id, weeklyHours, err := parseUpdatePerson(r.PathValue("id"), http.MaxBytesReader(w, r.Body, 1<<10))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	var p person
	err = s.db.QueryRow(r.Context(), `
		UPDATE people SET weekly_hours = $2
		WHERE id = $1
		RETURNING id, name, weekly_hours::float8`,
		id, weeklyHours,
	).Scan(&p.ID, &p.Name, &p.WeeklyHours)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": fmt.Sprintf("person %d not found", id)})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update person: " + err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, p)
}
