import crypto from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { execFileSync } from "node:child_process";
const source =
  process.env.CALENDAR_SOURCE || path.resolve("../tmp/calendar-api-contract");
const present = fs.existsSync(source);
function patchedText(patchFile, target) {
  const lines = fs.readFileSync(patchFile, "utf8").split(/\r?\n/);
  let active = false,
    out = [];
  for (const line of lines) {
    if (line.startsWith("+++ ")) {
      active = line === "+++ b/" + target;
      continue;
    }
    if (!active || line.startsWith("@@") || line.startsWith("--- ")) continue;
    if (line.startsWith("+") || line.startsWith(" ")) out.push(line.slice(1));
  }
  return out.join("\n");
}
function applyUnified(original, patchFile, target) {
  const lines = fs.readFileSync(patchFile, "utf8").split(/\r?\n/);
  const result = original.split(/\r?\n/);
  let active = false,
    delta = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("+++ ")) {
      active = lines[i] === "+++ b/" + target;
      continue;
    }
    const h =
      active && /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[i]);
    if (!h) continue;
    const start = Number(h[1]) - 1 + delta;
    let remove = 0,
      add = [];
    while (
      i + 1 < lines.length &&
      !lines[i + 1].startsWith("@@") &&
      !lines[i + 1].startsWith("--- ")
    ) {
      const line = lines[++i];
      if (line.startsWith("-")) remove++;
      if (line.startsWith(" ")) {
        remove++;
        add.push(line.slice(1));
      }
      if (line.startsWith("+")) add.push(line.slice(1));
    }
    result.splice(start, remove, ...add);
    delta += add.length - remove;
  }
  return result.join("\n");
}
test(
  "source confirms missing people getter; review-only patch restores owner-scoped lookup/availability with permission enforcement",
  { skip: !present },
  async () => {
    const target = "routes/api/v1/person/service.js",
      original = fs.readFileSync(path.join(source, target), "utf8");
    const calls = [];
    const person = {
      uuid: "person-1",
      dataValues: { uuid: "person-1", email: "a@example.test" },
    };
    const mocks = {
      sequelize: { Op: {} },
      uuid: { v4: () => "" },
      "./model": {
        Person: {
          byKey: async (p) => {
            calls.push(p);
            return person;
          },
          available: async (p) => {
            calls.push(p);
            return [person.dataValues];
          },
        },
        Calendar: {},
        CalendarUser: {},
      },
      "../../../../support/service": {
        permitted: async (_r, p) => calls.push(p),
        record: async () => {},
      },
      "../../../../support/string": { isGuid: () => true },
      "./constants": { VIS: {}, PERMISSION_VIEW: "VIEW.PERSON" },
    };
    const load = (text) => {
      const exports = {};
      vm.runInNewContext(text, {
        exports,
        require: (n) => {
          if (!(n in mocks)) throw Error("Unexpected dependency " + n);
          return mocks[n];
        },
      });
      return exports;
    };
    assert.equal(load(original).get, undefined);
    const service = load(
      applyUnified(original, "docs/backend-people-get.patch", target),
    );
    const key = await service.get({
      instance: "owner-A",
      params: { key: "demo-key" },
    });
    assert.equal(key.uuid, "person-1");
    assert.deepEqual(JSON.parse(JSON.stringify(calls[1])), {
      owner: "owner-A",
      key: "demo-key",
    });
    const available = await service.get({
      instance: "owner-A",
      params: { startAt: "2027-01-01T10:00Z", endAt: "2027-01-01T11:00Z" },
    });
    assert.equal(available.items.length, 1);
    await assert.rejects(
      service.get({
        instance: "owner-A",
        params: { startAt: "bad", endAt: "bad" },
      }),
    );
  },
);
test(
  "ordinary-owner patch denies owner substitution without modifying backend checkout",
  { skip: !present },
  () => {
    const target = "middleware/auth.js",
      original = fs.readFileSync(path.join(source, target), "utf8"),
      text = applyUnified(original, "docs/backend-owner-guard.patch", target);
    const module = { exports: {} };
    vm.runInNewContext(text, {
      module,
      require: (n) =>
        n === "jsonwebtoken"
          ? { verify: () => ({ session: "s", user: "u" }) }
          : n === "config"
            ? { get: () => "" }
            : { resolveOwnerInstance: () => "owner-A" },
      process: { env: {} },
    });
    let status,
      next = false;
    const response = {
      status: (s) => {
        status = s;
        return response;
      },
      json: () => {},
    };
    module.exports(
      { header: () => "x", body: { owner: "owner-B" } },
      response,
      () => (next = true),
    );
    assert.equal(status, 403);
    assert.equal(next, false);
  },
);
test("new reference boundary denies foreign calendar/event and passes owned references", async () => {
  const text = patchedText(
      "docs/backend-reference-boundary.patch",
      "middleware/calendar-owner-boundary.js",
    ),
    module = { exports: {} };
  vm.runInNewContext(text, {
    module,
    require: (n) =>
      n.includes("/Calendar")
        ? {
            findOne: async ({ where }) =>
              where.uuid === "owned" && where.ownerUuid === "tenant"
                ? { uuid: "owned" }
                : null,
          }
        : { findOne: async () => ({ calendarUuid: "foreign" }) },
  });
  let status,
    next = false;
  const res = {
    status: (s) => {
      status = s;
      return res;
    },
    json: () => {},
  };
  await module.exports(
    {
      instance: "tenant",
      baseUrl: "/api/v1/events",
      params: { uuid: "event" },
      body: {},
    },
    res,
    () => (next = true),
  );
  assert.equal(status, 403);
  assert.equal(next, false);
  await module.exports(
    {
      instance: "tenant",
      baseUrl: "/api/v1/events",
      params: { calendar: "owned" },
      body: {},
    },
    res,
    () => (next = true),
  );
  assert.equal(next, true);
});

