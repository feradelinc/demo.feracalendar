import express from "express";
import crypto from "node:crypto";
import operations from "../shared/operations.json" with { type: "json" };
import { redact, routeFor, uuidPattern } from "../shared/data.js";
import { parseXML, validateICS, normalizeICS } from "../shared/protocol.js";
const fail = (message, status = 400) =>
  Object.assign(Error(message), { status });
export function safeBase(value) {
  const u = new URL(value);
  if (/matters/i.test(u.hostname) || u.port === "11303")
    throw fail("Matters API is outside the Studio operating boundary", 403);
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/" ||
    !["http:", "https:"].includes(u.protocol)
  )
    throw fail("Invalid service base");
  if (
    u.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
  )
    throw fail("Remote services require HTTPS");
  return u.origin;
}
export function createApp({ config, fetchImpl = fetch, now = Date.now } = {}) {
  config ||= {
    auth: process.env.AUTH_API_URL || "http://localhost:10443",
    calendar: process.env.CALENDAR_API_URL || "http://localhost:11400",
    caldav: process.env.CALDAV_API_URL || "http://localhost:11410",
    instance: process.env.INSTANCE_UUID || "",
    email: process.env.DEMO_EMAIL || "",
    allowed: (process.env.ALLOWED_API_URLS || "").split(",").filter(Boolean),
  };
  const approved = new Set((config.allowed || []).map(safeBase));
  const bases = {};
  for (const service of ["auth", "calendar", "caldav"]) {
    bases[service] = safeBase(config[service]);
    if (
      !["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(bases[service]).hostname,
      ) &&
      !approved.has(bases[service])
    )
      throw fail(
        "Remote " + service + " base requires explicit ALLOWED_API_URLS entry",
      );
  }
  if (new Set(Object.values(bases)).size !== 3)
    throw fail(
      "Auth, Calendar and CalDAV must be distinct service destinations",
    );
  const sessions = new Map(),
    app = express();
  app.disable("x-powered-by");
  const lifetime = 60 * 60 * 1000;
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    });
    if (req.path.startsWith("/demo/")) {
      const host = req.headers.host || "";
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))
        return res
          .status(403)
          .json({ message: "Access through loopback only" });
      if (
        req.headers.origin &&
        req.headers.origin !== `${req.protocol}://${host}`
      )
        return res.status(403).json({ message: "Cross-origin request denied" });
      if (req.headers["sec-fetch-site"] === "cross-site")
        return res.status(403).json({ message: "Cross-site request denied" });
      if (req.method !== "GET" && req.headers["x-demo-request"] !== "1")
        return res
          .status(403)
          .json({ message: "Missing same-origin request protection" });
    }
    const id = /(?:^|;\s*)feracal_session=([^;]+)/.exec(
      req.headers.cookie || "",
    )?.[1];
    let s = sessions.get(id);
    if (s && (s.deadline <= now() || s.last + lifetime <= now())) {
      sessions.delete(id);
      s = null;
    }
    if (s && s.rest?.expires <= now()) s.rest = null;
    if (s) s.last = now();
    req.session = s;
    req.sessionId = id;
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  function establish(req, res) {
    if (req.session) return req.session;
    const id = crypto.randomBytes(32).toString("hex");
    const s = {
      last: now(),
      deadline: now() + lifetime,
      prefix: "northstar-" + crypto.randomBytes(6).toString("hex"),
      records: [],
      rest: null,
      dav: null,
    };
    sessions.set(id, s);
    req.session = s;
    req.sessionId = id;
    res.cookie("feracal_session", id, {
      httpOnly: true,
      sameSite: "strict",
      secure: req.secure,
      path: "/",
      maxAge: lifetime,
    });
    return s;
  }
  const status = (s) => ({
    authenticated: !!s?.rest,
    caldavConnected: !!s?.dav,
    expires: s?.rest?.expires || s?.deadline || null,
    instance: s?.rest?.instance || s?.dav?.instance || null,
    user: s?.rest?.user || null,
    prefix: s?.prefix || null,
    created: s?.records || [],
  });
  app.get("/demo/config", (_, res) =>
    res.json({
      ...bases,
      instance: config.instance,
      email: config.email,
      mode: "live",
      apiKeySupported: true,
    }),
  );
  app.get("/demo/session", (req, res) => res.json(status(req.session)));
  app.post("/demo/token", (req, res) =>
    req.session?.rest
      ? res.json({ token: req.session.rest.token })
      : res.status(401).json({ message: "Not authenticated" }),
  );
  app.post("/demo/logout", (req, res) => {
    sessions.delete(req.sessionId);
    res.clearCookie("feracal_session");
    res.json({ success: true });
  });
  app.post("/demo/caldav/disconnect", (req, res) => {
    if (req.session) req.session.dav = null;
    res.json(status(req.session));
  });
  async function transmit(
    service,
    route,
    method,
    headers = {},
    body,
    credentials = [],
  ) {
    credentials = [
      ...credentials,
      headers.authorization,
      headers["x-auth-token"],
    ].filter(Boolean);
    const started = performance.now();
    const outgoing = { ...headers };
    let encoded;
    if (body !== undefined) {
      encoded = typeof body === "string" ? body : JSON.stringify(body);
      if (Buffer.byteLength(encoded) > 2 * 1024 * 1024)
        throw fail("Request exceeds 2 MiB", 413);
    }
    const upstream = await fetchImpl(bases[service] + route, {
      method,
      headers: outgoing,
      body: encoded,
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    let total = 0,
      chunks = [];
    for await (const chunk of upstream.body || []) {
      total += chunk.length;
      if (total > 8 * 1024 * 1024) throw fail("Response exceeds 8 MiB", 413);
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    let data = raw;
    try {
      if (upstream.headers.get("content-type")?.includes("json"))
        data = JSON.parse(raw);
    } catch {}
    return {
      request: {
        method,
        url: bases[service] + route,
        headers: redact(outgoing, credentials),
        ...(body !== undefined ? { body: redact(body, credentials) } : {}),
      },
      status: upstream.status,
      headers: redact(Object.fromEntries(upstream.headers), credentials),
      contentType: upstream.headers.get("content-type") || "",
      elapsedMs: Math.round(performance.now() - started),
      data: redact(data, credentials),
      _raw: data,
    };
  }
  const clean = (r) => {
    delete r._raw;
    return r;
  };
  app.post("/demo/login", async (req, res, next) => {
    try {
      const { instance, email, password, apiKey } = req.body;
      if (!uuidPattern.test(instance || ""))
        throw fail("A valid instance UUID is required");
      if (!apiKey && (!email || !password))
        throw fail("Email and password required");
      for (const key of ["auth", "calendar", "caldav"])
        if (req.body[key] && safeBase(req.body[key]) !== bases[key])
          throw fail("Service destination cannot be overridden", 403);
      const result = await transmit(
        "auth",
        "/api/v1/auth",
        "POST",
        {
          instance,
          "content-type": "application/json",
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        apiKey ? {} : { email, password },
        [password, apiKey],
      );
      if (
        result.status >= 200 &&
        result.status < 300 &&
        typeof result._raw?.token === "string"
      ) {
        let payload;
        try {
          payload = JSON.parse(
            Buffer.from(result._raw.token.split(".")[1], "base64url"),
          );
        } catch {
          throw fail("Authentication returned a malformed JWT", 502);
        }
        if (
          !Number.isFinite(payload.exp) ||
          payload.exp * 1000 <= now() ||
          !uuidPattern.test(payload.user || "")
        )
          throw fail("Authentication token expired or missing identity", 401);
        sessions.delete(req.sessionId);
        req.session = null;
        const s = establish(req, res);
        s.rest = {
          token: result._raw.token,
          expires: Math.min(payload.exp * 1000, s.deadline),
          instance,
          user: payload.user,
        };
        result.session = status(s);
      }
      res.json(clean(result));
    } catch (e) {
      next(e);
    }
  });
  app.post("/demo/caldav/connect", async (req, res, next) => {
    try {
      const { username, password, instance } = req.body;
      if (
        !username ||
        !password ||
        username.includes(":") ||
        !uuidPattern.test(instance || "")
      )
        throw fail("CalDAV username, password and instance UUID required");
      if (req.session?.rest && instance !== req.session.rest.instance)
        throw fail("CalDAV instance must match REST session", 403);
      const result = await transmit(
        "caldav",
        `/caldav/instance/${instance}`,
        "PROPFIND",
        {
          authorization:
            "Basic " +
            Buffer.from(username + ":" + password).toString("base64"),
          depth: "0",
          "content-type": "application/xml",
        },
        '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>',
        [username, password],
      );
      if (result.status === 207) {
        const s = establish(req, res);
        s.dav = { username, password, instance };
        result.session = status(s);
      }
      res.json(clean(result));
    } catch (e) {
      next(e);
    }
  });
  const has = (s, group, uuid) =>
    s.records.some((r) => r.group === group && r.uuid === uuid);
  const restHeaders = (s) => ({
    instance: s.rest.instance,
    "x-auth-token": s.rest.token,
    accept: "application/json",
    "content-type": "application/json",
  });
  async function calendarOwned(s, uuid) {
    if (!uuidPattern.test(uuid || "")) throw fail("Calendar UUID required");
    const r = await transmit(
      "calendar",
      `/api/v1/calendars/i/${uuid}`,
      "GET",
      restHeaders(s),
      undefined,
      [s.rest.token],
    );
    if (
      r.status !== 200 ||
      !r._raw?.success ||
      r._raw.ownerUuid !== s.rest.instance
    )
      throw fail("Calendar is outside the authorized owner partition", 403);
    return r._raw;
  }
  async function eventOwned(s, uuid) {
    const r = await transmit(
      "calendar",
      `/api/v1/events/i/${uuid}`,
      "GET",
      restHeaders(s),
      undefined,
      [s.rest.token],
    );
    const item = r._raw?.items?.find((e) => e.uuid === uuid);
    if (!item) throw fail("Event not found", 404);
    await calendarOwned(s, item.calendar?.uuid || item.calendarUuid);
    return item;
  }
  function validateBody(op, body, s) {
    if (!body || Array.isArray(body) || typeof body !== "object")
      throw fail("JSON object required");
    if ("force" in body) throw fail("Privileged force is prohibited", 403);
    if ("owner" in body && (body.owner?.uuid ?? body.owner) !== s.rest.instance)
      throw fail("Owner must match authorized session owner", 403);
    for (const key of Object.keys(body))
      if (!op.schema.properties[key])
        throw fail("Unsupported body field " + key);
    for (const key of op.schema.required)
      if (body[key] === undefined || body[key] === "")
        throw fail("Required body field " + key);
    for (const [key, schema] of Object.entries(op.schema.properties)) {
      if (body[key] === undefined || body[key] === null) continue;
      if (schema.type === "boolean" && typeof body[key] !== "boolean")
        throw fail(key + " must be boolean");
      if (schema.enum && !schema.enum.includes(body[key]))
        throw fail("Unsupported " + key);
    }
    for (const key of [
      "uuid",
      "calendar",
      "person",
      "resource",
      "creator",
      "inviter",
      "invitedBy",
      "user",
    ])
      if (body[key] && !uuidPattern.test(body[key]?.uuid ?? body[key]))
        throw fail(key + " must be a UUID");
    if (op.group === "events" && !op.route.endsWith("invite")) {
      if (!body.calendar) throw fail("Demo requires explicit calendar UUID");
      if (!body.creator && !body.creatorKey)
        throw fail("Creator or creatorKey required");
      if (
        !Number.isFinite(Date.parse(body.startsAt)) ||
        !Number.isFinite(Date.parse(body.endsAt)) ||
        Date.parse(body.endsAt) <= Date.parse(body.startsAt)
      )
        throw fail("Valid start/end instants with end after start required");
    }
  }
  app.post("/demo/execute", async (req, res, next) => {
    try {
      const {
        operationId,
        params = {},
        query = {},
        body,
        headers = {},
        confirmation,
      } = req.body;
      const op = operations.find((o) => o.id === operationId && !o.internal);
      if (!op) throw fail("Operation is not public/allowlisted", 403);
      if (req.body.url || req.body.method || req.body.base)
        throw fail("Destination and method are registry controlled", 403);
      let route;
      try {
        route = routeFor(op, params, query);
      } catch (e) {
        throw fail(e.message);
      }
      const s = req.session;
      if (op.method === "DELETE" || op.route.endsWith("/unshare")) {
        const target = op.route.includes("{uuid}")
          ? params.uuid
          : op.route.includes("{key}")
            ? params.key
            : op.route.includes("{path}")
              ? params.path
              : body?.calendar;
        if (!target || confirmation !== target)
          throw fail("Confirm the exact target UUID/key", 409);
      }
      if (op.health) {
        return res.json(
          clean(
            await transmit(
              op.service === "rest" ? "calendar" : "caldav",
              route,
              op.method,
            ),
          ),
        );
      }
      if (op.service === "rest") {
        if (!s?.rest) throw fail("Sign in to establish REST session", 401);
        if (op.method === "POST") {
          validateBody(op, body, s);
          const isSpecial = /\/(share|unshare|invite)$/.test(op.route);
          if (!isSpecial && body.uuid && !has(s, op.group, body.uuid))
            throw fail(
              "Updates are limited to records created by this demo session",
              403,
            );
          if (
            ["people", "resources"].includes(op.group) &&
            !body.uuid &&
            !s.records.some(
              (r) => r.group === op.group && r.key === body.key,
            ) &&
            !String(body.key).startsWith(s.prefix + "-")
          )
            throw fail(
              "New lookup keys must use this session prefix " + s.prefix + "-",
              403,
            );
          if (
            op.group === "calendars" &&
            !isSpecial &&
            !body.uuid &&
            !String(body.name).includes(s.prefix)
          )
            throw fail(
              "New calendar names must include the session prefix",
              403,
            );
          const calendar = body.calendar;
          if (calendar) {
            if (!has(s, "calendars", calendar))
              throw fail("Mutation requires a demo-created calendar", 403);
            await calendarOwned(s, calendar);
          }
          if (body.event) {
            if (!has(s, "events", body.event))
              throw fail("Invitation requires a demo-created event", 403);
            await eventOwned(s, body.event);
          }
          for (const field of ["person", "creator", "inviter", "invitedBy"])
            if (body[field] && !has(s, "people", body[field]))
              throw fail("Actor must be a demo-created Calendar Person", 403);
          if (body.resource && !has(s, "resources", body.resource))
            throw fail("Resource must be demo-created", 403);
          for (const field of [
            "key",
            "inviterKey",
            "creatorKey",
            "invitedByKey",
          ])
            if (isSpecial || op.group === "events") {
              if (body[field] && !s.records.some((r) => r.key === body[field]))
                throw fail("Association key must be demo-created", 403);
            }
          if (op.group === "events" && body.uuid)
            await eventOwned(s, body.uuid);
        }
        if (op.method === "DELETE") {
          const target = s.records.find(
            (r) =>
              r.group === op.group &&
              (r.uuid === params.uuid || r.key === params.key),
          );
          if (!target)
            throw fail(
              "Deletion is limited to records created in this session",
              403,
            );
        }
        if (op.group === "calendars" && params.uuid)
          await calendarOwned(s, params.uuid);
        if (op.group === "events" && params.calendar)
          await calendarOwned(s, params.calendar);
        if (op.group === "events" && params.uuid)
          await eventOwned(s, params.uuid);
        const result = await transmit(
          "calendar",
          route,
          op.method,
          restHeaders(s),
          op.method === "POST" ? body : undefined,
          [s.rest.token],
        );
        if (
          op.group === "events" &&
          op.method === "GET" &&
          Array.isArray(result._raw?.items)
        ) {
          for (const item of result._raw.items)
            await calendarOwned(s, item.calendar?.uuid || item.calendarUuid);
        }
        if (
          op.method === "POST" &&
          result.status === 200 &&
          result._raw?.success !== false &&
          uuidPattern.test(result._raw?.uuid || "") &&
          !/\/(share|unshare|invite)$/.test(op.route) &&
          !has(s, op.group, result._raw.uuid)
        )
          s.records.push({
            group: op.group,
            uuid: result._raw.uuid,
            key: body.key || null,
            name: body.name || body.title || body.displayName || null,
          });
        if (
          op.method === "DELETE" &&
          result.status === 200 &&
          result._raw?.success
        )
          s.records = s.records.filter(
            (r) =>
              !(
                r.group === op.group &&
                (r.uuid === params.uuid || r.key === params.key)
              ),
          );
        res.json(clean(result));
      } else {
        if (op.method !== "OPTIONS" && !s?.dav)
          throw fail("Connect separate CalDAV credentials", 401);
        if (
          op.method !== "OPTIONS" &&
          params.instance &&
          params.instance !== s?.dav?.instance
        )
          throw fail(
            "CalDAV instance must match connected principal context",
            403,
          );
        if (params.calendarUuid && s?.rest)
          await calendarOwned(s, params.calendarUuid);
        const outgoing = {};
        for (const [key, value] of Object.entries(headers)) {
          const k = key.toLowerCase();
          if (!["depth", "if-match"].includes(k))
            throw fail("Unsupported protocol header " + key, 403);
          if (typeof value !== "string" || /[\r\n]/.test(value))
            throw fail("Invalid protocol header");
          if (k === "depth" && !["0", "1", "infinity"].includes(value))
            throw fail("Depth must be 0, 1 or infinity");
          outgoing[k] = value;
        }
        let input = body;
        if (["PROPFIND", "REPORT"].includes(op.method)) {
          try {
            parseXML(input || "");
          } catch (e) {
            throw fail(e.message);
          }
          outgoing["content-type"] = "application/xml";
        }
        if (["PUT", "DELETE"].includes(op.method)) {
          if (!s?.rest || !has(s, "calendars", params.calendarUuid))
            throw fail(
              "CalDAV mutations require a REST demo-created calendar",
              403,
            );
          const eventUuid = params.path.slice(0, -4);
          if (
            op.method === "DELETE" &&
            !has(s, "davEvents", eventUuid) &&
            !has(s, "events", eventUuid)
          )
            throw fail("Delete only demo-created ICS resources", 403);
          if (op.method === "PUT") {
            try {
              validateICS(input, params.path);
            } catch (e) {
              throw fail(e.message);
            }
            input = normalizeICS(input);
            outgoing["content-type"] = "text/calendar";
            if (
              !has(s, "davEvents", eventUuid) &&
              !has(s, "events", eventUuid)
            ) {
              const check = await transmit(
                "caldav",
                route,
                "GET",
                {
                  authorization:
                    "Basic " +
                    Buffer.from(s.dav.username + ":" + s.dav.password).toString(
                      "base64",
                    ),
                },
                undefined,
                [s.dav.username, s.dav.password],
              );
              if (check.status !== 404)
                throw fail("New ICS UUID must not already exist", 403);
            } else if (!outgoing["if-match"])
              throw fail("Existing ICS edits require If-Match");
          }
        }
        if (s?.dav)
          outgoing.authorization =
            "Basic " +
            Buffer.from(s.dav.username + ":" + s.dav.password).toString(
              "base64",
            );
        const result = await transmit(
          "caldav",
          route,
          op.method,
          outgoing,
          ["PUT", "REPORT", "PROPFIND"].includes(op.method) ? input : undefined,
          [s?.dav?.username, s?.dav?.password],
        );
        if (
          op.method === "PUT" &&
          result.status === 201 &&
          !has(s, "davEvents", params.path.slice(0, -4))
        )
          s.records.push({
            group: "davEvents",
            uuid: params.path.slice(0, -4),
            calendar: params.calendarUuid,
          });
        res.json(clean(result));
      }
    } catch (e) {
      next(e);
    }
  });
  app.use((e, req, res, _next) => {
    const secrets = [
      req.body?.password,
      req.body?.apiKey,
      req.session?.rest?.token,
      req.session?.dav?.password,
      req.session?.dav?.username,
    ];
    res
      .status(
        e.status ||
          (e.type === "entity.too.large"
            ? 413
            : e instanceof SyntaxError
              ? 400
              : 502),
      )
      .json({
        message: redact(
          e.status
            ? e.message
            : "Upstream request failed. Check service availability and configuration.",
          secrets,
        ),
      });
  });
  const timer = setInterval(() => {
    for (const [id, s] of sessions)
      if (s.deadline <= now() || s.last + lifetime <= now())
        sessions.delete(id);
  }, 60000);
  timer.unref();
  app.locals.close = () => {
    clearInterval(timer);
    sessions.clear();
  };
  return app;
}
