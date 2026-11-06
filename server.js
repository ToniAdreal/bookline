'use strict';
/*
 * BookLine - AI voice front desk demo
 * Zero-dependency Node.js server (node:http only).
 *
 * This is a DEMO. In production the simulated call panel is replaced by a
 * real telephony provider (e.g. Twilio Voice) feeding the same booking API.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4173;

/* ------------------------------------------------------------------ */
/* Seed data: one fictional dental clinic                              */
/* ------------------------------------------------------------------ */
const CLINIC = {
  name: 'BrightSmile Dental',
  tagline: 'Family dentistry in Austin, TX',
  city: 'Austin, TX',
  phoneDisplay: '(512) 555-0147',
  // weekday: 0 = Sunday ... 6 = Saturday. null = closed.
  hours: {
    0: null,
    1: { open: '09:00', close: '17:00' },
    2: { open: '09:00', close: '17:00' },
    3: { open: '09:00', close: '17:00' },
    4: { open: '09:00', close: '17:00' },
    5: { open: '09:00', close: '17:00' },
    6: { open: '09:00', close: '13:00' },
  },
  slotStepMinutes: 30,
};

const SERVICES = [
  { id: 'cleaning',   name: 'Teeth Cleaning',          durationMin: 60, priceUSD: 120 },
  { id: 'exam',       name: 'Exam & X-Ray',            durationMin: 45, priceUSD: 85 },
  { id: 'whitening',  name: 'Teeth Whitening',         durationMin: 90, priceUSD: 299 },
  { id: 'consult',    name: 'Filling / Crown Consult', durationMin: 30, priceUSD: 0 },
  { id: 'emergency',  name: 'Emergency Tooth Pain',    durationMin: 30, priceUSD: 95 },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function toMinutes(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
function toHHMM(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}
function parseDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}
function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function serviceById(id) { return SERVICES.find(s => s.id === id) || null; }

/* ------------------------------------------------------------------ */
/* Appointments store (in-memory, seeded relative to "today" so the   */
/* demo always has a realistic bookable week)                          */
/* ------------------------------------------------------------------ */
let refCounter = 1000;
function makeRef() { refCounter += 1; return `BL-${refCounter}`; }

const appointments = [];

function seed() {
  appointments.length = 0;
  refCounter = 1000;
  const seeds = [
    // offsetDays, time, serviceId, customer
    [0, '10:00', 'cleaning', 'Maria Gonzalez'],
    [0, '13:30', 'exam', 'James Whitfield'],
    [1, '09:00', 'whitening', 'Priya Nair'],
    [1, '11:30', 'consult', 'Tom Becker'],
    [2, '14:00', 'cleaning', 'Alicia Ford'],
  ];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const [offset, time, serviceId, customer] of seeds) {
    const d = new Date(today); d.setDate(d.getDate() + offset);
    // Skip seeds that land on a closed day (Sunday) — shift to next day.
    while (!CLINIC.hours[d.getDay()]) d.setDate(d.getDate() + 1);
    const svc = serviceById(serviceId);
    appointments.push({
      ref: makeRef(),
      customerName: customer,
      phone: '(512) 555-01' + String(10 + appointments.length),
      serviceId, serviceName: svc.name,
      date: fmtDate(d), time, durationMin: svc.durationMin,
      status: 'confirmed', source: 'phone (pre-booked)', notes: '',
      createdAt: new Date().toISOString(),
    });
  }
}
seed();

function overlaps(date, startMin, durationMin, ignoreRef) {
  const endMin = startMin + durationMin;
  return appointments.some(a => {
    if (a.date !== date || a.status === 'cancelled' || a.ref === ignoreRef) return false;
    const aStart = toMinutes(a.time);
    const aEnd = aStart + a.durationMin;
    return startMin < aEnd && aStart < endMin;
  });
}

/**
 * Validate a booking request against the real rules:
 * known service, real calendar date, open day, inside hours, fits before
 * closing, and no overlap with an existing confirmed appointment.
 * Returns { ok, message } — messages are polite, receptionist-style.
 */