test(
  "source proves CalDAV GET/PUT ETag representation mismatch; review patch hashes canonical read",
  { skip: !fs.existsSync("../tmp/calendar-caldav-contract") },
  () => {
    const root = path.resolve("../tmp/calendar-caldav-contract"),
      etagModule = { exports: {} };
    vm.runInNewContext(
      fs.readFileSync(path.join(root, "src/caldav/etag.js"), "utf8"),
      {
        module: etagModule,
        require: (n) => {
          if (n === "crypto") return crypto;
        },
      },
    );
    assert.notEqual(
      etagModule.exports.eventEtag({
        uuid: "event",
        calendarUuid: "calendar",
        title: "Example",
        success: true,
      }),
      etagModule.exports.eventEtag({
        uuid: "event",
        calendar: { uuid: "calendar" },
        title: "Example",
        attendees: [],
        resources: [],
      }),
    );
    const controller = fs.readFileSync(
      path.join(root, "src/caldav/controller.js"),
      "utf8",
    );
    assert.ok(controller.includes("eventEtag(result)"));
    const patch = applyUnified(
      controller,
      "docs/backend-caldav-etag.patch",
      "src/caldav/controller.js",
    );
    assert.ok(patch.includes("eventEtag(persisted)"));
    assert.ok(
      patch.includes(
        "await calendarClient.getEvent({ principal: principal(req), eventUuid })",
      ),
    );
  },
);
test(
  "source CalDAV all-day serializer adds an extra day; review patch preserves exclusive end",
  { skip: !fs.existsSync("../tmp/calendar-caldav-contract") },
  () => {
    const root = path.resolve("../tmp/calendar-caldav-contract"),
      original = fs.readFileSync(path.join(root, "src/caldav/ics.js"), "utf8"),
      load = (text) => {
        const module = { exports: {} };
        vm.runInNewContext(text, { module });
        return module.exports;
      },
      event = {
        uuid: "11111111-1111-4111-8111-111111111111",
        startsAt: "2027-01-01T00:00Z",
        endsAt: "2027-01-02T00:00Z",
        allDay: true,
        title: "One day",
      };
    assert.match(
      load(original).buildICSFromEvents([event]),
      /DTEND;VALUE=DATE:20270103/,
    );
    const patched = applyUnified(
      original,
      "docs/backend-caldav-all-day.patch",
      "src/caldav/ics.js",
    );
    assert.match(
      load(patched).buildICSFromEvents([event]),
      /DTEND;VALUE=DATE:20270102/,
    );
  },
);
test(
  "source CalDAV parser ignores TZID: UTC examples avoid silently claiming timezone support",
  { skip: !fs.existsSync("../tmp/calendar-caldav-contract") },
  () => {
    const module = { exports: {} };
    vm.runInNewContext(
      fs.readFileSync(
        "../tmp/calendar-caldav-contract/src/caldav/icsParser.js",
        "utf8",
      ),
      { module },
    );
    const result = module.exports.parseICS(
      "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:11111111-1111-4111-8111-111111111111\r\nDTSTART;TZID=America/New_York:20270101T100000\r\nDTEND;TZID=America/New_York:20270101T110000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
    );
    assert.equal(result.startsAt, "2027-01-01T10:00:00.000Z");
  },
);
