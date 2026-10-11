import fs from "node:fs";
import operations from "../shared/operations.json" with { type: "json" };
import { scenario } from "../shared/data.js";
import { xmlExamples, sampleICS } from "../shared/protocol.js";
const uuid = "11111111-1111-4111-8111-111111111111",
  sample = scenario("2027-06-15", "America/New_York", "YOUR_SESSION_PREFIX");
const requests = operations
  .filter((o) => !o.internal && !o.supplemental && !o.health)
  .map((op) => {
    const base = op.service === "rest" ? "{{calendarBase}}" : "{{caldavBase}}",
      route = op.route.replace(/\{([^}]+)\}/g, (_, k) =>
        k === "visibility"
          ? "15"
          : k === "path"
            ? ["GET", "PUT", "DELETE"].includes(op.method)
              ? uuid + ".ics"
              : "events"
            : k === "startAt"
              ? encodeURIComponent(sample.event.startsAt)
              : k === "endAt"
                ? encodeURIComponent(sample.event.endsAt)
                : "{{" + k + "}}",
      );
    const body =
      op.service === "caldav"
        ? op.method === "PROPFIND"
          ? xmlExamples.propfind
          : op.method === "REPORT"
            ? xmlExamples.query
            : op.method === "PUT"
              ? sampleICS(uuid, sample.event)
              : undefined
        : op.method === "POST"
          ? op.route.endsWith("share")
            ? {
                calendar: "RETURNED_CALENDAR_UUID",
                person: "RETURNED_PERSON_UUID",
                inviter: "RETURNED_OWNER_PERSON_UUID",
                role: "editor",
              }
            : op.route.endsWith("unshare")
              ? {
                  calendar: "RETURNED_CALENDAR_UUID",
                  person: "RETURNED_PERSON_UUID",
                }
              : op.route.endsWith("invite")
                ? {
                    event: "RETURNED_EVENT_UUID",
                    person: "RETURNED_PERSON_UUID",
                    invitedBy: "RETURNED_OWNER_PERSON_UUID",
                    status: "accepted",
                    role: "req",
                    mark: "busy",
                  }
                : op.group === "people"
                  ? sample.avery
                  : op.group === "resources"
                    ? sample.room
                    : op.group === "calendars"
                      ? {
                          ...sample.calendar,
                          person: "RETURNED_OWNER_PERSON_UUID",
                        }
                      : {
                          ...sample.event,
                          calendar: "RETURNED_CALENDAR_UUID",
                          creator: "RETURNED_OWNER_PERSON_UUID",
                        }
          : undefined;
    return {
      method: op.method,
      url: base + route,
      headers:
        op.service === "rest"
          ? {
              instance: "{{instance}}",
              "x-auth-token": "{{jwt}}",
              ...(body ? { "content-type": "application/json" } : {}),
            }
          : {
              ...(op.method !== "OPTIONS"
                ? { authorization: "{{basicFromSecureInput}}" }
                : {}),
              ...(["PROPFIND", "REPORT"].includes(op.method)
                ? { depth: "1", "content-type": "application/xml" }
                : op.method === "PUT"
                  ? {
                      "content-type": "text/calendar",
                      "if-match": "{{capturedETag}}",
                    }
                  : {}),
            },
      body,
    };
  });
fs.mkdirSync("examples", { recursive: true });
fs.writeFileSync(
  "examples/calendar-and-caldav.http",
  "# Illustrative source-audited requests. Replace identifiers from actual responses.\n# Credentials must be supplied from secure memory, not saved in this file.\n# DELETE requests are manual and require your explicit scoped decision.\n\n" +
    requests
      .map(
        (r) =>
          "### " +
          r.method +
          " " +
          r.url +
          "\n" +
          r.method +
          " " +
          r.url +
          "\n" +
          Object.entries(r.headers)
            .map(([k, v]) => k + ": " + v)
            .join("\n") +
          (r.body
            ? "\n\n" +
              (typeof r.body === "string"
                ? r.body
                : JSON.stringify(r.body, null, 2))
            : "") +
          "\n",
      )
      .join("\n"),
);
fs.writeFileSync(
  "examples/requests.json",
  JSON.stringify(requests, null, 2) + "\n",
);
fs.writeFileSync(
  "examples/calendar.js",
  `// Illustrative direct API request; credentials stay in caller-owned memory.\nexport async function createEvent({calendarBase,instance,token,calendar,creator,date}) {\n  const response = await fetch(calendarBase + '/api/v1/events', {\n    method: 'POST', headers: {instance, 'x-auth-token':token, 'content-type':'application/json'},\n    body: JSON.stringify({calendar,creator,title:'New Client Consultation',startsAt:date.start,endsAt:date.end,status:'confirmed',style:'event',allDay:false})\n  });\n  const data=await response.json();\n  if(!response.ok||data.success===false)throw Error('Event request failed');\n  return data;\n}\n`,
);
fs.writeFileSync(
  "examples/calendar.curl",
  `# Use your own in-memory/environment token; do not commit credentials.\ncurl --request GET "$CALENDAR_API_URL/api/v1/calendars/access/u/$FERA_USER_UUID/v/15" \\\n  --header "instance: $INSTANCE_UUID" \\\n  --header "x-auth-token: $FERA_AUTH_TOKEN"\n`,
);
fs.writeFileSync(
  "examples/caldav.curl",
  `# curl prompts for password; it is never embedded in the URL or example.\ncurl --request PROPFIND "$CALDAV_API_URL/caldav/instance/$INSTANCE_UUID/" \\\n  --user "$CALDAV_USERNAME" --header 'Depth: 1' --header 'Content-Type: application/xml' \\\n  --data-binary '<d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>'\n\n# Conditional edit: use the ETag captured from GET.\ncurl --request PUT "$CALDAV_API_URL/caldav/calendars/$CALENDAR_UUID/$EVENT_UUID.ics" \\\n  --user "$CALDAV_USERNAME" --header "If-Match: $CAPTURED_ETAG" \\\n  --header 'Content-Type: text/calendar' --data-binary '@event.ics'\n`,
);
fs.writeFileSync("examples/event.ics", sampleICS(uuid, sample.event));
for (const [name, xml] of Object.entries(xmlExamples))
  fs.writeFileSync(
    "examples/" + name + ".xml",
    typeof xml === "function"
      ? xml("/caldav/calendars/" + uuid + "/" + uuid + ".ics")
      : xml,
  );
console.log(
  "Generated public REST and CalDAV .http, JavaScript, cURL, XML and ICS examples",
);
