import React, { useState } from "react";
import { walkthrough, restOp } from "../../shared/workflow.js";
import { today } from "../../shared/data.js";
import { local } from "../api.js";
import { Field, Notice, Inspector } from "./Common.jsx";
export default function Walkthrough({ session, run, onContext, refresh }) {
  const [date, setDate] = useState(today()),
    [zone, setZone] = useState("America/New_York"),
    [user, setUser] = useState(""),
    [steps, setSteps] = useState([]),
    [busy, setBusy] = useState(false),
    [dav, setDav] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(null);
  async function start() {
    setSteps([]);
    setError("");
    setBusy(true);
    try {
      const context = await walkthrough({
        session,
        date,
        zone,
        sharedUser: user,
        includeCalDAV: dav,
        execute: (p) => run(() => local("execute", p)),
        onStep: (s) =>
          setSteps((old) => {
            const i = old.findIndex((x) => x.name === s.name);
            return i < 0 ? [...old, s] : old.map((x, n) => (n === i ? s : x));
          }),
      });
      onContext(context);
    } catch (e) {
      setError(e.message);
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  async function cleanup() {
    const records = (await local("session")).created.filter((r) =>
      ["events", "calendars", "resources", "people"].includes(r.group),
    );
    if (
      !confirm(
        "Delete only this session?s created records?\n" +
          records.map((r) => r.uuid).join("\n"),
      )
    )
      return;
    setBusy(true);
    try {
      for (const group of ["events", "calendars", "resources", "people"])
        for (const record of records.filter((r) => r.group === group)) {
          const route = "/api/v1/" + group + "/i/{uuid}";
          const r = await run(() =>
            local("execute", {
              operationId: restOp("DELETE", route).id,
              params: { uuid: record.uuid },
              confirmation: record.uuid,
            }),
          );
          if (r.status !== 200 || r.data.success === false)
            throw Error("Cleanup stopped at " + record.uuid);
        }
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <div className="eyebrow">NORTHSTAR CONSULTING · CALENDAR DEMO</div>
        <h2>A complete Calendar workflow</h2>
        <p>
          Create fictional contacts, shared calendars and reservations. Each
          step uses real returned identifiers. The run stops on an upstream
          error; created records remain available for inspection.
        </p>
        <div className="form-grid">
          <Field
            label="Demo date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Field
            label="IANA time zone"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
          />
          <Field
            label="Authorized shared FerAuth user UUID (optional)"
            value={user}
            onChange={(e) => setUser(e.target.value)}
          />
        </div>
        <label>
          <input
            type="checkbox"
            checked={dav}
            disabled={!session.caldavConnected}
            onChange={(e) => setDav(e.target.checked)}
          />{" "}
          Include separately authenticated CalDAV discovery
        </label>
        <div className="row">
          <button
            className="primary"
            disabled={!session.authenticated || busy}
            onClick={start}
          >
            {busy ? "Running demonstration..." : "Run full demonstration"}
          </button>
          <button
            className="danger"
            disabled={busy || !session.authenticated}
            onClick={cleanup}
          >
            Clean up session-created records
          </button>
        </div>
        <Notice>
          Calendar Person identifiers are distinct from FerAuth users. Avery is
          associated with your signed-in user; Taylor?s identity-based access is
          optional until you supply an authorized shared user. Recurrence is
          metadata, and history is older event data.
        </Notice>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <ol className="workflow">
          {steps.map((s) => (
            <li key={s.name} className={s.state}>
              <button onClick={() => setSelected(s.result || null)}>
                <span>
                  {s.state === "passed"
                    ? "\u2713"
                    : s.state === "failed"
                      ? "!"
                      : s.state === "running"
                        ? "..."
                        : "-"}
                </span>
                <b>{s.name}</b>
                <small>
                  {s.state}
                  {s.result
                    ? " · HTTP " +
                      s.result.status +
                      " · " +
                      s.result.elapsedMs +
                      " ms"
                    : ""}
                </small>
              </button>
              {s.error && <p>{s.error}</p>}
            </li>
          ))}
        </ol>
      </section>
      {selected && <Inspector result={selected} />}
    </>
  );
}
