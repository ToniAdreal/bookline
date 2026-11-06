'use strict';
/* End-to-end verification against the running server (see BUILD_NOTES.md). */
const BASE = process.env.BASE || 'http://localhost:4173';

async function j(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* html etc. */ }
  return { status: res.status, data };
}
function openDatePlus(days) {
  // find the n-th date from today (inclusive) that is not a Sunday
  const d = new Date(); d.setDate(d.getDate() + days);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function nextSunday() {
  const d = new Date();
  do { d.setDate(d.getDate() + 1); } while (d.getDay() !== 0);
  return d.toISOString().slice(0, 10);
}

(async () => {
  const out = [];
  const log = (s) => { out.push(s); console.log(s); };

  const info = await j('GET', '/api/info');
  log(`GET /api/info -> ${info.status} clinic="${info.data.clinic.name}" services=${info.data.services.length}`);

  const date = openDatePlus(1);
  const slots = await j('GET', `/api/slots?date=${date}&service=cleaning`);
  log(`GET /api/slots?date=${date}&service=cleaning -> ${slots.status} open slots: ${slots.data.slots.join(', ')}`);
  const slot = slots.data.slots[0];
  if (!slot) throw new Error('no open slot found for verification');

  const booking = { customerName: 'Verify Script', phone: '(512) 555-0199', serviceId: 'cleaning', date, time: slot, source: 'verify script' };
  const first = await j('POST', '/api/book', booking);
  log(`POST /api/book ${JSON.stringify(booking)} -> ${first.status} ref=${first.data.appointment && first.data.appointment.ref}`);
  log(`  confirmation: ${first.data.message}`);

  const again = await j('POST', '/api/book', { ...booking, customerName: 'Double Booker' });
  log(`POST /api/book (same slot again) -> ${again.status} code=${again.data.code}`);
  log(`  refusal: ${again.data.message}`);

  const sunday = await j('POST', '/api/book', { ...booking, date: nextSunday(), time: '10:00' });
  log(`POST /api/book (Sunday ${nextSunday()}) -> ${sunday.status} code=${sunday.data.code}`);
  log(`  refusal: ${sunday.data.message}`);

  const night = await j('POST', '/api/book', { ...booking, date, time: '03:00' });
  log(`POST /api/book (03:00, outside hours) -> ${night.status} code=${night.data.code}`);
  log(`  refusal: ${night.data.message}`);

  const list = await j('GET', '/api/appointments');
  const mine = list.data.appointments.find(a => a.ref === (first.data.appointment || {}).ref);
  log(`GET /api/appointments -> ${list.status} total=${list.data.appointments.length} my booking present: ${!!mine} status=${mine && mine.status}`);

  const slotsAfter = await j('GET', `/api/slots?date=${date}&service=cleaning`);
  log(`GET /api/slots after booking -> slot ${slot} still offered: ${slotsAfter.data.slots.includes(slot)}`);

  const passed = first.status === 201 && again.status === 409 && again.data.code === 'slot_taken'
    && sunday.status === 400 && night.status === 400 && !!mine && !slotsAfter.data.slots.includes(slot);
  log(passed ? 'VERIFY RESULT: PASS' : 'VERIFY RESULT: FAIL');
  if (!passed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
