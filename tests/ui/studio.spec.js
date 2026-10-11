import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { fixture, config, instance, user, token } from "../fixture.js";
import operations from "../../shared/operations.json" with { type: "json" };
import { routeFor, redact } from "../../shared/data.js";
import fs from "node:fs";
const screenshots = "docs/screenshots";
async function intercept(page) {
  const f = fixture();
  let session = {
    authenticated: false,
    caldavConnected: false,
    instance,
    user,
    prefix: "northstar-browser-fixture",
    created: [],
  };
  let failure = false;
  const requests = [];
  await page.route("**/demo/**", async (route) => {
    const endpoint = route.request().url().split("/demo/")[1],
      p = route.request().postData() ? route.request().postDataJSON() : {};
    requests.push({ endpoint, payload: p });
    let response;
    if (endpoint === "config")
      response = { ...config, email: "avery@example.test", mode: "live" };
    else if (endpoint === "session") response = session;
    else if (endpoint === "token") response = { token: token() };
    else if (endpoint === "logout") {
      session = {
        ...session,
        authenticated: false,
        caldavConnected: false,
        created: [],
      };
      response = { success: true };
    } else if (endpoint === "login") {
      session = {
        ...session,
        authenticated: true,
        expires: Date.now() + 3600000,
      };
      response = {
        status: 200,
        request: {
          method: "POST",
          url: config.auth + "/api/v1/auth",
          headers: { instance },
          body: { email: p.email, password: "[REDACTED]" },
        },
        headers: {},
        elapsedMs: 8,
        data: { token: "[REDACTED]" },
        session,
      };
    } else if (endpoint === "caldav/connect") {
      session.caldavConnected = true;
      response = {
        status: 207,
        request: {
          method: "PROPFIND",
          url: config.caldav + "/caldav/instance/" + instance,
          headers: { authorization: "[REDACTED]" },
          body: '<d:propfind xmlns:d="DAV:"/>',
        },
        headers: {},
        elapsedMs: 12,
        contentType: "application/xml",
        data: '<d:multistatus xmlns:d="DAV:"/>',
        session,
      };
    } else if (endpoint === "caldav/disconnect") {
      session.caldavConnected = false;
      response = session;
    } else if (endpoint === "execute") {
      const op = operations.find((o) => o.id === p.operationId);
      const url =
          (op.service === "rest" ? config.calendar : config.caldav) +
          routeFor(op, p.params || {}, p.query || {}),
        headers =
          op.service === "rest"
            ? {
                instance,
                "x-auth-token": token(),
                "content-type": "application/json",
              }
            : {
                authorization:
                  "Basic " +
                  Buffer.from("dav-user:dav-pass").toString("base64"),
                ...Object.fromEntries(
                  Object.entries(p.headers || {}).map(([k, v]) => [
                    k.toLowerCase(),
                    v,
                  ]),
                ),
              };
      const body =
        typeof p.body === "string"
          ? p.body
          : p.body
            ? JSON.stringify(p.body)
            : undefined;
      const upstream = failure
        ? Response.json(
            { success: false, error: { message: "Explicit fixture failure" } },
            { status: 503 },
          )
        : await f.fetchImpl(url, { method: op.method, headers, body });
      const text = await upstream.text();
      let data = text;
      try {
        data = JSON.parse(text);
      } catch {}
      response = {
        status: upstream.status,
        headers: Object.fromEntries(upstream.headers),
        contentType: upstream.headers.get("content-type") || "",
        request: {
          method: op.method,
          url,
          headers: redact(headers),
          body: redact(p.body),
        },
        data,
        elapsedMs: 15,
      };
      if (
        op.method === "POST" &&
        data.uuid &&
        !/\/(share|unshare|invite)$/.test(op.route) &&
        !session.created.some((r) => r.uuid === data.uuid)
      )
        session.created.push({
          group: op.group,
          uuid: data.uuid,
          key: p.body.key,
        });
    } else throw Error("Unexpected intercepted endpoint " + endpoint);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  return { f, requests, fail: () => (failure = true) };
}
async function login(page) {
  await page.getByRole("button", { name: "Connect account" }).click();
  await page
    .getByLabel("Password", { exact: true })
    .fill("DO_NOT_EXPOSE_PASSWORD");
  await page.getByRole("button", { name: "Authenticate", exact: true }).click();
  await expect(page.getByText("REST connected", { exact: true })).toBeVisible();
}
async function walk(page) {
  await page
    .getByRole("button", { name: "Full demonstration", exact: true })
    .click();
  await page.getByLabel("Demo date").fill("2027-06-15");
  await page
    .getByRole("button", { name: "Run full demonstration", exact: true })
    .click();
  await expect(page.locator(".workflow .passed").last()).toContainText(
    "Browse event history",
  );
}
test("getting started, token reveal/copy, code generation, expiration display and logout", async ({
  page,
}) => {
  const state = await intercept(page);
  await page.goto("/");
  await login(page);
  await expect(page.locator("body")).not.toContainText(
    "DO_NOT_EXPOSE_PASSWORD",
  );
  await page.getByRole("button", { name: "Request", exact: true }).click();
  await expect(page.locator(".inspector")).toContainText("[REDACTED]");
  await page.getByRole("button", { name: "Reveal my token" }).click();
  await expect(page.getByLabel("Revealed session token")).toHaveValue(/eyJ/);
  await page.getByRole("button", { name: "Hide token" }).click();
  await page.getByRole("button", { name: "JavaScript", exact: true }).click();
  await expect(page.locator(".inspector")).toContainText("/api/v1/auth");
  await page.getByRole("button", { name: "Logout", exact: true }).click();
  await expect(
    page.getByText("Not authenticated", { exact: true }),
  ).toBeVisible();
  expect(state.requests.some((r) => r.endpoint === "logout")).toBeTruthy();
});
test("complete walkthrough, live-result calendar views, editing, source mapping and screenshots", async ({
  page,
}) => {
  const state = await intercept(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await login(page);
  await walk(page);
  fs.mkdirSync(screenshots, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: screenshots + "/workflow.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByLabel("Selected date").fill("2027-06-15");
  await page.getByRole("button", { name: "Load live calendar" }).click();
  await expect(
    page.locator(".event").filter({ hasText: "Weekly Team Review" }).first(),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: screenshots + "/calendar-month.png",
    fullPage: true,
  });
  for (const view of ["Week", "Day", "Agenda"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(page.locator(".calendar")).toHaveClass(
      new RegExp(view.toLowerCase()),
    );
  }
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await page
    .locator(".event")
    .filter({ hasText: "Weekly Team Review" })
    .first()
    .click();
  await page
    .getByLabel("title", { exact: true })
    .fill("Weekly Team Review · edited");
  await page
    .getByRole("button", { name: "Save through POST /api/v1/events" })
    .click();
  await expect(
    page.locator(".event").filter({ hasText: "Weekly Team Review · edited" }),
  ).toBeVisible();
  expect(
    state.requests.some(
      (r) => r.payload?.body?.title === "Weekly Team Review · edited",
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
test("sharing, availability, invitation participation and history interfaces", async ({
  page,
}) => {
  await intercept(page);
  await page.goto("/");
  await login(page);
  await walk(page);
  await page
    .getByRole("button", { name: "Calendars & sharing", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Share / change role", exact: true })
    .click();
  await expect(page.locator(".inspector")).toContainText("invitedByUuid");
  await page.getByLabel("Sharing role").selectOption("admin");
  await page
    .getByRole("button", { name: "Share / change role", exact: true })
    .click();
  await page.getByRole("button", { name: "Availability", exact: true }).click();
  await page.getByRole("button", { name: "Check live availability" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Available people · actual service response",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Invitations", exact: true }).click();
  await page
    .getByRole("button", { name: "Inspect invitees and resources" })
    .click();
  await expect(page.locator(".inspector")).toContainText("attendees");
  await page
    .getByRole("button", { name: "Recurrence & history", exact: true })
    .click();
  await page.getByRole("button", { name: "Retrieve event history" }).click();
  await expect(page.locator(".inspector")).toContainText("FREQ=WEEKLY");
});
test("operation search, editable path/query/body, source schema and secret-safe trace download", async ({
  page,
}) => {
  await intercept(page);
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "API explorer", exact: true }).click();
  await page.getByLabel("Search operations").fill("/resources");
  await page
    .locator(".operation-list>button")
    .filter({ hasText: "GET/api/v1/resources" })
    .first()
    .click();
  await page.getByRole("button", { name: "Execute operation" }).click();
  await page.getByRole("button", { name: "cURL", exact: true }).click();
  await expect(page.locator(".inspector")).toContainText("FERA_AUTH_TOKEN");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download sanitized trace" }).click();
  const file = await (await download).path();
  expect(fs.readFileSync(file, "utf8")).not.toContain("fixture-signature");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: screenshots + "/api-explorer.png",
    fullPage: true,
  });
});
test("CalDAV Basic connect, XML recipes, ICS editor and real fixture ETag conflict", async ({
  page,
}) => {
  await intercept(page);
  await page.goto("/");
  await login(page);
  await walk(page);
  await page
    .getByRole("button", { name: "CalDAV laboratory", exact: true })
    .click();
  await page.getByLabel("CalDAV username", { exact: true }).fill("dav-user");
  await page.getByLabel("CalDAV password", { exact: true }).fill("dav-pass");
  await page.getByRole("button", { name: "Verify & connect CalDAV" }).click();
  await expect(
    page.getByText("CalDAV connected", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".inspector")).not.toContainText("dav-pass");
  await page
    .getByRole("button", { name: "calendar-query", exact: true })
    .click();
  await expect(page.getByLabel("XML recipe (copy into explorer)")).toHaveValue(
    /calendar-query/,
  );
  await page
    .getByRole("button", {
      name: "1 · GET / refresh + capture ETag",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Current ETag")).toHaveValue('"rest-1"');
  const editor = page.getByLabel("Complete iCalendar document");
  await editor.fill(
    (await editor.inputValue()).replace(
      "SUMMARY:New Client Consultation",
      "SUMMARY:Changed Consultation",
    ),
  );
  await page
    .getByRole("button", { name: "2 · PUT with current If-Match" })
    .click();
  await expect(
    page.getByRole("button", { name: "3 · PUT with previous ETag" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "3 · PUT with previous ETag" })
    .click();
  await expect(page.locator(".inspector")).toContainText("HTTP 412");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: screenshots + "/caldav-lab.png",
    fullPage: true,
  });
});
test("mobile layout, keyboard navigation and visible failed upstream request without fallback", async ({
  page,
}) => {
  const state = await intercept(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("class", "brand");
  await login(page);
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  state.fail();
  await page.getByRole("button", { name: "Load live calendar" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Calendar listing failed" }),
  ).toBeVisible();
  await expect(page.locator(".event")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshots + "/mobile.png", fullPage: true });
});

test("all workspaces meet automated WCAG A/AA and maintain responsive width", async ({
  page,
}) => {
  await intercept(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await login(page);
  await walk(page);
  for (const name of [
    "Calendar",
    "Getting started",
    "Full demonstration",
    "Calendars & sharing",
    "People",
    "Resources",
    "Invitations",
    "Availability",
    "Recurrence & history",
    "API explorer",
    "CalDAV laboratory",
    "Contracts & boundaries",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
      name,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      name,
    ).toBeTruthy();
  }
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    for (const name of ["Calendar", "API explorer", "CalDAV laboratory"]) {
      await page.getByRole("button", { name, exact: true }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        name + " " + width,
      ).toBeTruthy();
    }
  }
});
