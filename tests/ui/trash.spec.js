import { expect, test } from "@playwright/test";
import { config, instance, user } from "../fixture.js";
import { operation } from "../../src/operations.js";

test("a deleted event returns to the calendar when restored from Trash", async ({ page }) => {
  const calendar = "33333333-3333-4333-8333-333333333333";
  const uuid = "44444444-4444-4444-8444-444444444444";
  const calendarAccess = operation("GET", "/api/v1/calendars/access/u/{userUuid}/v/{visibility}").id;
  const events = operation("GET", "/api/v1/events/s/{startAt}/e/{endAt}/c/{calendar}").id;
  const deleteEvent = operation("DELETE", "/api/v1/events/i/{uuid}").id;
  const title = "Restore this event";
  let deleted = false;
  await page.route("**/demo/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/demo/config") return route.fulfill({ json: config });
    if (url.pathname === "/demo/session") return route.fulfill({ json: {
      authenticated: true, instance, user, created: deleted ? [] : [{ group: "events", uuid }],
    } });
    if (url.pathname === "/demo/retail/reminders") return route.fulfill({ json: { items: [] } });
    if (url.pathname === "/demo/retail/event-trash") {
      const items = deleted ? [{ uuid, title, calendarName: "Work", deletedAt: new Date().toISOString() }] : [];
      return route.fulfill({ json: { items, nextPage: null } });
    }
    if (url.pathname === "/demo/retail/event-trash/" + uuid + "/restore") {
      expect(route.request().method()).toBe("POST");
      deleted = false;
      return route.fulfill({ json: { success: true, item: { uuid }, skippedAssociations: 0 } });
    }
    const request = route.request().postDataJSON();
    if (request.operationId === calendarAccess) {
      return route.fulfill({ json: { status: 200, data: { items: [{ uuid: calendar, name: "Work" }] } } });
    }
    if (request.operationId === events) {
      const start = Date.parse(request.params.startAt);
      const items = deleted ? [] : [{ uuid, title, calendarUuid: calendar,
        startsAt: new Date(start + 3600_000).toISOString(), endsAt: new Date(start + 7200_000).toISOString() }];
      return route.fulfill({ json: { status: 200, data: { items } } });
    }
    expect(request.operationId).toBe(deleteEvent);
    expect(request.confirmation).toBe(uuid);
    deleted = true;
    return route.fulfill({ json: { status: 200, data: { success: true } } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Load live calendar" }).click();
  const event = page.getByRole("button", { name: new RegExp(title) });
  await event.click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Move to Trash" }).click();
  const trash = page.getByRole("region", { name: "Deleted events" });
  await expect(event).toHaveCount(0);
  await trash.getByRole("button", { name: "Restore " + title }).click();
  await expect(trash.getByRole("status")).toHaveText("Event restored.");
  await expect(trash.getByText("No deleted events.")).toBeVisible();
  await expect(event).toBeVisible();
  for (const width of [820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(trash.getByRole("heading")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
