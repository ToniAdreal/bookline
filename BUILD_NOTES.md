# BookLine — Build Notes

Built 2026-11-06 as a Team247 product proposal demo (proposal 2 of the set:
AI voice front desk for US local service businesses).

## What was built

Zero-dependency Node.js app (only `node:http`, `node:fs`, `node:path`):

- `server.js` — HTTP server + booking engine + JSON API.
  Seeded for one fictional clinic, BrightSmile Dental (Austin, TX):
  5 services (Cleaning 60m, Exam & X-Ray 45m, Whitening 90m,
  Filling/Crown Consult 30m, Emergency 30m), hours Mon–Fri 09:00–17:00,
  Sat 09:00–13:00, Sun closed, and 5 pre-booked appointments seeded
  relative to the current date so the demo week always looks real.
- `index.html` — single-page app with two views:
  - Customer view: a simulated call panel (guided chat receptionist with
    clickable suggestion chips, optional Web Speech API voice input via
    SpeechRecognition and spoken replies via speechSynthesis, both only
    where the browser supports them) plus a direct booking form that shows
    only genuinely open slots.
  - Business admin view: table of all appointments (ref, customer, phone,
    service, date, time, duration, status) with a cancel action that frees
    the slot.
- `verify.js` — end-to-end verification script (runs against the server).
- `README.md` — pitch, target customer, pricing (USD 99–299/location/month),
  run instructions, API table, and demo-vs-production notes (real telephony
  via a provider like Twilio in production).

## Booking rules enforced server-side

- Taken slots cannot be double-booked: overlap check across the full
  duration of both appointments, refused with HTTP 409 `slot_taken`.
- Sunday (closed day): HTTP 400 `closed`.
- Outside opening hours, or a service that would run past closing:
  HTTP 400 `outside_hours`.
- Start times must align to the hour / half hour: `unaligned_time`.
- Unknown service, malformed date or time, missing name or phone: refused
  with a polite receptionist-style message in every case.

## Verification evidence (2026-11-06, Node v24.22.1)

Server start:

```
$ node server.js
BookLine demo for BrightSmile Dental listening on http://localhost:4173
```

Page fetch:

```
$ curl -s -o page.html -w "HTTP %{http_code} %{size_download} bytes" http://localhost:4173/
HTTP 200 17504 bytes
<title>BookLine — AI Voice Front Desk (Demo)</title>
```

Full booking flow through the API (`node verify.js`, exit code 0, full raw
output in `verify_output.txt`):

```
GET /api/info -> 200 clinic="BrightSmile Dental" services=5
GET /api/slots?date=2026-11-07&service=cleaning -> 200 open slots: 10:30, 12:00
POST /api/book {"customerName":"Verify Script","phone":"(512) 555-0199","serviceId":"cleaning","date":"2026-11-07","time":"10:30","source":"verify script"} -> 201 ref=BL-1006
  confirmation: You're all set, Verify. Teeth Cleaning at BrightSmile Dental on 2026-11-07 at 10:30. Your booking reference is BL-1006. We'll send a reminder the day before.
POST /api/book (same slot again) -> 409 code=slot_taken
  refusal: I'm sorry, that time was just taken. I have other openings the same day if you'd like me to list them.
POST /api/book (Sunday 2026-11-08) -> 400 code=closed
POST /api/book (03:00, outside hours) -> 400 code=outside_hours
GET /api/appointments -> 200 total=6 my booking present: true status=confirmed
GET /api/slots after booking -> slot 10:30 still offered: false
VERIFY RESULT: PASS
```

Note the date choice exercised the Saturday rules: 2026-11-07 is a Saturday,
so hours were 09:00–13:00, the 10:00 seed booking plus duration logic left
only 10:30 and 12:00 open for a 60-minute cleaning, and the out-of-hours
refusal correctly quoted the Saturday closing time of 13:00.

Cancel path (manual curl, after the scripted run):

```
POST /api/appointments/BL-1006/cancel -> {"ok":true, ... "status":"cancelled", "message":"Appointment BL-1006 has been cancelled and the slot is open again."}
GET /api/slots?date=2026-11-07&service=cleaning -> slots: ["10:30","12:00"]   (10:30 open again)
```

## Known demo limitations

- Bookings are in-memory and reset on server restart, by design, so every
  demo run starts from the same seeded book.
- The voice buttons depend on browser Web Speech API support (Chrome works,
  Firefox does not ship SpeechRecognition). The chat flow works everywhere.
- No real phone calls, SMS, payments or calendar sync: see the
  demo-vs-production table in README.md.
