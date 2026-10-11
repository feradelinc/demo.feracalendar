import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { uuidPattern } from "./data.js";
export const xmlExamples = {
  propfind:
    '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:displayname/><d:resourcetype/><d:current-user-privilege-set/><d:sync-token/><c:calendar-home-set/></d:prop></d:propfind>',
  query:
    '<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter></c:calendar-query>',
  multiget: (uuid) =>
    `<?xml version="1.0"?><c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><d:href>${uuid}</d:href></c:calendar-multiget>`,
  sync: '<?xml version="1.0"?><d:sync-collection xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:sync-token/><d:sync-level>1</d:sync-level><d:prop><d:getetag/><c:calendar-data/></d:prop></d:sync-collection>',
};
export function parseXML(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw Error("External entities and DTDs are prohibited");
  let errors = [];
  const doc = new DOMParser({
    errorHandler: {
      warning: (x) => errors.push(x),
      error: (x) => errors.push(x),
      fatalError: (x) => errors.push(x),
    },
  }).parseFromString(text, "application/xml");
  if (errors.length || !doc.documentElement)
    throw Error("Invalid XML document");
  return doc;
}
export function davSummary(text) {
  const doc = parseXML(text),
    all = (n, name) => Array.from(n.getElementsByTagNameNS("*", name)),
    first = (n, name) => all(n, name)[0]?.textContent || null;
  return {
    syncToken: first(doc, "sync-token"),
    responses: all(doc, "response").map((n) => ({
      href: first(n, "href"),
      displayName: first(n, "displayname"),
      etag: first(n, "getetag"),
      status: first(n, "status"),
      privileges: all(n, "privilege")
        .map((x) => x.firstChild?.localName)
        .filter(Boolean),
      calendarData: first(n, "calendar-data"),
      syncToken: first(n, "sync-token"),
    })),
  };
}
export function formattedXML(text) {
  const raw = new XMLSerializer().serializeToString(parseXML(text));
  let depth = 0;
  return raw
    .replace(/>\s*</g, ">\n<")
    .split("\n")
    .map((line) => {
      if (/^<\//.test(line)) depth--;
      const result = "  ".repeat(Math.max(0, depth)) + line;
      if (
        /^<[^/?!][^>]*>/.test(line) &&
        !line.includes("</") &&
        !line.endsWith("/>")
      )
        depth++;
      return result;
    })
    .join("\n");
}
export function parseICS(text) {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/),
    start = lines.indexOf("BEGIN:VEVENT"),
    end = lines.indexOf("END:VEVENT");
  if (start < 0 || end < start) throw Error("Complete VEVENT required");
  const fields = {};
  for (const line of lines.slice(start + 1, end)) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const [name, ...params] = line.slice(0, i).split(";");
    fields[name] = {
      value: line
        .slice(i + 1)
        .replace(/\\n/gi, "\n")
        .replace(/\\([,;\\])/g, "$1"),
      params: params.join(";"),
    };
  }
  return fields;
}
export function normalizeICS(text) {
  return text
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .join("\r\n")
    .replace(/(?:\r\n)*$/, "\r\n");
}
export function validateICS(text, file) {
  const fields = parseICS(text);
  if (
    !uuidPattern.test(fields.UID?.value || "") ||
    file !== fields.UID.value + ".ics"
  )
    throw Error("VEVENT UID must match the UUID.ics resource name");
  if (!fields.DTSTART || !fields.DTEND)
    throw Error("DTSTART and DTEND are required");
  if (
    !text.includes("BEGIN:VCALENDAR") ||
    !text.includes("VERSION:2.0") ||
    !text.includes("END:VCALENDAR")
  )
    throw Error("Complete VCALENDAR 2.0 required");
  return fields;
}
const stamp = (s) =>
  new Date(s)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
const escape = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
export function sampleICS(uuid, event) {
  const rows = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Feradel//FeraCalendar Developer Studio//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    "UID:" + uuid,
    "DTSTAMP:" + stamp(new Date()),
    "DTSTART:" + stamp(event.startsAt),
    "DTEND:" + stamp(event.endsAt),
    "SUMMARY:" + escape(event.title),
    "DESCRIPTION:" + escape(event.description),
    "LOCATION:" + escape(event.location),
    "STATUS:CONFIRMED",
    ...(event.recurrence ? ["RRULE:" + event.recurrence] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return (
    rows
      .map((line) => {
        let out = "",
          bytes = 0;
        for (const c of line) {
          const size = new TextEncoder().encode(c).length;
          if (bytes + size > 74) {
            out += "\r\n ";
            bytes = 1;
          }
          out += c;
          bytes += size;
        }
        return out;
      })
      .join("\r\n") + "\r\n"
  );
}
