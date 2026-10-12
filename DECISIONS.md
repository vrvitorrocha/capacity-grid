# Decisions

Yours to write, not your AI's. Short is good — bullets are fine, and half a page is
plenty. We read this first.

## What did the spec not tell you?

There are things this brief doesn't specify. Which ones did you hit, what did you decide,
and why?

- What exactly are the working days for each person? To calculate weekly total hours based on an `hours_per_day` value, we need to know each person's working schedule. As it's not specified, I've assumed regular weekdays (Monday through Friday) for everyone, with no holidays or exceptions accounted for. Also, I've assumed that both the start date and the end date are inclusive.

## What did you notice that looked wrong?

Anything in the output that didn't match what you expected. Whether you fixed it or left
it, we want to know you saw it.

- For each assignment, there are 15 rows in the seed data: 126195 total rows for only 8413 actual assignments. At first, I wasn't sure whether to consider them as duplicates or not. But looking into the Git history, I found that the original seed had `hours_per_day` equal to the sum of the rows. So, decided to sum them instead of treating them as duplicates.

- The API accepts specific date ranges (`from` and `to` dates), but the frontend shows a grid organized by full weeks. To keep consistency for the weekly columns, the backend expands the date range to consider full weeks (considering the convention of Mon-Sun weeks), so the range will really be: the Monday of the week of `from`, through the Sunday of the week of `to`. It also limits requests to a maximum of 26 weeks, as a guardrail to prevent the result from growing indefinitely.

- Each person's `weekly_hours` capacity is stored as a single value per person. But the fact that capacity can be edited makes me think there should be some sort of history for each person's capacity. With the current setup, changing someone's capacity will change calculation for past weeks also. In a real-life scenario, I'd expect this to work differently, although that's a requirement to be understood/confirmed.

## What did the AI get wrong that you caught?

One concrete example. Every real session has one.

- I didn't catch any real mistake. I did query Postgres on my own and inspected the Git history to verify Claude's interpretation and suggestions, though.

## What would you do differently with a week?

- Spend more time confirming assumptions, requirements, and testing things myself to suggest changes and improvements.
- Increase test coverage with more scenarios covering, for instance: single-day assignments, weekends, zero capacity...
- Consider adding pagination and/or virtualization
