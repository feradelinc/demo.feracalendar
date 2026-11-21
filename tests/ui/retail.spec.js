import { test, expect } from "@playwright/test";
import { config, instance, user } from "../fixture.js";

test("a signed-in customer can configure scheduling and a guest can book", async ({ page, browser }) => {
  const calendar = "33333333-3333-4333-8333-333333333333";
  const slug = "12345678901234567890123456789012";
  const startsAt = "2027-01-08T16:00:00.000Z";
  const items = { tasks: [], reminders: [], "booking-pages": [], "automation-rules": [] };
  await page.route("**/demo/**", async route => {
    const name = new URL(route.request().url()).pathname.slice(6);
    const method = route.request().method();
    if (name === "config") return route.fulfill({ json: config });
    if (name === "session") return route.fulfill({ json: { authenticated: true, instance, user, created: [] } });
    if (name === "retail/capabilities") return route.fulfill({ json: {
      features: { tasks: true, reminders: true, bookingPages: true, automationRules: true },
      calendars: [{ uuid: calendar, name: "Appointments" }],
    } });
    const resource = name.slice(7);
    if (!(resource in items)) throw Error(`Unexpected route ${name}`);
    if (method === "POST") {
      const body = route.request().postDataJSON();
      if (["booking-pages", "automation-rules"].includes(resource)) expect(body.calendarUuid).toBe(calendar);
      const item = { ...body, uuid: crypto.randomUUID(), slug, published: true, enabled: true };
      items[resource].push(item);
      return route.fulfill({ json: { item } });
    }
    return route.fulfill({ json: { items: items[resource] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Scheduling tools" }).click();
  await page.getByLabel("Task title").fill("Prepare notes");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("listitem").getByText("Prepare notes", { exact: true })).toBeVisible();
  await page.getByLabel("Reminder title", { exact: true }).first().fill("Send notes");
  await page.getByLabel("Remind me at").fill("2027-01-08T10:00");
  await page.getByRole("button", { name: "Set reminder" }).click();
  await expect(page.getByText(/Send notes/).first()).toBeVisible();
  await expect(page.getByLabel("Calendar", { exact: true })).toHaveValue(calendar);
  await page.getByLabel("Booking page title").fill("Intro call");
  await page.getByLabel("Time slot 1").fill("2027-01-08T11:00");
  await page.getByRole("button", { name: "Create booking page" }).click();
  await expect(page.getByRole("link", { name: "Intro call" })).toHaveAttribute("href", "/book/" + slug);
  await page.getByLabel("Reminder title", { exact: true }).last().fill("Review the booking");
  await page.getByLabel("When", { exact: true }).selectOption("booking.created");
  await page.getByRole("button", { name: "Create rule" }).click();
  await expect(page.getByText("Review the booking", { exact: true })).toBeVisible();

  const guest = await browser.newPage();
  await guest.route("**/demo/retail/booking/**", async route => {
    expect(route.request().headers().cookie).toBeUndefined();
    if (route.request().method() === "GET") return route.fulfill({ json: { item: { title: "Intro call", duration: 30, slots: [startsAt] } } });
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ startsAt, name: "Test Guest", email: "guest@example.invalid" });
    expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
    return route.fulfill({ json: { item: { startsAt, confirmation: "fixture-confirmation" } } });
  });
  await guest.goto(new URL("/book/" + slug, page.url()).href);
  await guest.getByLabel("Your name").fill("Test Guest");
  await guest.getByLabel("Your email").fill("guest@example.invalid");
  await guest.getByRole("button", { name: "Confirm booking" }).click();
  await expect(guest.getByRole("status")).toContainText("fixture-confirmation");
  await guest.close();
});
