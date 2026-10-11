import "dotenv/config";
import fs from "node:fs";
import { createApp, safeBase } from "../server/app.js";
import { walkthrough, restOp } from "../shared/workflow.js";
import { today, traceForDownload } from "../shared/data.js";
if (
  process.env.SMOKE_NONPRODUCTION !== "true" ||
  !process.env.INSTANCE_UUID ||
  !process.env.SMOKE_EMAIL ||
  !process.env.SMOKE_PASSWORD
) {
  console.error(
    "Smoke refused: configure an expressly authorized nonproduction account, INSTANCE_UUID, SMOKE_EMAIL, SMOKE_PASSWORD and SMOKE_NONPRODUCTION=true in ignored configuration. No upstream requests were made.",
  );
  process.exit(2);
}
const config = {
  auth: safeBase(process.env.AUTH_API_URL),
  calendar: safeBase(process.env.CALENDAR_API_URL),
  caldav: safeBase(process.env.CALDAV_API_URL),
  instance: process.env.INSTANCE_UUID,
  allowed: (process.env.ALLOWED_API_URLS || "").split(",").filter(Boolean),
};
console.log(
  "Opt-in nonproduction qualification: tenant " +
    config.instance +
    "; Calendar " +
    config.calendar +
    "; CalDAV " +
    config.caldav,
);
const app = createApp({ config }),
  server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port;
let cookie = "",
  report = {
    startedAt: new Date().toISOString(),
    tenant: config.instance,
    calendar: config.calendar,
    caldav: config.caldav,
    live: true,
    steps: [],
    created: [],
    cleanupRequested: process.env.SMOKE_CLEANUP === "true",
  };
async function call(path, body) {
  const r = await fetch(base + "/demo/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      "x-demo-request": "1",
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie").split(";")[0];
  const result = await r.json();
  if (!r.ok) throw Error(result.message || "Local proxy HTTP " + r.status);
  return result;
}
try {
  const auth = await call("login", {
    instance: config.instance,
    email: process.env.SMOKE_EMAIL,
    password: process.env.SMOKE_PASSWORD,
  });
  if (!auth.session)
    throw Error("FerAuth rejected authentication: HTTP " + auth.status);
  report.steps.push({
    name: "FerAuth login",
    state: "passed",
    status: auth.status,
  });
  if (process.env.SMOKE_CALDAV === "true") {
    if (
      !process.env.SMOKE_CALDAV_USERNAME ||
      !process.env.SMOKE_CALDAV_PASSWORD
    )
      throw Error("Separate CalDAV credentials required");
    const r = await call("caldav/connect", {
      instance: config.instance,
      username: process.env.SMOKE_CALDAV_USERNAME,
      password: process.env.SMOKE_CALDAV_PASSWORD,
    });
    if (r.status !== 207) throw Error("CalDAV connect HTTP " + r.status);
  }
  await walkthrough({
    execute: (p) => call("execute", p),
    session: await call("session"),
    date: process.env.SMOKE_DATE || today(),
    sharedUser: process.env.SMOKE_SHARED_USER_UUID,
    includeCalDAV: process.env.SMOKE_CALDAV === "true",
    onStep: (s) => {
      if (s.state !== "running") {
        report.steps.push({
          ...s,
          result: s.result ? traceForDownload(s.result) : undefined,
        });
        console.log(s.state + ": " + s.name);
      }
    },
  });
  report.state = "PASSED";
} catch (e) {
  report.state = "FAILED";
  report.error = e.message;
  process.exitCode = 1;
} finally {
  report.created = (await call("session")).created || [];
  if (report.cleanupRequested) {
    report.cleanup = [];
    cleanupLoop: for (const group of [
      "events",
      "calendars",
      "resources",
      "people",
    ])
      for (const item of report.created.filter((r) => r.group === group)) {
        try {
          const r = await call("execute", {
            operationId: restOp("DELETE", "/api/v1/" + group + "/i/{uuid}").id,
            params: { uuid: item.uuid },
            confirmation: item.uuid,
          });
          if (r.status !== 200 || r.data?.success === false)
            throw Error("Cleanup not confirmed");
          report.cleanup.push({ uuid: item.uuid, group, status: r.status });
        } catch (e) {
          report.cleanupError = e.message;
          process.exitCode = 1;
          break cleanupLoop;
        }
      }
  }
  fs.mkdirSync("output", { recursive: true });
  fs.writeFileSync(
    "output/live-qualification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await call("logout", {});
  app.locals.close();
  await new Promise((r) => server.close(r));
  console.log(
    "Sanitized report: output/live-qualification.json. Created identifiers retained; cleanup limited to this run.",
  );
}
