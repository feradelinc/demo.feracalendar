import React, { useState } from "react";
import { local, pretty } from "../api.js";
import { operation } from "../operations.js";
import { scenario, today, localInstant } from "../../shared/data.js";
import { Field, Json, Notice, Visibility } from "./Common.jsx";
export default function Management({ kind, session, context, run, onContext }) {
  const s = scenario(
      today(),
      "America/New_York",
      session.prefix || "northstar-example",
    ),
    [text, setText] = useState(
      pretty(
        kind === "people"
          ? s.avery
          : kind === "resources"
            ? s.room
            : s.calendar,
      ),
    ),
    [key, setKey] = useState(""),
    [uuid, setUuid] = useState(""),
    [mask, setMask] = useState(15),
    [error, setError] = useState(""),
    [access, setAccess] = useState(null),
    [share, setShare] = useState({
      calendar: context.calendar?.uuid || "",
      person: context.taylor?.uuid || "",
      inviter: context.avery?.uuid || "",
      role: "editor",
    }),
    [user, setUser] = useState("");
  async function call(method, route, params, body) {
    setError("");
    try {
      const payload = {
        operationId: operation(method, route).id,
        params,
        body,
      };
      if (method === "DELETE" || route.endsWith("unshare")) {
        const target = params?.uuid || params?.key || body?.calendar;
        if (!confirm(`Confirm exact target ${target}`)) return;
        payload.confirmation = target;
      }
      const r = await run(() => local("execute", payload));
      if (r.status >= 400 || r.data.success === false)
        throw Error(
          r.data.error?.message || "Operation failed; inspect response",
        );
      if (r.data.uuid) setUuid(r.data.uuid);
      if (kind === "calendars") setAccess(r.data);
      return r;
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <div className="two">
        <section className="panel">
          <div className="eyebrow">{kind.toUpperCase()}</div>
          <h2>
            Create or update{" "}
            {kind === "people"
              ? "a person"
              : kind === "resources"
                ? "a resource"
                : "a calendar"}
          </h2>
          <p>
            {kind === "people"
              ? "Calendar Person is a contact record. Its uuid differs from the optional FerAuth user association. Updates use the same owner-scoped key."
              : kind === "resources"
                ? "Reservable resources are associated with events through the invitation operation. Updates use UUID or owner-scoped key."
                : "Calendar updates use POST with the returned UUID. Visibility masks filter listing; they do not authorize access."}
          </p>
          <Field label="Source-supported mutation JSON">
            <textarea
              rows={12}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          <button
            className="primary"
            onClick={async () => {
              try {
                const body = JSON.parse(text);
                const r = await call("POST", "/api/v1/" + kind, {}, body);
                if (r) {
                  setText(
                    pretty({
                      ...body,
                      ...(kind !== "people" ? { uuid: r.data.uuid } : {}),
                    }),
                  );
                  if (kind === "calendars") onContext({ calendar: r.data });
                }
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Create / update
          </button>
          <button
            onClick={() => {
              setText(
                pretty(
                  kind === "people"
                    ? s.avery
                    : kind === "resources"
                      ? s.room
                      : s.calendar,
                ),
              );
            }}
          >
            Reset fictional example
          </button>
        </section>
        <section className="panel">
          <h2>Retrieve and inspect</h2>
          <Field
            label="Owner-scoped lookup key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          {kind === "calendars" && (
            <Visibility value={mask} onChange={setMask} />
          )}
          <button
            onClick={() =>
              call(
                "GET",
                kind === "calendars"
                  ? "/api/v1/calendars/o/k/{key}/v/{visibility}"
                  : "/api/v1/" + kind + "/o/k/{key}",
                { key, ...(kind === "calendars" ? { visibility: mask } : {}) },
              )
            }
          >
            Retrieve by key
          </button>
          {kind !== "people" && (
            <button
              onClick={() =>
                call(
                  "GET",
                  kind === "calendars"
                    ? "/api/v1/calendars/v/{visibility}"
                    : "/api/v1/resources",
                  kind === "calendars" ? { visibility: mask } : {},
                )
              }
            >
              List {kind}
            </button>
          )}
          <Field
            label="Record UUID"
            value={uuid}
            onChange={(e) => setUuid(e.target.value)}
          />
          {kind === "calendars" && (
            <>
              <button
                onClick={() =>
                  call("GET", "/api/v1/calendars/i/{uuid}", { uuid })
                }
              >
                Get calendar UUID
              </button>
              <button
                onClick={() =>
                  call("GET", "/api/v1/calendars/resolve/{uuid}", { uuid })
                }
              >
                Resolve calendar
              </button>
              <Field
                label="FerAuth user UUID (not Calendar Person UUID)"
                value={user}
                onChange={(e) => setUser(e.target.value)}
              />
              <button
                onClick={() =>
                  call("GET", "/api/v1/calendars/resolve/{uuid}/u/{userUuid}", {
                    uuid,
                    userUuid: user,
                  })
                }
              >
                Resolve effective access
              </button>
              <button
                onClick={() =>
                  call(
                    "GET",
                    "/api/v1/calendars/access/u/{userUuid}/v/{visibility}",
                    { userUuid: user, visibility: mask },
                  )
                }
              >
                List accessible calendars
              </button>
            </>
          )}
          <div className="row">
            <button
              className="danger"
              onClick={() =>
                call("DELETE", "/api/v1/" + kind + "/i/{uuid}", { uuid })
              }
            >
              Delete demo-created UUID
            </button>
            {kind !== "calendars" && (
              <button
                className="danger"
                onClick={() =>
                  call("DELETE", "/api/v1/" + kind + "/k/{key}", { key })
                }
              >
                Delete demo-created key
              </button>
            )}
          </div>
        </section>
      </div>
      {kind === "calendars" && (
        <section className="panel">
          <h2>Sharing & effective access</h2>
          <Notice>
            Supply a real authorized inviter: calendar owner, or a member with
            owner/admin/editor role. The proxy never exposes force. A visibility
            mask alone grants no access.
          </Notice>
          <div className="form-grid">
            {["calendar", "person", "inviter"].map((k) => (
              <Field
                key={k}
                label={k + " UUID"}
                value={share[k]}
                onChange={(e) => setShare({ ...share, [k]: e.target.value })}
              />
            ))}
            <Field label="Sharing role">
              <select
                value={share.role}
                onChange={(e) => setShare({ ...share, role: e.target.value })}
              >
                {["viewer", "editor", "admin"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
          </div>
          <button
            className="primary"
            onClick={() => call("POST", "/api/v1/calendars/share", {}, share)}
          >
            Share / change role
          </button>
          <button
            onClick={() =>
              call(
                "POST",
                "/api/v1/calendars/unshare",
                {},
                { calendar: share.calendar, person: share.person },
              )
            }
          >
            Remove sharing
          </button>
          {access && (
            <>
              <h3>Returned ownership, membership and access</h3>
              <Json value={access} />
            </>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}
export function Availability({ run, session }) {
  const [kind, setKind] = useState("people"),
    [target, setTarget] = useState(""),
    [date, setDate] = useState(today()),
    [start, setStart] = useState("09:00"),
    [end, setEnd] = useState("17:00"),
    [zone, setZone] = useState("America/New_York"),
    [result, setResult] = useState(null),
    [error, setError] = useState("");
  return (
    <section className="panel">
      <div className="eyebrow">FREE / BUSY INSPECTION</div>
      <h2>Who and what is available?</h2>
      <p>
        These routes return available people or resources for an interval. They
        do not return a full busy-slot timeline.
      </p>
      <div className="form-grid">
        <Field label="Entity type">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="people">People</option>
            <option value="resources">Resources</option>
          </select>
        </Field>
        <Field
          label="Focus on person/resource UUID (optional UI filter)"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          list="availability-records"
        />
        <datalist id="availability-records">
          {session.created
            ?.filter((x) => x.group === kind)
            .map((x) => (
              <option key={x.uuid} value={x.uuid}>
                {x.name || x.key}
              </option>
            ))}
        </datalist>
        <Field
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Field
          label="Start time"
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <Field
          label="End time"
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
        <Field
          label="IANA time zone"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
        />
      </div>
      <div className="interval">
        <span>{start}</span>
        <div>Requested interval ? {zone}</div>
        <span>{end}</span>
      </div>
      <button
        className="primary"
        onClick={async () => {
          setError("");
          setResult(null);
          try {
            const startAt = localInstant(date + "T" + start, zone),
              endAt = localInstant(date + "T" + end, zone);
            if (Date.parse(endAt) <= Date.parse(startAt))
              throw Error("End must follow start");
            const r = await run(() =>
              local("execute", {
                operationId: operation(
                  "GET",
                  "/api/v1/" + kind + "/available/s/{startAt}/e/{endAt}",
                ).id,
                params: { startAt, endAt },
              }),
            );
            if (r.status !== 200 || r.data.success === false)
              throw Error("Availability request failed");
            setResult(r.data);
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        Check live availability
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {result && (
        <>
          <Notice>
            The optional focus filter is local presentation of returned records.
            An absent record is not proof of a specific busy interval.
          </Notice>
          <h3>Available {kind} · actual service response</h3>
          <div className="availability-items">
            {(Array.isArray(result.items) ? result.items : [])
              .flat()
              .filter(
                (x) => !target || x.uuid === target || x.ownerKey === target,
              )
              .map((x, i) => (
                <div className="available" key={x.uuid || i}>
                  ✓ {x.displayName || x.name || x.uuid}
                </div>
              ))}
          </div>
          <Json value={result} />
        </>
      )}
    </section>
  );
}
export function Invitations({ context, run }) {
  const [body, setBody] = useState(
      pretty({
        event: context.event?.uuid || "",
        person: context.taylor?.uuid || "",
        resource: "",
        invitedBy: context.avery?.uuid || "",
        status: "accepted",
        role: "req",
        mark: "busy",
        respondedAt: new Date().toISOString(),
      }),
    ),
    [error, setError] = useState("");
  return (
    <section className="panel">
      <h2>Participation & reservations</h2>
      <Notice>
        POST /events/invite creates or updates participation records. It does
        not deliver invitation emails. Person records persist role and
        respondedAt; resource records persist status and mark.
      </Notice>
      <Field label="Invitation JSON">
        <textarea
          rows={13}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <button
        className="primary"
        onClick={async () => {
          try {
            const payload = JSON.parse(body);
            if (!payload.person) delete payload.person;
            if (!payload.resource) delete payload.resource;
            await run(() =>
              local("execute", {
                operationId: operation("POST", "/api/v1/events/invite").id,
                body: payload,
              }),
            );
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        Create / update participation
      </button>
      <button
        onClick={async () => {
          try {
            const { event } = JSON.parse(body);
            await run(() =>
              local("execute", {
                operationId: operation("GET", "/api/v1/events/i/{uuid}").id,
                params: { uuid: event },
              }),
            );
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        Inspect invitees and resources
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
export function History({ context, run }) {
  const [calendar, setCalendar] = useState(context.calendar?.uuid || ""),
    [limit, setLimit] = useState("20"),
    [offset, setOffset] = useState("0"),
    [before, setBefore] = useState(new Date().toISOString()),
    [data, setData] = useState(null),
    [error, setError] = useState("");
  return (
    <section className="panel">
      <h2>Recurrence & event history</h2>
      <Notice>
        Recurrence is a persisted string such as FREQ=WEEKLY;BYDAY=MO;COUNT=6.
        The REST service does not expand occurrences. ?History? lists older
        events by startsAt, not an audit trail of edits. Source supports limit
        (1?100), offset (up to 10000) and before.
      </Notice>
      <div className="form-grid">
        <Field
          label="Calendar UUID"
          value={calendar}
          onChange={(e) => setCalendar(e.target.value)}
        />
        <Field
          label="Limit"
          type="number"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        />
        <Field
          label="Offset"
          type="number"
          value={offset}
          onChange={(e) => setOffset(e.target.value)}
        />
        <Field
          label="Before ISO instant"
          value={before}
          onChange={(e) => setBefore(e.target.value)}
        />
      </div>
      <button
        className="primary"
        onClick={async () => {
          try {
            const r = await run(() =>
              local("execute", {
                operationId: operation(
                  "GET",
                  "/api/v1/events/history/c/{calendar}",
                ).id,
                params: { calendar },
                query: { limit, offset, before },
              }),
            );
            setData(r.data);
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        Retrieve event history
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {data && <Json value={data} />}
    </section>
  );
}
