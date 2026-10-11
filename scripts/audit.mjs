import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
const sources = {
  rest:
    process.env.CALENDAR_SOURCE ||
    path.resolve(root, "../tmp/calendar-api-contract"),
  caldav:
    process.env.CALDAV_SOURCE ||
    path.resolve(root, "../tmp/calendar-caldav-contract"),
};
const fieldSets = {
  calendars: ["uuid", "owner", "person", "key", "name", "shared"],
  share: [
    "owner",
    "calendar",
    "named",
    "person",
    "key",
    "role",
    "inviter",
    "inviterKey",
  ],
  unshare: ["owner", "calendar", "named", "person", "key"],
  people: [
    "owner",
    "key",
    "firstName",
    "lastName",
    "displayName",
    "email",
    "phone",
    "user",
  ],
  resources: ["owner", "uuid", "key", "displayName", "email"],
  events: [
    "uuid",
    "owner",
    "calendar",
    "name",
    "person",
    "key",
    "status",
    "style",
    "title",
    "description",
    "location",
    "startsAt",
    "endsAt",
    "allDay",
    "recurrence",
    "creator",
    "creatorKey",
  ],
  invite: [
    "owner",
    "event",
    "person",
    "resource",
    "key",
    "invitedBy",
    "invitedByKey",
    "status",
    "role",
    "mark",
    "respondedAt",
  ],
};
function humanSummary(service, method, route, group) {
  if (route.startsWith("/health"))
    return (
      "Service " +
      (route.endsWith("/live")
        ? "liveness"
        : route.endsWith("/ready")
          ? "readiness"
          : "health")
    );
  if (service === "caldav")
    return {
      OPTIONS: "Discover protocol capabilities",
      HEAD: "Inspect collection metadata",
      PROPFIND: "Discover principal and calendar properties",
      REPORT: "Query, multiget or synchronize calendar data",
      GET: "Read iCalendar event resource",
      PUT: "Create or conditionally update iCalendar event",
      DELETE: "Conditionally delete iCalendar event",
    }[method];
  const noun =
    {
      calendars: "calendar",
      people: "person",
      resources: "resource",
      events: "event",
    }[group] || "lifecycle command";
  if (route.endsWith("/share"))
    return "Share calendar or change membership role";
  if (route.endsWith("/unshare")) return "Remove calendar sharing";
  if (route.endsWith("/invite")) return "Create or update event participation";
  if (method === "POST") return "Create or update " + noun;
  if (method === "DELETE")
    return (
      "Delete " +
      noun +
      (route.includes("/i/") ? " by UUID" : " by owner-scoped key")
    );
  if (route.includes("/access/"))
    return "List calendars accessible to a FerAuth user";
  if (route.includes("/resolve/"))
    return route.includes("/u/")
      ? "Resolve effective user access"
      : "Resolve calendar owner context";
  if (route.includes("/available/")) return "Find available " + group;
  if (route.includes("/history/")) return "Browse older calendar events";
  if (route.includes("/s/"))
    return "Query overlapping events in a half-open date range";
  if (route.includes("/i/")) return "Retrieve " + noun + " by UUID";
  if (route.includes("/o/k/"))
    return "Retrieve " + group + " by owner-scoped person/resource key";
  return "List owner " + group;
}
const ops = [],
  aliases = [],
  evidence = {},
  expectedRegistrations = new Map();
