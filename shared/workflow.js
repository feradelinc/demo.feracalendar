import operations from "./operations.json" with { type: "json" };
import { scenario, shiftDate, localInstant } from "./data.js";
export const restOp = (method, route) =>
  operations.find(
    (o) =>
      o.service === "rest" &&
      o.method === method &&
      o.route === route &&
      !o.internal,
  );
export async function walkthrough({
  execute,
  session,
  date,
  zone = "America/New_York",
  sharedUser,
  onStep = () => {},
  context = {},
  includeCalDAV = false,
}) {
  const sample = scenario(date, zone, session.prefix),
    ctx = { ...context };
  const step = async (name, method, route, payload = {}) => {
    onStep({ name, state: "running" });
    try {
      const request = { operationId: restOp(method, route).id, ...payload };
      const result = await execute(request);
      if (result.status >= 400 || result.data?.success === false)
        throw Error(result.data?.error?.message || `HTTP ${result.status}`);
      onStep({ name, state: "passed", result });
      return result.data;
    } catch (e) {
      onStep({ name, state: "failed", error: e.message });
      throw e;
    }
  };
  const uuid = (v, label) => {
    if (!v?.uuid) throw Error(label + " did not return a UUID");
    return v;
  };
  ctx.avery = uuid(
    await step("Create Avery Morgan", "POST", "/api/v1/people", {
      body: { ...sample.avery, user: session.user },
    }),
    "Avery",
  );
  ctx.taylor = uuid(
    await step("Create Taylor Chen", "POST", "/api/v1/people", {
      body: { ...sample.taylor, ...(sharedUser ? { user: sharedUser } : {}) },
    }),
    "Taylor",
  );
  ctx.room = uuid(
    await step("Create Conference Room A", "POST", "/api/v1/resources", {
      body: sample.room,
    }),
    "Room",
  );
  ctx.vehicle = uuid(
    await step("Create Company Vehicle 1", "POST", "/api/v1/resources", {
      body: sample.vehicle,
    }),
    "Vehicle",
  );
  ctx.calendar = uuid(
    await step("Create Northstar calendar", "POST", "/api/v1/calendars", {
      body: { ...sample.calendar, person: ctx.avery.uuid },
    }),
    "Calendar",
  );
  await step("Update calendar", "POST", "/api/v1/calendars", {
    body: {
      uuid: ctx.calendar.uuid,
      name: sample.calendar.name,
      shared: false,
      person: ctx.avery.uuid,
    },
  });
  await step("Resolve calendar", "GET", "/api/v1/calendars/resolve/{uuid}", {
    params: { uuid: ctx.calendar.uuid },
  });
  await step(
    "Retrieve calendar and owner",
    "GET",
    "/api/v1/calendars/i/{uuid}",
    { params: { uuid: ctx.calendar.uuid } },
  );
  await step("Share with Taylor as editor", "POST", "/api/v1/calendars/share", {
    body: {
      calendar: ctx.calendar.uuid,
      person: ctx.taylor.uuid,
      inviter: ctx.avery.uuid,
      role: "editor",
    },
  });
  await step(
    "Inspect effective owner access",
    "GET",
    "/api/v1/calendars/resolve/{uuid}/u/{userUuid}",
    { params: { uuid: ctx.calendar.uuid, userUuid: session.user } },
  );
  await step(
    "List accessible calendars",
    "GET",
    "/api/v1/calendars/access/u/{userUuid}/v/{visibility}",
    { params: { userUuid: session.user, visibility: 15 } },
  );
  if (sharedUser)
    await step(
      "Inspect Taylor user access",
      "GET",
      "/api/v1/calendars/resolve/{uuid}/u/{userUuid}",
      { params: { uuid: ctx.calendar.uuid, userUuid: sharedUser } },
    );
  else
    onStep({
      name: "Taylor FerAuth user access",
      state: "skipped",
      error:
        "Supply an authorized real shared-user UUID to verify identity-based access; Taylor is currently a Calendar Person only.",
    });
  ctx.event = uuid(
    await step("Create New Client Consultation", "POST", "/api/v1/events", {
      body: {
        ...sample.event,
        calendar: ctx.calendar.uuid,
        creator: ctx.avery.uuid,
      },
    }),
    "Event",
  );
  await step("Invite Taylor", "POST", "/api/v1/events/invite", {
    body: {
      event: ctx.event.uuid,
      person: ctx.taylor.uuid,
      invitedBy: ctx.avery.uuid,
      status: "accepted",
      role: "req",
      mark: "busy",
      respondedAt: new Date().toISOString(),
    },
  });
  await step("Reserve Conference Room A", "POST", "/api/v1/events/invite", {
    body: {
      event: ctx.event.uuid,
      resource: ctx.room.uuid,
      invitedBy: ctx.avery.uuid,
      status: "accepted",
      mark: "busy",
    },
  });
  const read = await step(
    "Read event and associations",
    "GET",
    "/api/v1/events/i/{uuid}",
    { params: { uuid: ctx.event.uuid } },
  );
  if (
    !read.items?.some(
      (e) => e.uuid === ctx.event.uuid && e.title === sample.event.title,
    )
  )
    throw Error("Event read-after-write mismatch");
  await step(
    "Query selected day",
    "GET",
    "/api/v1/events/s/{startAt}/e/{endAt}/c/{calendar}",
    {
      params: {
        calendar: ctx.calendar.uuid,
        startAt: localInstant(date + "T00:00", zone),
        endAt: localInstant(shiftDate(date, 1) + "T00:00", zone),
      },
    },
  );
  await step(
    "Check people availability",
    "GET",
    "/api/v1/people/available/s/{startAt}/e/{endAt}",
    { params: { startAt: sample.event.startsAt, endAt: sample.event.endsAt } },
  );
  await step(
    "Check resource availability",
    "GET",
    "/api/v1/resources/available/s/{startAt}/e/{endAt}",
    { params: { startAt: sample.event.startsAt, endAt: sample.event.endsAt } },
  );
  await step("Update consultation", "POST", "/api/v1/events", {
    body: {
      ...sample.event,
      uuid: ctx.event.uuid,
      title: "New Client Consultation · updated",
      calendar: ctx.calendar.uuid,
      creator: ctx.avery.uuid,
    },
  });
  ctx.weekly = uuid(
    await step("Persist weekly recurrence metadata", "POST", "/api/v1/events", {
      body: {
        ...sample.weekly,
        calendar: ctx.calendar.uuid,
        creator: ctx.avery.uuid,
      },
    }),
    "Weekly",
  );
  const recurring = await step(
    "Verify recurrence persistence",
    "GET",
    "/api/v1/events/i/{uuid}",
    { params: { uuid: ctx.weekly.uuid } },
  );
  if (recurring.items?.[0]?.recurrence !== sample.weekly.recurrence)
    throw Error("Recurrence did not round-trip");
  ctx.reservation = uuid(
    await step("Create Equipment Reservation", "POST", "/api/v1/events", {
      body: {
        ...sample.reservation,
        calendar: ctx.calendar.uuid,
        creator: ctx.avery.uuid,
      },
    }),
    "Reservation",
  );
  await step("Reserve Company Vehicle 1", "POST", "/api/v1/events/invite", {
    body: {
      event: ctx.reservation.uuid,
      resource: ctx.vehicle.uuid,
      invitedBy: ctx.avery.uuid,
      status: "accepted",
      mark: "busy",
    },
  });
  await step(
    "Browse event history",
    "GET",
    "/api/v1/events/history/c/{calendar}",
    {
      params: { calendar: ctx.calendar.uuid },
      query: {
        limit: 20,
        offset: 0,
        before: localInstant(shiftDate(date, 7) + "T00:00", zone),
      },
    },
  );
  if (includeCalDAV) {
    const op = operations.find(
      (o) =>
        o.service === "caldav" &&
        o.method === "PROPFIND" &&
        o.route === "/caldav/calendars/{calendarUuid}",
    );
    const result = await execute({
      operationId: op.id,
      params: { calendarUuid: ctx.calendar.uuid },
      headers: { Depth: "1" },
      body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>',
    });
    onStep({
      name: "CalDAV collection discovery",
      state: result.status === 207 ? "passed" : "failed",
      result,
    });
    if (result.status !== 207) throw Error("CalDAV discovery failed");
  } else
    onStep({
      name: "CalDAV discovery",
      state: "skipped",
      error: "Connect separate CalDAV credentials and enable this step.",
    });
  return ctx;
}
