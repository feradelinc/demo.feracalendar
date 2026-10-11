// Explicit isolated upstream fixture. Never imported by runtime server or UI.
import crypto from "node:crypto";
import operations from "../shared/operations.json" with { type: "json" };
import { sampleICS } from "../shared/protocol.js";
export const instance = "11111111-1111-4111-8111-111111111111",
  user = "22222222-2222-4222-8222-222222222222";
export const token = (exp = Math.floor(Date.now() / 1000) + 3600) =>
  "eyJhbGciOiJIUzI1NiJ9." +
  Buffer.from(JSON.stringify({ exp, user })).toString("base64url") +
  ".fixture-signature";
export const config = {
  auth: "http://localhost:11000",
  calendar: "http://localhost:11400",
  caldav: "http://localhost:11410",
  instance,
  allowed: [],
};
export function fixture() {
  const records = {
      people: new Map(),
      resources: new Map(),
      calendars: new Map(),
      events: new Map(),
    },
    dav = new Map(),
    calls = [];
  let loginToken = token();
  const json = (v, status = 200) => Response.json(v, { status });
  const fetchImpl = async (url, opt) => {
    calls.push({ url, ...opt });
    const u = new URL(url),
      route = decodeURIComponent(u.pathname),
      method = opt.method,
      body = opt.body
        ? (() => {
            try {
              return JSON.parse(opt.body);
            } catch {
              return opt.body;
            }
          })()
        : {};
    if (u.port === "11000") {
      if (body.password === "wrong")
        return json(
          { success: false, error: { message: "Invalid credentials" } },
          400,
        );
      return json({ token: loginToken });
    }
    if (route.startsWith("/health"))
      return json({ success: true, service: "fixture" });
    if (u.port === "11410") {
      if (method === "OPTIONS")
        return new Response(null, {
          status: 204,
          headers: {
            dav: "1, 3, calendar-access",
            allow: "OPTIONS, HEAD, PROPFIND, REPORT, GET, PUT, DELETE",
          },
        });
      if (
        opt.headers.authorization !==
        "Basic " + Buffer.from("dav-user:dav-pass").toString("base64")
      )
        return json({ message: "Invalid Basic credentials" }, 401);
      const match = route.match(/\/calendars\/([^/]+)\/([^/]+\.ics)$/),
        id = match?.[2]?.slice(0, -4);
      if (method === "HEAD") return new Response(null, { status: 200 });
      if (["PROPFIND", "REPORT"].includes(method))
        return new Response(
          '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/caldav/calendars/' +
            (match?.[1] || instance) +
            '/</d:href><d:propstat><d:prop><d:displayname>Northstar</d:displayname><d:getetag>"1"</d:getetag><d:sync-token>fixture-sync</d:sync-token></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',
          { status: 207, headers: { "content-type": "application/xml" } },
        );
      const existing = dav.get(id) || records.events.get(id);
      if (method === "GET") {
        if (!existing) return json({ message: "Not found" }, 404);
        return new Response(existing.ics || sampleICS(id, existing), {
          headers: {
            "content-type": "text/calendar",
            etag: existing.etag || '"rest-1"',
          },
        });
      }
      if (method === "PUT") {
        if (
          existing &&
          opt.headers["if-match"] &&
          (existing.etag || '"rest-1"') !== opt.headers["if-match"]
        )
          return json({ message: "ETag does not match" }, 412);
        const etag = '"' + crypto.randomUUID() + '"';
        dav.set(id, { ics: opt.body, etag });
        return new Response(null, {
          status: existing ? 204 : 201,
          headers: { etag },
        });
      }
      if (method === "DELETE") {
        if (!existing) return json({}, 404);
        if (
          opt.headers["if-match"] &&
          (existing.etag || '"rest-1"') !== opt.headers["if-match"]
        )
          return json({}, 412);
        dav.delete(id);
        records.events.delete(id);
        return new Response(null, { status: 204 });
      }
    }
    if (!opt.headers["x-auth-token"]) return json({ msg: "No token" }, 401);
    const group = route.split("/")[3],
      store = records[group];
    if (!store) return json({ message: "Not found" }, 404);
    if (method === "POST") {
      if (route.endsWith("/share"))
        return json({
          uuid: crypto.randomUUID(),
          calendarUuid: body.calendar,
          personUuid: body.person,
          role: body.role,
          invitedByUuid: body.inviter,
          success: true,
        });
      if (route.endsWith("/unshare")) return json({ ...body, success: true });
      if (route.endsWith("/invite")) {
        const e = records.events.get(body.event);
        if (e) {
          const key = body.person ? "attendees" : "resources";
          e[key] ||= [];
          e[key].push(body);
        }
        return json({ uuid: crypto.randomUUID(), ...body, success: true });
      }
      let uuid =
        body.uuid ||
        [...store.values()].find((x) => x.ownerKey === body.key && body.key)
          ?.uuid ||
        crypto.randomUUID();
      const row = {
        ...store.get(uuid),
        ...body,
        uuid,
        ownerUuid: instance,
        ownerKey: body.key,
        calendarUuid: body.calendar,
        personUuid: body.person,
        createdByUuid: body.creator,
        success: true,
      };
      store.set(uuid, row);
      return json(row);
    }
    if (method === "DELETE") {
      const id =
        route.split("/i/")[1]?.split("/")[0] ||
        [...store.values()].find((x) => x.ownerKey === route.split("/k/")[1])
          ?.uuid;
      store.delete(id);
      return json({ uuid: id, success: true });
    }
    if (route.includes("/resolve/")) {
      const uuid = route.split("/resolve/")[1].split("/")[0],
        row = store.get(uuid);
      if (!row) return json({ success: false }, 404);
      return json({
        ...row,
        role: "owner",
        canRead: true,
        canWrite: true,
        principalUserUuid: user,
      });
    }
    if (route.includes("/access/"))
      return json({
        items: [...store.values()],
        success: true,
        person: crypto.randomUUID(),
        userUuid: user,
      });
    if (group === "events") {
      let items = [...store.values()];
      const id = route.split("/i/")[1];
      if (id) items = items.filter((e) => e.uuid === id);
      const cal = route.split("/c/")[1];
      if (cal) items = items.filter((e) => e.calendarUuid === cal);
      return json({
        items: items.map((e) => ({
          ...e,
          calendar: {
            uuid: e.calendarUuid,
            name: records.calendars.get(e.calendarUuid)?.name,
          },
          createdBy: { uuid: e.createdByUuid },
          attendees: e.attendees || [],
          resources: e.resources || [],
        })),
        success: true,
      });
    }
    if (route.includes("/available/"))
      return json({ items: [...store.values()], success: true });
    if (route.includes("/o/k/")) {
      const row = [...store.values()].find(
        (x) => x.ownerKey === route.split("/o/k/")[1].split("/")[0],
      );
      return json(
        group === "calendars"
          ? { items: [...store.values()], success: true }
          : row || { success: false },
      );
    }
    if (route.includes("/i/"))
      return json(store.get(route.split("/i/")[1]) || { success: false });
    return json({ items: [...store.values()], success: true });
  };
  return { fetchImpl, records, dav, calls, setToken: (v) => (loginToken = v) };
}
