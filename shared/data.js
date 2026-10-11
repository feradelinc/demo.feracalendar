import { Temporal } from "@js-temporal/polyfill";
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const pretty = (v) =>
  typeof v === "string" ? v : JSON.stringify(v, null, 2);
export function redact(value, secrets = []) {
  if (typeof value === "string") {
    let s = value;
    for (const secret of secrets.filter(Boolean))
      s = s.split(secret).join("[REDACTED]");
    return s.replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[REDACTED]",
    );
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, secrets));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /password|token|authorization|api.?key|cookie|secret/i.test(k)
          ? "[REDACTED]"
          : redact(v, secrets),
      ]),
    );
  return value;
}
export function traceForDownload(value) {
  const mask = (v) =>
    Array.isArray(v)
      ? v.map(mask)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v).map(([k, x]) => [
              k,
              /email|phone|firstName|lastName|displayName|description|location|title|body|data/i.test(
                k,
              )
                ? "[OMITTED FOR PRIVACY]"
                : mask(x),
            ]),
          )
        : typeof v === "string"
          ? v.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
          : v;
  return mask(redact(value));
}
export function localInstant(wall, zone, disambiguation = "reject") {
  return Temporal.PlainDateTime.from(wall)
    .toZonedDateTime(zone, { disambiguation })
    .toInstant()
    .toString();
}
export function wallTime(instant, zone) {
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}
export const today = (zone = "America/New_York") =>
  Temporal.Now.plainDateISO(zone).toString();
export function shiftDate(date, days) {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}
export function viewDates(date, view) {
  let d = Temporal.PlainDate.from(date);
  if (view === "month") {
    d = d.with({ day: 1 });
    d = d.subtract({ days: d.dayOfWeek % 7 });
    return Array.from({ length: 42 }, (_, i) => d.add({ days: i }).toString());
  }
  if (view === "week") d = d.subtract({ days: d.dayOfWeek % 7 });
  return Array.from(
    { length: view === "day" ? 1 : view === "week" ? 7 : 14 },
    (_, i) => d.add({ days: i }).toString(),
  );
}
export function rangeFor(date, view, zone) {
  const ds = viewDates(date, view);
  return {
    startAt: localInstant(ds[0] + "T00:00", zone, "compatible"),
    endAt: localInstant(shiftDate(ds.at(-1), 1) + "T00:00", zone, "compatible"),
  };
}
export const overlaps = (event, start, end) =>
  Date.parse(event.endsAt) > Date.parse(start) &&
  Date.parse(event.startsAt) < Date.parse(end);
export function scenario(
  date = today(),
  zone = "America/New_York",
  prefix = "northstar-example",
) {
  return {
    avery: {
      key: prefix + "-avery",
      firstName: "Avery",
      lastName: "Morgan",
      displayName: "Avery Morgan",
      email: prefix + "-avery@example.test",
    },
    taylor: {
      key: prefix + "-taylor",
      firstName: "Taylor",
      lastName: "Chen",
      displayName: "Taylor Chen",
      email: prefix + "-taylor@example.test",
    },
    room: {
      key: prefix + "-room",
      displayName: "Conference Room A",
      email: prefix + "-room@example.test",
    },
    vehicle: {
      key: prefix + "-vehicle",
      displayName: "Company Vehicle 1",
      email: prefix + "-vehicle@example.test",
    },
    calendar: { name: "Northstar Client Meetings " + prefix, shared: false },
    event: {
      title: "New Client Consultation",
      description: "Fictional Northstar Consulting calendar demonstration.",
      location: "Conference Room A",
      startsAt: localInstant(date + "T10:00", zone),
      endsAt: localInstant(date + "T11:00", zone),
      allDay: false,
      status: "confirmed",
      style: "event",
      recurrence: null,
    },
    weekly: {
      title: "Weekly Team Review",
      startsAt: localInstant(date + "T14:00", zone),
      endsAt: localInstant(date + "T14:30", zone),
      status: "confirmed",
      style: "event",
      recurrence: "FREQ=WEEKLY;BYDAY=MO;COUNT=6",
    },
    reservation: {
      title: "Equipment Reservation",
      startsAt: localInstant(date + "T15:00", zone),
      endsAt: localInstant(date + "T16:00", zone),
      style: "block",
      status: "confirmed",
      recurrence: "FREQ=WEEKLY;COUNT=3",
    },
  };
}
export function routeFor(op, params = {}, query = {}) {
  const route = op.route.replace(/\{([^}]+)\}/g, (_, key) => {
    const value = String(params[key] ?? "");
    if (!value || value.length > 500 || /[\\?#\u0000-\u001f%]/.test(value))
      throw Error("Invalid path parameter " + key);
    if (
      [
        "uuid",
        "userUuid",
        "calendar",
        "calendarUuid",
        "instance",
        "person",
      ].includes(key) &&
      !uuidPattern.test(value)
    )
      throw Error(key + " must be a UUID");
    if (key === "visibility" && (!/^\d+$/.test(value) || Number(value) > 15))
      throw Error("Visibility must be 0?15");
    if (
      ["startAt", "endAt"].includes(key) &&
      (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
        !Number.isFinite(Date.parse(value)))
    )
      throw Error(key + " must be an ISO instant");
    const parts = value.split("/");
    if (parts.some((s) => !s || s === "." || s === ".."))
      throw Error("Unsafe descendant path");
    if (key !== "path" && parts.length > 1) throw Error("Invalid path segment");
    if (
      key === "path" &&
      op.service === "caldav" &&
      ["GET", "PUT", "DELETE"].includes(op.method) &&
      !new RegExp("^" + uuidPattern.source.slice(1, -1) + "\\.ics$", "i").test(
        value,
      )
    )
      throw Error("Event resource must be UUID.ics");
    return parts.map(encodeURIComponent).join("/");
  });
  const allowed = new Set(
    op.parameters.filter((p) => p.in === "query").map((p) => p.name),
  );
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (!allowed.has(k)) throw Error("Unsupported query " + k);
    if (v !== "" && v != null) {
      if (
        ["limit", "offset"].includes(k) &&
        (!/^\d+$/.test(String(v)) ||
          Number(v) > (k === "limit" ? 100 : 10000) ||
          Number(v) < (k === "limit" ? 1 : 0))
      )
        throw Error("Invalid " + k);
      if (k === "before" && !Number.isFinite(Date.parse(v)))
        throw Error("Invalid before instant");
      if (
        ["uuid", "uuids"].includes(k) &&
        [v]
          .flat()
          .flatMap((x) => String(x).split(","))
          .some((x) => !uuidPattern.test(x.trim()))
      )
        throw Error("Invalid event UUID filter");
      if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
      else q.set(k, String(v));
    }
  }
  return route + (q.size ? "?" + q : "");
}
