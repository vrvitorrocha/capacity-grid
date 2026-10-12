package main

import (
	"strings"
	"testing"
)

func TestParseUpdatePerson(t *testing.T) {
	tests := []struct {
		name, id, body string
		wantID         int
		wantHours      float64
		wantErr        bool
	}{
		{name: "valid", id: "4", body: `{"weeklyHours": 32}`, wantID: 4, wantHours: 32},
		{name: "fractional", id: "4", body: `{"weeklyHours": 37.5}`, wantID: 4, wantHours: 37.5},
		{name: "zero allowed", id: "4", body: `{"weeklyHours": 0}`, wantID: 4, wantHours: 0},
		{name: "upper bound", id: "4", body: `{"weeklyHours": 168}`, wantID: 4, wantHours: 168},
		{name: "over a week", id: "4", body: `{"weeklyHours": 168.5}`, wantErr: true},
		{name: "negative", id: "4", body: `{"weeklyHours": -1}`, wantErr: true},
		{name: "missing field", id: "4", body: `{}`, wantErr: true},
		{name: "null", id: "4", body: `{"weeklyHours": null}`, wantErr: true},
		{name: "string value", id: "4", body: `{"weeklyHours": "32"}`, wantErr: true},
		{name: "unknown field", id: "4", body: `{"weeklyHours": 32, "name": "x"}`, wantErr: true},
		{name: "not JSON", id: "4", body: `32`, wantErr: true},
		{name: "empty body", id: "4", body: ``, wantErr: true},
		{name: "non-numeric id", id: "abc", body: `{"weeklyHours": 32}`, wantErr: true},
		{name: "zero id", id: "0", body: `{"weeklyHours": 32}`, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id, hours, err := parseUpdatePerson(tt.id, strings.NewReader(tt.body))
			if tt.wantErr {
				if err == nil {
					t.Fatalf("want error, got id=%d hours=%v", id, hours)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if id != tt.wantID || hours != tt.wantHours {
				t.Errorf("got id=%d hours=%v, want id=%d hours=%v", id, hours, tt.wantID, tt.wantHours)
			}
		})
	}
}
