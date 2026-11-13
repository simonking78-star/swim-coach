# Release notes

The version shown in the app footer comes from `package.json`. Bump it when a release goes out and add a line here.

## Unreleased — Season Plan page (desktop)
- On a laptop or desktop the Season planner opens as a landscape calendar: Annual (52 weeks, each split Mon–Fri / Sat–Sun), Month, Macro, Meso and Micro (weekly timetable) views. Zoom with − / +, Ctrl + scroll or pinch; Shift + scroll moves along (A-131, A-135).
- Three rows per squad: hover the name row to see the macro-cycle over its meso-cycles; events row with team / target blocks, qualifying / train-through dots, test set and squad movement windows, and club events; training row shaded light to deep blue by planned weekly metres, per squad (A-132 to A-134, A-136).
- Hover any block for its details; click to open it. Toolbar buttons open the season editors; new editors for test windows, squad moves, club events and competition registrations (A-137, A-141).
- Training, Metrics and Competition panels under the calendar: attendance and sessions run vs the same weeks last season, metres and hours per swimmer per week, test set medians by squad, swimmers and events by CQT / CCT bands, next-meet registrations and non-competitors (A-138 to A-140).
- Club admins confirm the club's county standard (which times are CQT and CCT) per season; no default (A-143).
- Micro-cycles: optional planned volume (metres) per week. Phones keep the existing squad panels.

## Unreleased — Membership administration
- New Membership section (club admin edit, head coach read): Accounts, Athletes and Registration tabs, each a live table with chosen/reordered columns, search, per-column filters, sorting and CSV export.
- Account profile: contact, home address, status (Pending new / Live / Suspended / Resigned), club roles, app access, guardians, linked athletes, fees and paid status. Save / Close.
- Athlete profile: Details (age and year of birth from date of birth, squad registration and history, England number, total PBs, Swim England registration, fees, medical and emergency contacts, make inactive), Attendance (date range, 90-day default), Personal bests with history chart, Test sets.
- Users & roles: "Superadmin" is now called "Development admin"; People with access is split into one section per role, showing names only (no email addresses or clubs).
- Medical and emergency contacts also show (read only) on the Swimmers profile for the athlete's squad coaches.

## Earlier — Metrics & Measures
- Test & Assess becomes Metrics & Measures: fixed, versioned test protocols graded by level; coaches choose only the level (A-120, A-121).
- Protocol library: draft → pilot → live → retired; publishing locks a version; reliability values (TE, CV%, ICC, SWC) per level (A-121, A-123).
- Run a test on any date; each swimmer's first result is their baseline; closing a test links results to the swimmer's own baseline and previous result, flagged against 2 × TE (A-132).
- Timed trials with approach / wall / out splits and legality; "not tested" with a reason (A-122).
- Results listed by name with a squad picture of counts; no ranks anywhere. Old Test & Assess results kept as Statistics → Legacy test sets (A-131).
- Work tags: each session-plan set line gets suggested work types (kick, turns, speed, drill…) from its text and heading; coaches confirm them (A-126).
- Training before each result: sessions, hours, metres and work types since the previous result, since the baseline and over 90 days, plus time at the club and in the squad, stored when a test is closed (A-127).
- Quick measures in Feedback: stroke count, turn legality, underwater kicks after the dive; trends in Results (A-125).
- Testing windows, including fixed-date tests such as the T15–T30 day.

## 0.2.0 (2 Nov 2026)
- Attendance register: lane, distance swum and a note per swimmer; session total distance (A-094).
- Add a swimmer from another squad to a register (A-095).
- Weekly sessions: course, location, coaches and note; change or cancel a single date (A-096).
- Settings: how to add the app to an iPhone or Android home screen (A-041).
- Footer shows the app version and build (A-021).

## 0.1.0
- Club and squad ids replace names throughout (Phases 1–5b).
