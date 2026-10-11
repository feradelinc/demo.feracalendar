import test from "node:test";
import assert from "node:assert/strict";
import operations from "../shared/operations.json" with { type: "json" };
import {
  localInstant,
  wallTime,
  rangeFor,
  overlaps,
  routeFor,
  scenario,
  redact,
  traceForDownload,
} from "../shared/data.js";
import {
  sampleICS,
  parseICS,
  validateICS,
  normalizeICS,
  parseXML,
  davSummary,
} from "../shared/protocol.js";
import { execFileSync } from "node:child_process";
test("canonical public/internal/alias/CalDAV/health counts and uniqueness", () => {
  assert.equal(
    operations.filter((o) => o.service === "rest" && !o.internal && !o.health)
      .length,
    30,
  );
  assert.equal(operations.filter((o) => o.internal).length, 4);
  assert.equal(
    operations.filter((o) => o.service === "caldav" && !o.supplemental).length,
    30,
  );
  assert.equal(operations.filter((o) => o.supplemental).length, 4);
  assert.equal(new Set(operations.map((o) => o.id)).size, operations.length);
  assert.ok(
    !operations.some(
      (o) => o.route.startsWith("/api/") && !o.route.startsWith("/api/v1/"),
    ),
  );
});
test("source inventory audit rejects drift and reconciles operation contracts", () => {
  execFileSync(process.execPath, ["scripts/audit.mjs", "--check"]);
});
test("New York summer/winter ISO conversions and reverse display", () => {
  assert.equal(
    localInstant("2026-07-01T10:00", "America/New_York"),
    "2026-07-01T14:00:00Z",
  );
  assert.equal(
    localInstant("2026-01-01T10:00", "America/New_York"),
    "2026-01-01T15:00:00Z",
  );
  assert.equal(
    wallTime("2026-07-01T14:00:00Z", "America/New_York"),
    "2026-07-01T10:00",
  );
});
test("DST gaps and folds require explicit disambiguation", () => {
  assert.throws(() => localInstant("2026-03-08T02:30", "America/New_York"));
  assert.throws(() => localInstant("2026-11-01T01:30", "America/New_York"));
  assert.equal(
    localInstant("2026-11-01T01:30", "America/New_York", "earlier"),
    "2026-11-01T05:30:00Z",
  );
  assert.equal(
    localInstant("2026-11-01T01:30", "America/New_York", "later"),
    "2026-11-01T06:30:00Z",
  );
});
test("all-day DST range and half-open overlap boundary", () => {
  const range = rangeFor("2026-03-08", "day", "America/New_York");
  assert.equal(
    (Date.parse(range.endAt) - Date.parse(range.startAt)) / 3600000,
    23,
  );
  assert.equal(
    overlaps(
      { startsAt: range.endAt, endsAt: "2026-03-10T00:00Z" },
      range.startAt,
      range.endAt,
    ),
    false,
  );
  assert.equal(
    overlaps(
      { startsAt: range.startAt, endsAt: range.endAt },
      range.startAt,
      range.endAt,
    ),
    true,
  );
});
test("registry path validation blocks traversal and tenant parameter confusion", () => {
  const op = operations.find(
    (o) =>
      o.route === "/caldav/calendars/{calendarUuid}/{path}" &&
      o.method === "PUT",
  );
  const uuid = "11111111-1111-4111-8111-111111111111";
  assert.ok(
    routeFor(op, { calendarUuid: uuid, path: uuid + ".ics" }).endsWith(".ics"),
  );
  for (const path of [
    "../secret",
    "%2e%2e",
    "a/b.ics",
    "https://evil.test",
    "a?b",
  ])
    assert.throws(() => routeFor(op, { calendarUuid: uuid, path }));
  assert.throws(() =>
    routeFor(op, { calendarUuid: "wrong", path: uuid + ".ics" }),
  );
});
test("ICS CRLF, escaped Unicode, folded lines, UUID validation and recurrence", () => {
  const uuid = "11111111-1111-4111-8111-111111111111",
    event = {
      ...scenario("2027-02-01").event,
      title: "Weekly, planning; review " + "?".repeat(70),
      recurrence: "FREQ=WEEKLY;COUNT=6",
    };
  const ics = sampleICS(uuid, event);
  assert.equal(parseICS(ics).SUMMARY.value, event.title);
  assert.equal(parseICS(ics).RRULE.value, event.recurrence);
  assert.ok(ics.includes("\r\n "));
  assert.ok(ics.split("\r\n").every((x) => Buffer.byteLength(x) <= 75));
  validateICS(ics, uuid + ".ics");
  assert.throws(() =>
    validateICS(ics, "22222222-2222-4222-8222-222222222222.ics"),
  );
  assert.equal(normalizeICS(ics.replace(/\r/g, "")), ics);
});
test("DAV parses actual href, ETag, calendar data and sync metadata; rejects unsafe XML", () => {
  const xml =
    '<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:sync-token>sync1</d:sync-token><d:response><d:href>/calendar/</d:href><d:propstat><d:prop><d:getetag>&quot;v1&quot;</d:getetag><c:calendar-data>BEGIN:VCALENDAR</c:calendar-data></d:prop></d:propstat></d:response></d:multistatus>';
  const s = davSummary(xml);
  assert.equal(s.syncToken, "sync1");
  assert.equal(s.responses[0].etag, '"v1"');
  assert.throws(() =>
    parseXML('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///secret">]><x/>'),
  );
  assert.throws(() => parseXML("<x>"));
});
test("secrets and contact fields cannot leak in downloadable trace", () => {
  const trace = {
    request: {
      headers: { authorization: "Basic PRIVATE", "x-auth-token": "private" },
      body: { email: "a@example.test", password: "PRIVATE" },
    },
    data: { phone: "555", token: "PRIVATE" },
  };
  const text = JSON.stringify(traceForDownload(trace));
  assert.ok(!text.includes("PRIVATE"));
  assert.ok(!text.includes("example.test"));
  assert.ok(!text.includes("555"));
  assert.equal(redact("PRIVATE", ["PRIVATE"]), "[REDACTED]");
});