function validateBooking({ serviceId, date, time }) {
  const svc = serviceById(serviceId);
  if (!svc) return { ok: false, code: 'unknown_service', message: "I'm sorry, I don't see that service on our list. Could we try one of the services we offer?" };
  const d = parseDate(date);
  if (!d) return { ok: false, code: 'invalid_date', message: "I'm sorry, that date doesn't look quite right. Could you give me a date like 2026-11-10?" };
  const startMin = toMinutes(time);
  if (startMin === null) return { ok: false, code: 'invalid_time', message: "I'm sorry, I didn't catch a valid time there. Our appointments start on the hour or half hour." };
  const dayHours = CLINIC.hours[d.getDay()];
  if (!dayHours) return { ok: false, code: 'closed', message: `I'm sorry, ${CLINIC.name} is closed on Sundays. We are open Monday to Friday 9 to 5, and Saturday 9 to 1. Would another day work?` };
  const openMin = toMinutes(dayHours.open), closeMin = toMinutes(dayHours.close);
  if (startMin < openMin || startMin + svc.durationMin > closeMin) {
    return { ok: false, code: 'outside_hours', message: `I'm sorry, ${svc.name} needs ${svc.durationMin} minutes and has to fit between ${dayHours.open} and ${dayHours.close}. Could we look at a time inside those hours?` };
  }
  if (startMin % CLINIC.slotStepMinutes !== 0) {
    return { ok: false, code: 'unaligned_time', message: "I'm sorry, our appointments start on the hour or half hour. Could we round to one of those?" };
  }
  if (overlaps(date, startMin, svc.durationMin)) {
    return { ok: false, code: 'slot_taken', message: "I'm sorry, that time was just taken. I have other openings the same day if you'd like me to list them." };
  }
  return { ok: true, service: svc };
}

function availableSlots(dateStr, serviceId) {
  const svc = serviceById(serviceId);
  const d = parseDate(dateStr);
  if (!svc || !d) return [];
  const dayHours = CLINIC.hours[d.getDay()];
  if (!dayHours) return [];
  const openMin = toMinutes(dayHours.open), closeMin = toMinutes(dayHours.close);
  const out = [];
  for (let t = openMin; t + svc.durationMin <= closeMin; t += CLINIC.slotStepMinutes) {
    if (!overlaps(dateStr, t, svc.durationMin)) out.push(toHHMM(t));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* HTTP plumbing                                                       */
/* ------------------------------------------------------------------ */
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    if (req.method === 'GET' && p === '/') {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    if (req.method === 'GET' && p === '/api/info') {
      return sendJSON(res, 200, { clinic: CLINIC, services: SERVICES });
    }

    if (req.method === 'GET' && p === '/api/slots') {
      const date = url.searchParams.get('date');
      const serviceId = url.searchParams.get('service');
      if (!parseDate(date) || !serviceById(serviceId)) {
        return sendJSON(res, 400, { ok: false, message: 'Please provide a valid date (YYYY-MM-DD) and a known service id.' });
      }
      return sendJSON(res, 200, { ok: true, date, serviceId, slots: availableSlots(date, serviceId) });
    }

    if (req.method === 'GET' && p === '/api/appointments') {
      const list = [...appointments].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      return sendJSON(res, 200, { ok: true, appointments: list });
    }

    if (req.method === 'POST' && p === '/api/book') {
      const body = await readBody(req);
      const { customerName, phone, serviceId, date, time } = body;
      if (!customerName || !String(customerName).trim()) {
        return sendJSON(res, 400, { ok: false, code: 'missing_name', message: "I'd be happy to book that. May I have your name first?" });
      }
      if (!phone || !String(phone).trim()) {
        return sendJSON(res, 400, { ok: false, code: 'missing_phone', message: 'And a phone number we can reach you at, in case anything changes?' });
      }
      const v = validateBooking({ serviceId, date, time });
      if (!v.ok) return sendJSON(res, v.code === 'slot_taken' ? 409 : 400, { ok: false, code: v.code, message: v.message });
      const appt = {
        ref: makeRef(),
        customerName: String(customerName).trim(),
        phone: String(phone).trim(),
        serviceId, serviceName: v.service.name,
        date, time, durationMin: v.service.durationMin,
        status: 'confirmed', source: body.source || 'simulated call',
        notes: body.notes ? String(body.notes).slice(0, 300) : '',
        createdAt: new Date().toISOString(),
      };
      appointments.push(appt);
      return sendJSON(res, 201, {
        ok: true, appointment: appt,
        message: `You're all set, ${appt.customerName.split(' ')[0]}. ${appt.serviceName} at ${CLINIC.name} on ${appt.date} at ${appt.time}. Your booking reference is ${appt.ref}. We'll send a reminder the day before.`,
      });
    }

    const cancelMatch = /^\/api\/appointments\/([A-Za-z0-9-]+)\/cancel$/.exec(p);
    if (req.method === 'POST' && cancelMatch) {
      const appt = appointments.find(a => a.ref === cancelMatch[1]);
      if (!appt) return sendJSON(res, 404, { ok: false, message: 'No appointment with that reference.' });
      appt.status = 'cancelled';
      return sendJSON(res, 200, { ok: true, appointment: appt, message: `Appointment ${appt.ref} has been cancelled and the slot is open again.` });
    }

    return sendJSON(res, 404, { ok: false, message: 'Not found.' });
  } catch (err) {
    return sendJSON(res, 500, { ok: false, message: 'Something went wrong on our side. Please try again.' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`BookLine demo for ${CLINIC.name} listening on http://localhost:${PORT}`);
  });
}

module.exports = { server, CLINIC, SERVICES, availableSlots, validateBooking };
