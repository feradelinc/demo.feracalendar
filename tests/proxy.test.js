import test from "node:test";
import assert from "node:assert/strict";
import { createApp, safeBase } from "../server/app.js";
import { walkthrough, restOp } from "../shared/workflow.js";
import { sampleICS, xmlExamples } from "../shared/protocol.js";
import operations from "../shared/operations.json" with { type: "json" };
import { fixture, config, instance, user, token } from "./fixture.js";
async function harness(fn, options = {}) {
  const fixtureState = fixture(),
    app = createApp({
      config,
      fetchImpl: options.fetchImpl || fixtureState.fetchImpl,
      ...(options.now ? { now: options.now } : {}),
    }),
    server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = "http://127.0.0.1:" + server.address().port;
  let cookie = "";
  async function call(path, body, headers = {}) {
    const response = await fetch(url + "/demo/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        "x-demo-request": "1",
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    return {
      status: response.status,
      data: await response.json(),
      headers: response.headers,
    };
  }
  try {
    await fn(call, fixtureState);
  } finally {
    app.locals.close();
    await new Promise((r) => server.close(r));
  }
}
const login = (call) =>
  call("login", {
    instance,
    email: "avery@example.test",
    password: "private-password",
  });
const execute = (call, method, route, payload = {}) =>
  call("execute", { operationId: restOp(method, route).id, ...payload });
test("FerAuth email login, transmission headers, cookie, reveal, redaction and logout", () =>
  harness(async (call, f) => {
    const r = await login(call);
    assert.equal(r.data.session.authenticated, true);
    assert.ok(r.headers.get("set-cookie").includes("HttpOnly"));
    assert.ok(r.headers.get("set-cookie").includes("SameSite=Strict"));
    assert.equal(r.data.data.token, "[REDACTED]");
    assert.equal(r.data.request.body.password, "[REDACTED]");
    assert.equal(f.calls[0].headers.instance, instance);
    await execute(call, "GET", "/api/v1/resources");
    assert.equal(
      f.calls.at(-1).headers["x-auth-token"],
      (await call("token", {})).data.token,
    );
    await call("logout", {});
    assert.equal((await call("token", {})).status, 401);
  }));
test("incorrect password and missing instance cannot create sessions", () =>
  harness(async (call) => {
    assert.equal(
      (
        await call("login", {
          instance,
          email: "a@example.test",
          password: "wrong",
        })
      ).data.status,
      400,
    );
    assert.equal((await call("session")).data.authenticated, false);
    assert.equal(
      (await call("login", { email: "a@example.test", password: "private" }))
        .status,
      400,
    );
    assert.equal((await execute(call, "GET", "/api/v1/resources")).status, 401);
  }));
test("provisioned API-key flow uses x-api-key only for auth and clears key from trace", () =>
  harness(async (call, f) => {
    const r = await call("login", { instance, apiKey: "fixture-key" });
    assert.equal(r.data.session.authenticated, true);
    assert.equal(f.calls[0].headers["x-api-key"], "fixture-key");
    assert.ok(!JSON.stringify(r.data).includes("fixture-key"));
    await execute(call, "GET", "/api/v1/resources");
    assert.equal(f.calls.at(-1).headers["x-api-key"], undefined);
  }));
test("expired JWT and local deadline invalidate credentials", async () => {
  let time = Date.now();
  await harness(
    async (call, f) => {
      f.setToken(token(Math.floor(time / 1000) - 10));
      assert.equal((await login(call)).status, 401);
      f.setToken(token(Math.floor(time / 1000) + 30));
      await login(call);
      time += 31000;
      assert.equal((await call("session")).data.authenticated, false);
      assert.equal(
        (await execute(call, "GET", "/api/v1/resources")).status,
        401,
      );
    },
    { now: () => time },
  );
});
test("wrong entitlement is an actual upstream denial without fallback", () =>
  harness(
    async (call) => {
      await login(call);
      const r = await execute(call, "GET", "/api/v1/resources");
      assert.equal(r.data.status, 403);
      assert.equal(r.data.data.error, "Wrong product entitlement");
    },
    {
      fetchImpl: async (url) =>
        url.includes("/auth")
          ? Response.json({ token: token() })
          : Response.json(
              { error: "Wrong product entitlement" },
              { status: 403 },
            ),
    },
  ));
test("allowlist, remote HTTPS and credential service separation", () => {
  assert.throws(() => safeBase("http://evil.test"));
  for (const url of [
    "https://u:p@evil.test",
    "https://evil.test?x=1",
    "https://evil.test/api",
  ])
    assert.throws(() => safeBase(url));
  assert.throws(() =>
    createApp({ config: { ...config, calendar: "https://cal.feradel.com" } }),
  );
  assert.throws(() =>
    createApp({ config: { ...config, caldav: config.auth } }),
  );
});
test("CSRF, host checks, destination override and internal dispatch rejected", () =>
  harness(async (call) => {
    assert.equal(
      (
        await call(
          "login",
          { instance, email: "x", password: "y" },
          { origin: "https://evil.test" },
        )
      ).status,
      403,
    );
    await login(call);
    for (const op of operations.filter((o) => o.internal))
      assert.equal((await call("execute", { operationId: op.id })).status, 403);
    assert.equal(
      (
        await call("execute", {
          operationId: restOp("GET", "/api/v1/resources").id,
          url: "https://evil.test",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("login", {
          instance,
          email: "x",
          password: "y",
          auth: "https://evil.test",
        })
      ).status,
      403,
    );
  }));
test("cross-owner, force, unsupported fields and unrelated cleanup cannot transmit writes", () =>
  harness(async (call, f) => {
    await login(call);
    const before = f.calls.length;
    assert.equal(
      (
        await execute(call, "POST", "/api/v1/people", {
          body: {
            owner: "33333333-3333-4333-8333-333333333333",
            key: "x",
            email: "x@example.test",
          },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await execute(call, "POST", "/api/v1/calendars/share", {
          body: { force: true },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await execute(call, "DELETE", "/api/v1/resources/i/{uuid}", {
          params: { uuid: user },
          confirmation: user,
        })
      ).status,
      403,
    );
    assert.equal(f.calls.length, before);
  }));
test("Northstar workflow performs read-after-write, sharing, participation, recurrence, history and scoped cleanup", () =>
  harness(async (call, f) => {
    await login(call);
    const session = (await call("session")).data,
      steps = [];
    const context = await walkthrough({
      session,
      date: "2027-06-15",
      sharedUser: user,
      execute: async (p) => {
        const r = await call("execute", p);
        assert.equal(r.status, 200, JSON.stringify(r.data));
        return r.data;
      },
      onStep: (s) => steps.push(s),
    });
    assert.equal(f.records.events.size, 3);
    assert.ok(
      steps.some(
        (s) =>
          s.name === "Verify recurrence persistence" && s.state === "passed",
      ),
    );
    assert.ok(
      steps.some(
        (s) => s.name === "Share with Taylor as editor" && s.state === "passed",
      ),
    );
    assert.ok(f.records.events.get(context.event.uuid).attendees.length);
    const created = (await call("session")).data.created;
    for (const group of ["events", "calendars", "resources", "people"])
      for (const r of created.filter((x) => x.group === group)) {
        const result = await execute(
          call,
          "DELETE",
          "/api/v1/" + group + "/i/{uuid}",
          { params: { uuid: r.uuid }, confirmation: r.uuid },
        );
        assert.equal(result.status, 200);
      }
    assert.equal((await call("session")).data.created.length, 0);
  }));
test("guided walkthrough succeeds without the backend-only VERIFY.CALDAV resolver permission", () => {
  const f = fixture();
  return harness(async (call) => {
    await login(call);
    const session = (await call("session")).data;
    await walkthrough({ session, date: "2027-06-15", sharedUser: user,
      execute: async (p) => {
        return (await call("execute", p)).data;
      }
    });
    assert.equal(f.records.events.size, 3);
  }, { fetchImpl: (url, options) => url.includes("/calendars/resolve/")
    ? Response.json({ success: false, error: { message: "VERIFY.CALDAV required" } }, { status: 403 })
    : f.fetchImpl(url, options) });
});
test("owner verification refuses cross-tenant resolve and event query", () =>
  harness(async (call, f) => {
    await login(call);
    const foreign = "33333333-3333-4333-8333-333333333333";
    f.records.calendars.set(foreign, {
      uuid: foreign,
      ownerUuid: foreign,
      success: true,
    });
    assert.equal(
      (
        await execute(call, "GET", "/api/v1/calendars/resolve/{uuid}", {
          params: { uuid: foreign },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await execute(call, "GET", "/api/v1/events/history/c/{calendar}", {
          params: { calendar: foreign },
        })
      ).status,
      403,
    );
  }));
test("CalDAV credential success/failure, independent disconnect, XML and all registration variants", () =>
  harness(async (call, f) => {
    assert.equal(
      (
        await call("caldav/connect", {
          instance,
          username: "dav-user",
          password: "wrong",
        })
      ).data.status,
      401,
    );
    const r = await call("caldav/connect", {
      instance,
      username: "dav-user",
      password: "dav-pass",
    });
    assert.equal(r.data.status, 207);
    assert.ok(!JSON.stringify(r.data).includes("dav-pass"));
    const uuid = "33333333-3333-4333-8333-333333333333";
    for (const op of operations.filter(
      (o) =>
        o.service === "caldav" &&
        !o.supplemental &&
        !["PUT", "DELETE", "GET"].includes(o.method),
    )) {
      const params = {
        instance,
        person: user,
        calendarUuid: uuid,
        path: "events",
      };
      const r = await call("execute", {
        operationId: op.id,
        params,
        headers: ["PROPFIND", "REPORT"].includes(op.method)
          ? { Depth: "1" }
          : {},
        ...(["PROPFIND", "REPORT"].includes(op.method)
          ? {
              body:
                op.method === "REPORT"
                  ? xmlExamples.query
                  : xmlExamples.propfind,
            }
          : {}),
      });
      assert.equal(r.status, 200, op.route + JSON.stringify(r.data));
    }
    await call("caldav/disconnect", {});
    assert.equal((await call("session")).data.caldavConnected, false);
  }));
test("real protocol proxy ETag flow, stale conflict, UID mismatch, conditional delete and CRLF", () =>
  harness(async (call, f) => {
    await login(call);
    const s = (await call("session")).data,
      p = await execute(call, "POST", "/api/v1/people", {
        body: {
          key: s.prefix + "-p",
          email: "p@example.test",
          displayName: "Avery",
          user,
        },
      }),
      c = await execute(call, "POST", "/api/v1/calendars", {
        body: { name: "Calendar " + s.prefix, person: p.data.data.uuid },
      }),
      calendar = c.data.data.uuid;
    await call("caldav/connect", {
      instance,
      username: "dav-user",
      password: "dav-pass",
    });
    const id = "44444444-4444-4444-8444-444444444444",
      params = { calendarUuid: calendar, path: id + ".ics" },
      event = {
        title: "A",
        startsAt: "2027-01-01T15:00Z",
        endsAt: "2027-01-01T16:00Z",
      };
    const op = (m) =>
      operations.find(
        (o) =>
          o.service === "caldav" &&
          o.method === m &&
          o.route === "/caldav/calendars/{calendarUuid}/{path}",
      ).id;
    const dav = (m, extra = {}) =>
      call("execute", { operationId: op(m), params, ...extra });
    assert.equal(
      (await dav("PUT", { body: sampleICS(id, event).replace(/\r/g, "") })).data
        .status,
      201,
    );
    assert.ok(f.calls.at(-1).body.includes("\r\n"));
    const get = await dav("GET"),
      etag = get.data.headers.etag;
    assert.equal(
      (
        await dav("PUT", {
          body: sampleICS(id, { ...event, title: "B" }),
          headers: { "If-Match": etag },
        })
      ).data.status,
      204,
    );
    assert.equal(
      (
        await dav("PUT", {
          body: sampleICS(id, { ...event, title: "C" }),
          headers: { "If-Match": etag },
        })
      ).data.status,
      412,
    );
    assert.equal(
      (await dav("PUT", { body: sampleICS(user, event) })).status,
      400,
    );
    const fresh = await dav("GET");
    assert.equal(
      (
        await dav("DELETE", {
          headers: { "If-Match": fresh.data.headers.etag },
          confirmation: params.path,
        })
      ).data.status,
      204,
    );
  }));

test("every public REST operation transmits its canonical method and path with scoped arguments", () =>
  harness(async (call, f) => {
    await login(call);
    const session = (await call("session")).data;
    const ctx = await walkthrough({
      session,
      date: "2027-06-15",
      execute: async (p) => (await call("execute", p)).data,
    });
    const covered = new Set();
    const ops = operations
      .filter((o) => o.service === "rest" && !o.health && !o.internal)
      .sort((a, b) => (a.method === "DELETE") - (b.method === "DELETE"));
    for (const op of ops) {
      let body,
        params = {
          uuid:
            op.group === "events"
              ? ctx.event.uuid
              : op.group === "calendars"
                ? ctx.calendar.uuid
                : op.group === "resources"
                  ? ctx.room.uuid
                  : ctx.avery.uuid,
          userUuid: user,
          visibility: 15,
          key: op.group === "resources" ? ctx.room.key : ctx.avery.key,
          calendar: ctx.calendar.uuid,
          startAt: "2027-06-15T00:00:00Z",
          endAt: "2027-06-16T00:00:00Z",
        };
      if (op.method === "POST") {
        body = op.route.endsWith("/share")
          ? {
              calendar: ctx.calendar.uuid,
              person: ctx.taylor.uuid,
              inviter: ctx.avery.uuid,
              role: "admin",
            }
          : op.route.endsWith("/unshare")
            ? { calendar: ctx.calendar.uuid, person: ctx.taylor.uuid }
            : op.route.endsWith("/invite")
              ? {
                  event: ctx.event.uuid,
                  resource: ctx.room.uuid,
                  invitedBy: ctx.avery.uuid,
                  status: "accepted",
                  mark: "busy",
                }
              : op.group === "people"
                ? {
                    key: ctx.avery.key,
                    email: ctx.avery.email,
                    displayName: "Avery updated",
                  }
                : op.group === "resources"
                  ? {
                      uuid: ctx.room.uuid,
                      key: ctx.room.key,
                      displayName: "Room updated",
                    }
                  : op.group === "calendars"
                    ? {
                        uuid: ctx.calendar.uuid,
                        name: ctx.calendar.name,
                        person: ctx.avery.uuid,
                        shared: false,
                      }
                    : {
                        uuid: ctx.event.uuid,
                        calendar: ctx.calendar.uuid,
                        creator: ctx.avery.uuid,
                        title: "Updated",
                        startsAt: "2027-06-15T14:00Z",
                        endsAt: "2027-06-15T15:00Z",
                        status: "confirmed",
                        style: "event",
                      };
      }
      if (op.method === "DELETE") {
        // Each delete variant gets a new owned target so prior deletes cannot satisfy this test accidentally.
        const group = op.group;
        const createBody =
          group === "people"
            ? {
                key: session.prefix + "-" + covered.size,
                email: covered.size + "@example.test",
                displayName: "Synthetic",
              }
            : group === "resources"
              ? {
                  key: session.prefix + "-" + covered.size,
                  displayName: "Synthetic",
                }
              : group === "calendars"
                ? {
                    name: session.prefix + "-" + covered.size,
                    person: ctx.taylor.uuid,
                  }
                : {
                    calendar: ctx.calendar.uuid,
                    creator: ctx.avery.uuid,
                    title: "Synthetic",
                    startsAt: "2027-06-15T14:00Z",
                    endsAt: "2027-06-15T15:00Z",
                  };
        // Calendar's own delete runs last to preserve the common event parent.
        const made = await execute(call, "POST", "/api/v1/" + group, {
          body: createBody,
        });
        assert.equal(made.status, 200, JSON.stringify(made.data));
        params.uuid = made.data.data.uuid;
        params.key = group === "events" ? ctx.avery.key : createBody.key;
      }
      const payload = { operationId: op.id, params, ...(body ? { body } : {}) };
      if (op.method === "DELETE" || op.route.endsWith("/unshare"))
        payload.confirmation =
          op.method === "DELETE"
            ? op.route.includes("/i/")
              ? params.uuid
              : params.key
            : body.calendar;
      const r = await call("execute", payload);
      assert.equal(r.status, 200, op.route + ": " + JSON.stringify(r.data));
      assert.equal(r.data.request.method, op.method);
      assert.ok(r.data.request.url.startsWith(config.calendar + "/api/v1/"));
      covered.add(op.id);
    }
    assert.equal(covered.size, 30);
  }));

test("Matters destinations are blocked even if a service base is misconfigured", () => {
  assert.throws(() => safeBase("http://127.0.0.1:11303"));
  assert.throws(() => safeBase("https://api.matters.feradel.com"));
});
test("upstream redirects are not followed; body and response limits are enforced", async () => {
  await harness(
    async (call, f) => {
      await login(call);
      const r = await execute(call, "GET", "/api/v1/resources");
      assert.equal(r.data.status, 302);
    },
    {
      fetchImpl: async (url, opt) => {
        assert.equal(opt.redirect, "manual");
        assert.ok(opt.signal instanceof AbortSignal);
        return url.includes("/auth")
          ? Response.json({ token: token() })
          : new Response("", {
              status: 302,
              headers: { location: "https://evil.test" },
            });
      },
    },
  );
  await harness(async (call) => {
    await login(call);
    assert.equal(
      (
        await call("execute", {
          operationId: restOp("POST", "/api/v1/people").id,
          body: {
            email: "a@example.test",
            key: "x",
            displayName: "x".repeat(2 * 1024 * 1024),
          },
        })
      ).status,
      413,
    );
  });
  await harness(
    async (call) => {
      await login(call);
      assert.equal(
        (await execute(call, "GET", "/api/v1/resources")).status,
        413,
      );
    },
    {
      fetchImpl: async (url) =>
        url.includes("/auth")
          ? Response.json({ token: token() })
          : new Response("x".repeat(8 * 1024 * 1024 + 1)),
    },
  );
});