const read = (p) => fs.readFileSync(p, "utf8");
for (const service of ["rest", "caldav"]) {
  const file = path.join(
    root,
    "docs/contracts",
    service === "rest" ? "calendar.openapi.json" : "caldav.openapi.json",
  );
  const contract = JSON.parse(read(file));
  const source = sources[service],
    online = fs.existsSync(source);
  if (online) {
    const current = read(path.join(source, "openapi/openapi.json"));
    if (current !== read(file))
      throw Error(service + " source contract changed; refresh and re-audit");
  }
  const prior = fs.existsSync(path.join(root, "docs/inventory.json"))
    ? JSON.parse(read(path.join(root, "docs/inventory.json"))).evidence?.[
        service
      ]
    : null;
  evidence[service] = {
    commit: online
      ? execFileSync("git", ["rev-parse", "HEAD"], { cwd: source })
          .toString()
          .trim()
      : prior?.commit || null,
    contractSha256: crypto
      .createHash("sha256")
      .update(read(file))
      .digest("hex"),
    sourceReconciled: online || prior?.sourceReconciled || false,
  };
  for (const [route, methods] of Object.entries(contract.paths))
    for (const [key, o] of Object.entries(methods)) {
      if (!o?.operationId) continue;
      if (o.deprecated) {
        aliases.push({ service, route, method: key.toUpperCase() });
        continue;
      }
      const method = key.replace("x-webdav-", "").toUpperCase(),
        internal = route.includes("/internal/"),
        health = route.startsWith("/health");
      const sourceRef = o["x-feradel-source"];
      if (online && !health) {
        const file = read(path.join(source, sourceRef.route));
        let expressPath = o["x-express-path"];
        if (internal) expressPath = route.replace("/api/v1/internal", "");
        else if (service === "rest")
          expressPath =
            route
              .replace(/^\/api\/v1\/(calendars|people|resources|events)/, "")
              .replace(/\{([^}]+)\}/g, ":$1") || "/";
        {
          const registration = `router.${method.toLowerCase()}("${expressPath}"`;
          if (!file.includes(registration))
            throw Error(`Source mismatch ${method} ${route}: ${registration}`);
          if (!file.includes(sourceRef.handler))
            throw Error("Missing source handler " + sourceRef.handler);
          const key = service + ":" + sourceRef.route;
          const set = expectedRegistrations.get(key) || new Set();
          set.add(method.toLowerCase() + ":" + expressPath);
          expectedRegistrations.set(key, set);
        }
      }
      const group = health
        ? "health"
        : service === "caldav"
          ? "CalDAV"
          : internal
            ? "Lifecycle"
            : route.split("/")[3];
      const kind = route.endsWith("/share")
        ? "share"
        : route.endsWith("/unshare")
          ? "unshare"
          : route.endsWith("/invite")
            ? "invite"
            : group;
      const properties = Object.fromEntries(
        (fieldSets[kind] || []).map((f) => [
          f,
          { type: ["shared", "allDay"].includes(f) ? "boolean" : "string" },
        ]),
      );
      if (properties.status)
        properties.status.enum =
          group === "events" && !route.endsWith("invite")
            ? ["tentative", "confirmed", "cancelled"]
            : undefined;
      if (properties.style)
        properties.style.enum = [
          "event",
          "todo",
          "journal",
          "block",
          "alarm",
          "holiday",
        ];
      if (properties.role)
        properties.role.enum =
          kind === "invite"
            ? ["org", "req", "opt", "non"]
            : ["admin", "editor", "viewer"];
      if (kind === "invite") {
        properties.status.enum = [
          "invited",
          "accepted",
          "declined",
          "tentative",
        ];
        properties.mark.enum = ["free", "busy", "tentative", "oof"];
      }
      const required =
        kind === "calendars"
          ? ["name"]
          : kind === "people"
            ? ["key", "email"]
            : kind === "resources"
              ? ["key", "displayName"]
              : kind === "events"
                ? ["startsAt", "endsAt"]
                : kind === "share"
                  ? ["calendar", "person", "inviter", "role"]
                  : kind === "invite"
                    ? ["event"]
                    : [];
      const parameters = (o.parameters || [])
        .filter((p) => p.in === "path" || p.in === "query")
        .map((p) => ({
          ...p,
          schema:
            p.name === "path"
              ? {
                  type: "string",
                  description:
                    "Safe descendant segments; event resources require UUID.ics",
                }
              : p.schema,
        }));
      if (service === "rest" && group === "events" && method === "GET")
        for (const name of [
          "history",
          "limit",
          "offset",
          "before",
          "uuid",
          "uuids",
        ])
          parameters.push({
            name,
            in: "query",
            required: false,
            schema: {
              type: ["limit", "offset"].includes(name) ? "integer" : "string",
            },
            description:
              "Source-supported event query; limit/offset/before apply in history mode.",
          });
      const permission =
        service === "caldav"
          ? "Basic principal + calendar read/write capability"
          : health
            ? "Public health"
            : internal
              ? "Privileged lifecycle HMAC"
              : route.includes("/resolve/")
                ? "JWT/product; source omits named permission checks"
                : `${method === "GET" ? "VIEW" : "EDIT"}.${{ calendars: "CALENDAR", people: "PERSON", resources: "RESOURCE", events: "EVENT" }[group]}`;
      ops.push({
        id: o.operationId,
        service,
        method,
        route,
        group,
        internal,
        health,
        supplemental: health && route != "/health",
        auth: health
          ? "none"
          : service === "caldav" && method === "OPTIONS"
            ? "none (app-level capability responder)"
            : service === "caldav"
              ? "HTTP Basic"
              : internal
                ? "Privileged HMAC"
                : "x-auth-token + instance",
        permission,
        summary: humanSummary(service, method, route, group),
        sourceSummary: o.summary || null,
        description: o.description || "",
        parameters,
        schema:
          method === "POST" && !internal
            ? {
                type: "object",
                required,
                properties,
                additionalProperties: false,
              }
            : null,
        conditions:
          kind === "events"
            ? [
                "A calendar UUID or resolvable name is required.",
                "A creator UUID or creatorKey is required.",
                "Demo updates require a UUID created in this session.",
              ]
            : kind === "invite"
              ? [
                  "Supply person, resource or an owner-scoped key.",
                  "Resource associations persist status and mark; role/respondedAt are attendee-only.",
                ]
              : kind === "share"
                ? [
                    "An authorized inviter must own the calendar or hold owner/admin/editor membership.",
                  ]
                : [],
        source: sourceRef || {
          route: "support/active-active.js",
          handler: "health",
        },
        responses: Object.keys(o.responses || {}),
        example: o.requestBody?.content?.["application/json"]?.example || {},
      });
    }
}
for (const [key, expected] of expectedRegistrations) {
  const split = key.indexOf(":");
  const service = key.slice(0, split),
    file = key.slice(split + 1);
  const actual = new Set(
    [
      ...read(path.join(sources[service], file)).matchAll(
        /router\.(get|post|put|delete|head|options|propfind|report)\(\s*"([^"]+)"/g,
      ),
    ].map((m) => m[1] + ":" + m[2]),
  );
  if (
    actual.size !== expected.size ||
    [...actual].some((x) => !expected.has(x))
  )
    throw Error("Undocumented/missing source registration in " + file);
}
const count = (f) => ops.filter(f).length;
if (
  count((o) => o.service === "rest" && !o.health && !o.internal) !== 30 ||
  count((o) => o.internal) !== 4 ||
  aliases.length !== 34 ||
  count((o) => o.service === "caldav" && !o.supplemental) !== 30
)
  throw Error("Coverage count changed");
