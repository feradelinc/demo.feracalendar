const string = { type: "string" };
const dateTime = { ...string, format: "date-time" };
const nullableDate = { ...dateTime, type: ["string", "null"] };
const uuid = { ...string, format: "uuid" };
const boolean = { type: "boolean" };
const title = (maxLength) => ({ ...string, maxLength });
const integer = (minimum, maximum) => ({ type: "integer", minimum, maximum });
const taskFields = { title: title(200), notes: title(4000), dueAt: nullableDate };
const slots = { type: "array", minItems: 1, maxItems: 48, items: dateTime };
const bookingFields = { title: title(120), duration: integer(5, 240), slots };
const schema = (properties, required = []) => ({ type: "object", properties, required });
const dateExample = "2030-06-15T14:00:00Z";

const definitions = [
  ["capabilities", "GET", "capabilities", "Get plan capabilities and editable calendars"],
  ["tasks-list", "GET", "tasks", "List your tasks"],
  ["tasks-create", "POST", "tasks", "Create a task",
    schema(taskFields, ["title"]), { title: "Prepare agenda" }, { created: true }],
  ["tasks-update", "PATCH", "tasks/{uuid}", "Update or complete a task",
    schema({ ...taskFields, completed: boolean }), { completed: true }],
  ["tasks-delete", "DELETE", "tasks/{uuid}", "Delete a task and its reminders"],
  ["reminders-list", "GET", "reminders", "List undismissed reminders",
    null, null, { dueFilter: true }],
  ["reminders-create", "POST", "reminders", "Create a reminder",
    schema({ title: title(200), dueAt: dateTime, taskUuid: uuid }, ["dueAt"]),
    { title: "Prepare meeting", dueAt: dateExample }, { created: true, missing: true, conflict: true,
      conditions: ["Use a future instant with a UTC offset. Supply a title or link an incomplete task."] }],
  ["reminders-dismiss", "POST", "reminders/{uuid}/dismiss", "Dismiss a reminder"],
  ["booking-pages-list", "GET", "booking-pages", "List booking pages for editable calendars"],
  ["booking-pages-create", "POST", "booking-pages", "Create a booking page",
    schema({ calendarUuid: uuid, ...bookingFields }, ["calendarUuid", "title", "duration", "slots"]),
    { calendarUuid: "", title: "Intro call", duration: 30, slots: [dateExample] }, { created: true, missing: true,
      conditions: ["Choose a calendar you can edit. Times must fall within the next 90 days and may not overlap."] }],
  ["booking-pages-update", "PATCH", "booking-pages/{uuid}", "Update or publish a booking page",
    schema({ ...bookingFields, published: boolean }), { published: true },
    { conditions: ["Send replacement slots when changing the duration."] }],
  ["booking-pages-reservations", "GET", "booking-pages/{uuid}/reservations", "List reservations for a booking page"],
  ["automation-rules-list", "GET", "automation-rules", "List your automation rules"],
  ["automation-rules-create", "POST", "automation-rules", "Create an automation rule",
    schema({ calendarUuid: uuid, title: title(120), minutesBefore: integer(0, 10080),
      trigger: { ...string, enum: ["event.created", "booking.created"] } },
    ["calendarUuid", "title", "minutesBefore", "trigger"]),
    { calendarUuid: "", title: "Upcoming meeting", minutesBefore: 15, trigger: "event.created" }, { created: true, missing: true }],
  ["automation-rules-update", "PATCH", "automation-rules/{uuid}", "Enable or disable an automation rule",
    schema({ enabled: boolean }, ["enabled"]), { enabled: false }],
  ["automation-rules-delete", "DELETE", "automation-rules/{uuid}", "Delete an automation rule"],
  ["booking-read", "GET", "booking/{slug}", "Read a published booking page",
    null, null, { public: true }],
  ["booking-reserve", "POST", "booking/{slug}/reservations", "Reserve an available time",
    schema({ startsAt: dateTime, name: title(120), email: { ...title(254), format: "email" }, requestId: uuid },
      ["startsAt", "name", "email", "requestId"]),
    { startsAt: dateExample, name: "Guest name", email: "guest@example.test", requestId: "" },
    { public: true, conflict: true, conditions: ["Generate one request UUID for the booking. Reuse it only when retrying the same time, name and email."] }],
];

export const retailOperations = definitions.map(([id, method, path, summary, body = null, example = null, options = {}]) => {
  const collection = path.split("/")[0];
  const permission = options.public ? "Published booking link" :
    collection === "booking-pages" ? "Starter or higher · calendar edit access" :
    collection === "automation-rules" ? "Complete or Beyond · rule owner for edits" : "Active FeraCal workspace membership";
  const parameters = Array.from(path.matchAll(/\{(\w+)\}/g), ([, name]) => ({
    name, in: "path", required: true, schema: name === "uuid" ? uuid : { ...string, pattern: "^[A-Za-z0-9_-]{32}$" },
  }));
  if (options.dueFilter) parameters.push({
    name: "due", in: "query", required: false, schema: { ...string, enum: ["true"] },
    description: "Use true to return only reminders currently due.",
  });
  return {
    id: "retail-" + id, service: "rest", method, route: "/api/v1/retail/" + path,
    group: "scheduling", retail: true, internal: false, health: false, supplemental: false,
    auth: options.public ? "none" : "x-auth-token + instance",
    permission, summary, parameters, schema: body, conditions: options.conditions || [],
    source: { route: "routes/api/v1/retail.js", handler: "send" },
    responses: [options.created ? "201" : "200", ...(options.public ? [] : ["401", "403"]),
      ...(path.includes("{") || options.missing ? ["404"] : []), ...(options.conflict ? ["409"] : []),
      ...(body ? ["422"] : []), "503"],
    example: example || {},
  };
});

const patterns = retailOperations.map((operation) => {
  const parts = operation.route.split("/").map(segment =>
    segment === "{uuid}" ? "[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}" :
    segment === "{slug}" ? "[A-Za-z0-9_-]{32}" : segment);
  return [operation, new RegExp("^" + parts.join("/") + "$")];
});
export function findRetailOperation(method, route) {
  return patterns.find(([operation, matcher]) => operation.method === method && matcher.test(route))?.[0];
}
