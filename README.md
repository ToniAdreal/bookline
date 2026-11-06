# BookLine — AI Voice Front Desk for Local Service Businesses

**Never miss a booking because nobody picked up the phone.**

## The pitch

Local service businesses live and die by the phone. A dental clinic, a hair
salon, an auto repair shop: when a customer calls and gets voicemail, they do
not leave a message, they call the next business on Google. Industry surveys
routinely put missed-call rates for small local businesses at 30–60% of calls,
worst exactly when it hurts most, after hours and during the morning rush when
the human front desk is already busy with people standing in front of them.

BookLine answers every call, 24/7, in a natural voice. It knows the business's
real services, real hours and real appointment book. It books the customer
into an actual open slot, sends the confirmation, and puts the appointment on
the owner's screen. No double bookings, no bookings outside opening hours, no
"we'll call you back" that never happens.

One recovered booking a week already pays for the product several times over
at typical local-service ticket sizes (a dental cleaning is $120, an emergency
visit far more).

## Target customer

US local service businesses that book appointments by phone and have 1–10
staff:

- Dental and orthodontic clinics (the demo is seeded for one)
- Hair salons, barbershops, nail studios
- Auto repair, HVAC, plumbing and appliance repair shops
- Vet clinics, physiotherapy, med spas

Common trait: the owner is also the technician, there is no full-time
receptionist, and the appointment book is the revenue.

## Pricing

- **USD 99 / location / month** — one location, booking + reminders, business hours rules
- **USD 199 / location / month** — adds after-hours capture, reschedule/cancel by phone, review-request follow-ups
- **USD 299 / location / month** — multi-staff calendars, multiple services lines, priority support

No per-minute telephony surprise for the customer: call minutes are bundled
at fair-use levels. Month to month, cancel any time.

## What the demo does

This repository is a runnable demo with zero dependencies (plain Node.js,
`node:http` only). It is seeded for one fictional business,
**BrightSmile Dental, Austin TX**, with five services, real opening hours
(Mon–Fri 09:00–17:00, Sat 09:00–13:00, Sun closed) and pre-booked
appointments.

- **Simulated call panel** — a chat panel that plays a phone call with the AI
  receptionist: greeting, service, day, a list of genuinely open times, name,
  phone, confirmation with a booking reference. Where the browser supports
  it, the 🎙 button uses the Web Speech API for voice input and the 🔊 toggle
  speaks the receptionist's replies back.
- **Direct booking form** — the same booking engine without the conversation.
- **Business admin view** — every appointment with customer name, service,
  date, time and status, plus cancel (which frees the slot again).
- **Real booking rules, enforced on the server:**
  - A taken slot cannot be double-booked. Overlapping appointments are
    refused with HTTP 409 and a polite spoken-style message.
  - Closed days (Sunday), out-of-hours times, times that would run past
    closing, and non-existent dates are all refused politely.
  - Appointments start on the hour or half hour, and a longer service
    (e.g. 90-minute whitening) blocks the whole span it occupies.

## Run it

Requires Node.js 18+ (tested on Node 24). No `npm install` needed, there are
no dependencies.

```bash
node server.js
# BookLine demo for BrightSmile Dental listening on http://localhost:4173
```

Open http://localhost:4173 in a browser.

- Customer view: book through the simulated call or the direct form.
- Business view: click **Business — admin** to see the appointment book.

Use a different port with `PORT=8080 node server.js`.

### API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/info` | Clinic, services and hours |
| GET | `/api/slots?date=YYYY-MM-DD&service=<id>` | Open start times for a service on a date |
| GET | `/api/appointments` | All appointments (admin) |
| POST | `/api/book` | Create a booking. JSON: `customerName`, `phone`, `serviceId`, `date`, `time` |
| POST | `/api/appointments/<ref>/cancel` | Cancel a booking and free its slot |

Bookings live in memory and reset when the server restarts, so every demo
starts from the same seeded book.

## Demo vs production

What you see here is a product demo, not the production system:

| Area | This demo | Production |
| --- | --- | --- |
| Phone calls | Simulated call panel in the browser, optional Web Speech API voice | Real telephony via a provider such as **Twilio Voice** (or Vonage / Telnyx): the customer's call is transcribed by streaming speech-to-text, the exact same booking API is called mid-call, and replies are spoken with neural text-to-speech |
| Conversation | Guided state machine with chip shortcuts | LLM-driven conversation with the same server-side booking rules as hard guardrails, so the model can chat freely but can never invent a slot or double-book |
| Data | In-memory seed data | Per-business database, staff calendars, Google/Outlook calendar sync |
| Reminders | Mentioned in the confirmation text | SMS and voice reminders via the telephony provider, no-show follow-up, review requests |
| Payments | Not included | Optional card capture for deposits on high-value services |
| Compliance | Fictional clinic, fictional data | Call-recording consent prompts, HIPAA-aware configuration for medical customers, data retention controls |

The important design point carries over unchanged: the booking rules live on
the server, not in the voice layer. Whatever speaks to the customer, a human,
an LLM or this demo, can only book slots that actually exist.

## Why this business works

- Clear, countable ROI: missed call → lost booking → recovered revenue.
- The customer already spends more than the subscription on the problem
  (receptionist wages, answering services at $1–2 per minute).
- Setup is one afternoon: services, hours, staff. No hardware.
- Expansion path inside the same customer: reminders, reviews, recalls
  ("your six-month cleaning is due"), then more locations.