const result = {
  restPublic: 30,
  restInternal: 4,
  deprecatedAliases: 34,
  caldavRegistrations: 30,
  supplementalHealth: 4,
  evidence,
};
if (process.argv.includes("--check")) {
  if (
    JSON.stringify(
      JSON.parse(read(path.join(root, "shared/operations.json"))),
    ) !== JSON.stringify(ops)
  )
    throw Error("Registry differs from audited contracts");
} else
  fs.writeFileSync(
    path.join(root, "shared/operations.json"),
    JSON.stringify(ops, null, 2) + "\n",
  );
fs.writeFileSync(
  path.join(root, "docs/coverage.md"),
  "# Audited operation coverage\n\n30 public REST operations, 4 documented lifecycle operations (no executable controls), 34 deprecated aliases excluded, 30 CalDAV registrations, and 4 supplemental liveness/readiness registrations. Implemented means executable support, not live qualification.\n\n" +
    Object.entries(evidence)
      .map(
        ([k, v]) =>
          `${k}: source commit ${v.commit}; contract SHA256 ${v.contractSha256}; source reconciled ${v.sourceReconciled}.`,
      )
      .join("\n\n") +
    "\n\n| Service | Method | Route | Auth | Source |\n|---|---|---|---|---|\n" +
    ops
      .map(
        (o) =>
          `| ${o.service} | ${o.method} | ${o.route} | ${o.auth} | ${o.source.route} |`,
      )
      .join("\n") +
    "\n",
);
fs.writeFileSync(
  path.join(root, "docs/inventory.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
