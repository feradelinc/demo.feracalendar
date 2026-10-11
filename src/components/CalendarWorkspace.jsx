import React, { useState, useEffect, useRef } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { local, pretty } from "../api.js";
import { operation } from "../operations.js";
import {
  today,
  viewDates,
  shiftDate,
  rangeFor,
  wallTime,
  localInstant,
  overlaps,
} from "../../shared/data.js";
import { Field, Json, Notice } from "./Common.jsx";
export default function CalendarWorkspace({ session, run, context }) {
  const [date, setDate] = useState(today()),
    [zone, setZone] = useState("America/New_York"),
    [view, setView] = useState("month"),
    [calendars, setCalendars] = useState([]),
    [selected, setSelected] = useState([]),
    [events, setEvents] = useState([]),
    [error, setError] = useState(""),
    [editor, setEditor] = useState(null),
    [json, setJson] = useState(false),
    [raw, setRaw] = useState(""),
    [busy, setBusy] = useState(false);
  const dates = viewDates(date, view),
    loadSequence = useRef(0);
  useEffect(() => {
    if (context.calendar)
      setCalendars((c) =>
        c.some((x) => x.uuid === context.calendar?.uuid)
          ? c
          : [...c, context.calendar],
      );
    if (context.calendar) setSelected([context.calendar?.uuid]);
  }, [context.calendar]);
  useEffect(() => {
    if (session.authenticated && selected.length) load();
  }, [date, view, zone]);
  async function load() {
    const sequence = ++loadSequence.current;
    setError("");
    setEvents([]);
    setBusy(true);
    try {
      let cs = calendars;
      if (!cs.length) {
        const r = await run(() =>
          local("execute", {
            operationId: operation(
              "GET",
              "/api/v1/calendars/access/u/{userUuid}/v/{visibility}",
            ).id,
            params: { userUuid: session.user, visibility: 15 },
          }),
        );
        if (r.status !== 200 || r.data.success === false)
          throw Error("Calendar listing failed");
        cs = r.data.items || [];
        setCalendars(cs);
      }
      const ids = selected.length
        ? selected
        : cs.slice(0, 1).map((c) => c.uuid);
      setSelected(ids);
      const range = rangeFor(date, view, zone),
        all = [];
      for (const calendar of ids) {
        const r = await run(() =>
          local("execute", {
            operationId: operation(
              "GET",
              "/api/v1/events/s/{startAt}/e/{endAt}/c/{calendar}",
            ).id,
            params: { ...range, calendar },
          }),
        );
        if (r.status !== 200 || r.data.success === false)
          throw Error("Event query failed");
        all.push(...(r.data.items || []));
      }
      if (sequence === loadSequence.current)
        setEvents([...new Map(all.map((x) => [x.uuid, x])).values()]);
    } catch (e) {
      if (sequence === loadSequence.current) setError(e.message);
    } finally {
      if (sequence === loadSequence.current) setBusy(false);
    }
  }
  function edit(e, day = date) {
    const record = e
      ? {
          ...e,
          calendar: e.calendar?.uuid || e.calendarUuid,
          creator: e.createdBy?.uuid || e.createdByUuid || context.avery?.uuid,
        }
      : {
          calendar: selected[0] || context.calendar?.uuid || "",
          creator: context.avery?.uuid || "",
          title: "New Client Consultation",
          description: "",
          location: "",
          startsAt: localInstant(day + "T10:00", zone),
          endsAt: localInstant(day + "T11:00", zone),
          status: "confirmed",
          style: "event",
          allDay: false,
          recurrence: null,
        };
    const input = Object.fromEntries(
      [
        "uuid",
        "calendar",
        "creator",
        "title",
        "description",
        "location",
        "startsAt",
        "endsAt",
        "status",
        "style",
        "allDay",
        "recurrence",
      ]
        .filter((k) => record[k] !== undefined)
        .map((k) => [k, record[k]]),
    );
    setEditor({
      ...input,
      startWall: wallTime(input.startsAt, zone),
      endWall: wallTime(input.endsAt, zone),
      person: "",
      resource: "",
      disambiguation: "reject",
    });
    setRaw(pretty(input));
    setJson(false);
  }
  async function save(e) {
    e.preventDefault();
    setError("");
    try {
      let body;
      if (json) body = JSON.parse(raw);
      else {
        const {
          startWall,
          endWall,
          person,
          resource,
          disambiguation,
          ...rest
        } = editor;
        body = {
          ...rest,
          startsAt: localInstant(
            rest.allDay ? startWall.slice(0, 10) + "T00:00" : startWall,
            zone,
            disambiguation,
          ),
          endsAt: localInstant(
            rest.allDay ? endWall.slice(0, 10) + "T00:00" : endWall,
            zone,
            disambiguation,
          ),
        };
      }
      const r = await run(() =>
        local("execute", {
          operationId: operation("POST", "/api/v1/events").id,
          body,
        }),
      );
      if (r.status !== 200 || r.data.success === false)
        throw Error(r.data.error?.message || "Event save failed");
      if (!json)
        for (const target of ["person", "resource"])
          if (editor[target]) {
            const invite = await run(() =>
              local("execute", {
                operationId: operation("POST", "/api/v1/events/invite").id,
                body: {
                  event: r.data.uuid,
                  [target]: editor[target],
                  invitedBy: body.creator,
                  status: "accepted",
                  mark: "busy",
                },
              }),
            );
            if (invite.status !== 200 || invite.data.success === false)
              throw Error("Event saved; association failed. Inspect response.");
          }
      setEditor(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  const zones = Array.from(
    new Set([
      "America/New_York",
      "UTC",
      "America/Chicago",
      "America/Los_Angeles",
      "Europe/London",
      "Asia/Tokyo",
      ...(Intl.supportedValuesOf?.("timeZone") || []),
    ]),
  );
  return (
    <>
      <section className="panel calendar-panel">
        <div className="row calendar-toolbar">
          <div>
            <div className="eyebrow">YOUR LIVE SCHEDULE</div>
            <h2>
              {new Intl.DateTimeFormat("en", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(date + "T12:00Z"))}
            </h2>
          </div>
          <button
            aria-label="Previous period"
            onClick={() =>
              setDate(
                view === "month"
                  ? Temporal.PlainDate.from(date)
                      .subtract({ months: 1 })
                      .toString()
                  : shiftDate(date, view === "week" ? -7 : -1),
              )
            }
          >
            ‹
          </button>
          <button onClick={() => setDate(today(zone))}>Today</button>
          <button
            aria-label="Next period"
            onClick={() =>
              setDate(
                view === "month"
                  ? Temporal.PlainDate.from(date).add({ months: 1 }).toString()
                  : shiftDate(date, view === "week" ? 7 : 1),
              )
            }
          >
            ›
          </button>
          <Field
            label="Selected date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Field label="Time zone">
            <select value={zone} onChange={(e) => setZone(e.target.value)}>
              {zones.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="row">
          <div className="tabs">
            {["month", "week", "day", "agenda"].map((v) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={!session.authenticated || busy}>
            {busy ? "Loading..." : "Load live calendar"}
          </button>
          <button
            className="primary"
            onClick={() => edit()}
            disabled={!session.authenticated}
          >
            + New event
          </button>
        </div>
        {calendars.length > 0 && (
          <fieldset className="calendar-select">
            <legend>Calendars</legend>
            {calendars.map((c, i) => (
              <label key={c.uuid}>
                <input
                  type="checkbox"
                  checked={selected.includes(c.uuid)}
                  onChange={() =>
                    setSelected(
                      selected.includes(c.uuid)
                        ? selected.filter((x) => x !== c.uuid)
                        : [...selected, c.uuid],
                    )
                  }
                />
                <span
                  className="dot"
                  style={{
                    background: ["#087f74", "#6b4ce6", "#b05a13"][i % 3],
                  }}
                />
                {c.name}
              </label>
            ))}
          </fieldset>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!session.authenticated && (
          <Notice>
            Sign in, then load calendars or run the Northstar demonstration.
            This workspace never substitutes sample events for failed API
            requests.
          </Notice>
        )}
        <div className={"calendar " + view}>
          {view === "month" &&
            ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div className="weekday" key={d}>
                {d}
              </div>
            ))}
          {dates.map((day) => {
            const range = {
              startAt: localInstant(day + "T00:00", zone, "compatible"),
              endAt: localInstant(
                shiftDate(day, 1) + "T00:00",
                zone,
                "compatible",
              ),
            };
            const items = events.filter((e) =>
              overlaps(e, range.startAt, range.endAt),
            );
            return (
              <div
                className={"day-cell " + (day === today(zone) ? "today" : "")}
                key={day}
              >
                <button
                  className="day-number"
                  aria-label={"Create event on " + day}
                  onClick={() => edit(null, day)}
                >
                  {view === "month" ? Number(day.slice(-2)) : day}
                </button>
                {items.map((e) => (
                  <button
                    className="event"
                    key={e.uuid}
                    style={{
                      borderLeftColor: ["#087f74", "#6b4ce6", "#b05a13"][
                        Math.max(
                          0,
                          calendars.findIndex(
                            (c) =>
                              c.uuid === (e.calendar?.uuid || e.calendarUuid),
                          ),
                        ) % 3
                      ],
                    }}
                    onClick={() => edit(e)}
                  >
                    <small>
                      {e.allDay
                        ? "All day"
                        : new Intl.DateTimeFormat("en", {
                            hour: "numeric",
                            minute: "2-digit",
                            timeZone: zone,
                          }).format(new Date(e.startsAt))}
                    </small>
                    <b>{e.title || "Untitled event"}</b>
                  </button>
                ))}
                {view === "agenda" && !items.length && (
                  <span className="muted">No returned events</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="muted">
          {events.length} returned events · {zone}. Range queries use endsAt
          &gt; start and startsAt &lt; end. Recurrence metadata is shown without
          local occurrence expansion.
        </p>
      </section>
      {editor && (
        <section className="panel event-editor">
          <div className="row">
            <h2>{editor.uuid ? "Event details & editing" : "Create event"}</h2>
            <button onClick={() => setEditor(null)}>Close editor</button>
            <button onClick={() => setJson(!json)}>
              {json ? "Visual editor" : "Raw JSON editor"}
            </button>
          </div>
          <Notice>
            Only events in demo-created calendars can be written. All-day input
            uses local midnight with an exclusive end date.
            Ambiguous/nonexistent daylight-saving times are rejected by default.
          </Notice>
          <form onSubmit={save}>
            {json ? (
              <Field label="Event JSON">
                <textarea
                  rows={14}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                />
              </Field>
            ) : (
              <>
                <div className="form-grid">
                  {[
                    "calendar",
                    "creator",
                    "title",
                    "description",
                    "location",
                  ].map((k) => (
                    <Field
                      label={
                        k === "calendar"
                          ? "Calendar UUID"
                          : k === "creator"
                            ? "Creator person UUID"
                            : k
                      }
                      key={k}
                      value={editor[k] || ""}
                      onChange={(e) =>
                        setEditor({ ...editor, [k]: e.target.value })
                      }
                    />
                  ))}
                  <Field
                    label="Start local date/time"
                    type="datetime-local"
                    value={editor.startWall}
                    onChange={(e) =>
                      setEditor({ ...editor, startWall: e.target.value })
                    }
                  />
                  <Field
                    label="End local date/time"
                    type="datetime-local"
                    value={editor.endWall}
                    onChange={(e) =>
                      setEditor({ ...editor, endWall: e.target.value })
                    }
                  />
                  <Field label="Daylight-saving disambiguation">
                    <select
                      value={editor.disambiguation}
                      onChange={(e) =>
                        setEditor({ ...editor, disambiguation: e.target.value })
                      }
                    >
                      <option value="reject">
                        Reject ambiguous or nonexistent time
                      </option>
                      <option value="earlier">
                        Explicitly choose earlier instant
                      </option>
                      <option value="later">
                        Explicitly choose later instant
                      </option>
                    </select>
                  </Field>
                  <Field label="Event status">
                    <select
                      value={editor.status}
                      onChange={(e) =>
                        setEditor({ ...editor, status: e.target.value })
                      }
                    >
                      {["tentative", "confirmed", "cancelled"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Event style">
                    <select
                      value={editor.style}
                      onChange={(e) =>
                        setEditor({ ...editor, style: e.target.value })
                      }
                    >
                      {[
                        "event",
                        "todo",
                        "journal",
                        "block",
                        "alarm",
                        "holiday",
                      ].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Recurrence string (persisted metadata)"
                    value={editor.recurrence || ""}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        recurrence: e.target.value || null,
                      })
                    }
                  />
                  <Field
                    label="Associate person UUID"
                    value={editor.person}
                    onChange={(e) =>
                      setEditor({ ...editor, person: e.target.value })
                    }
                  />
                  <Field
                    label="Associate resource UUID"
                    value={editor.resource}
                    onChange={(e) =>
                      setEditor({ ...editor, resource: e.target.value })
                    }
                  />
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={editor.allDay}
                    onChange={(e) =>
                      setEditor({ ...editor, allDay: e.target.checked })
                    }
                  />{" "}
                  All-day event
                </label>
              </>
            )}
            <div className="row">
              <button className="primary">
                Save through POST /api/v1/events
              </button>
              {editor.uuid && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const result = await run(() =>
                        local("execute", {
                          operationId: operation(
                            "GET",
                            "/api/v1/events/i/{uuid}",
                          ).id,
                          params: { uuid: editor.uuid },
                        }),
                      );
                      setRaw(pretty(result.data.items?.[0] || result.data));
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  Inspect source event
                </button>
              )}
            </div>
          </form>
          <details>
            <summary>Source data and JSON mapping</summary>
            <Json value={raw} />
          </details>
        </section>
      )}
    </>
  );
}
