package main

import "testing"

func TestParseWeekRange(t *testing.T) {
	tests := []struct {
		name, from, to   string
		wantFrom, wantTo string
		wantWeeks        int
		wantErr          bool
	}{
		{name: "snaps to whole weeks across new year", from: "2025-12-31", to: "2026-01-16", wantFrom: "2025-12-29", wantTo: "2026-01-18", wantWeeks: 3},
		{name: "monday to sunday unchanged", from: "2026-01-05", to: "2026-01-11", wantFrom: "2026-01-05", wantTo: "2026-01-11", wantWeeks: 1},
		{name: "single sunday is its own week", from: "2026-01-11", to: "2026-01-11", wantFrom: "2026-01-05", wantTo: "2026-01-11", wantWeeks: 1},
		{name: "across DST change", from: "2026-03-23", to: "2026-04-05", wantFrom: "2026-03-23", wantTo: "2026-04-05", wantWeeks: 2},
		{name: "max range allowed", from: "2026-01-05", to: "2026-07-05", wantFrom: "2026-01-05", wantTo: "2026-07-05", wantWeeks: 26},
		{name: "over max range", from: "2026-01-05", to: "2026-07-06", wantErr: true},
		{name: "reversed", from: "2026-01-12", to: "2026-01-05", wantErr: true},
		{name: "missing to", from: "2026-01-05", wantErr: true},
		{name: "not a date", from: "2026-02-30", to: "2026-03-01", wantErr: true},
		{name: "wrong format", from: "05/01/2026", to: "2026-03-01", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseWeekRange(tt.from, tt.to)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("want error, got %+v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if f := got.from.Format(dateLayout); f != tt.wantFrom {
				t.Errorf("from = %s, want %s", f, tt.wantFrom)
			}
			if to := got.to.Format(dateLayout); to != tt.wantTo {
				t.Errorf("to = %s, want %s", to, tt.wantTo)
			}
			if got.weeks != tt.wantWeeks {
				t.Errorf("weeks = %d, want %d", got.weeks, tt.wantWeeks)
			}
		})
	}
}
