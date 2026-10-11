import React, { useState } from "react";
import { local, saveText } from "../api.js";
import { davOperation } from "../operations.js";
import { sampleICS, xmlExamples, parseICS } from "../../shared/protocol.js";
import { scenario, today } from "../../shared/data.js";
import Explorer from "./Explorer.jsx";
import { Field, Notice, Json } from "./Common.jsx";
export default function CalDAVLab({ config, session, context, run, refresh }) {
  const [username, setUser] = useState(""),
    [password, setPassword] = useState(""),
    [instance, setInstance] = useState(
      session.instance || config.instance || "",
    ),
    [calendar, setCalendar] = useState(context.calendar?.uuid || ""),
    [file, setFile] = useState(
      (context.event?.uuid || crypto.randomUUID()) + ".ics",
    ),
    [ics, setICS] = useState(
      sampleICS(file.slice(0, -4), scenario(today()).event),
    ),
    [etag, setETag] = useState(""),
    [oldETag, setOld] = useState(""),
    [error, setError] = useState(""),
    [template, setTemplate] = useState(""),
    [parsed, setParsed] = useState(null);
  async function connect(e) {
    e.preventDefault();
    setError("");
    try {
      const r = await run(() =>
        local("caldav/connect", { username, password, instance }),
      );
      if (r.status !== 207)
        throw Error("CalDAV credentials not accepted; inspect response");
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setPassword("");
    }
  }
  async function execute(method, tag) {
    setError("");
    try {
      const payload = {
        operationId: davOperation(
          method,
          "/caldav/calendars/{calendarUuid}/{path}",
        ).id,
        params: { calendarUuid: calendar, path: file },
        ...(method === "PUT" ? { body: ics } : {}),
      };
      if (tag) payload.headers = { "If-Match": tag };
      if (method === "DELETE") {
        if (
          !confirm(
            "Conditionally delete exact demo-created resource " + file + "?",
          )
        )
          return;
        payload.confirmation = file;
      }
      const r = await run(() => local("execute", payload));
      if (r.status >= 400) {
        if (r.status === 412)
          setError("412 conflict: refresh the event and reapply your change.");
        else setError("HTTP " + r.status + "; inspect actual response.");
        return;
      }
      if (method === "GET") {
        setICS(r.data);
        setETag(r.headers.etag || "");
        setParsed(parseICS(r.data));
      }
      if (method === "PUT") {
        setOld(etag);
        setETag(r.headers.etag || "");
      }
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <div className="two">
        <section className="panel">
          <div className="eyebrow">CALDAV · SEPARATE AUTHENTICATION</div>
          <h2>Connect a protocol session</h2>
          <p>{config.caldav} · HTTP Basic</p>
          <form onSubmit={connect}>
            <Field
              label="CalDAV instance UUID"
              value={instance}
              onChange={(e) => setInstance(e.target.value)}
              required
            />
            <Field
              label="CalDAV username"
              value={username}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="off"
              required
            />
            <Field
              label="CalDAV password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              required
            />
            <button className="primary">Verify & connect CalDAV</button>
          </form>
          <button
            onClick={async () => {
              await local("caldav/disconnect", {});
              await refresh();
            }}
          >
            Disconnect CalDAV
          </button>
          <Notice>
            Credentials stay in the protected server session. OPTIONS may report
            capabilities without authentication; a PROPFIND response is used to
            verify credentials.
          </Notice>
        </section>
        <section className="panel">
          <h2>Discovery & REPORT recipes</h2>
          <p>
            Select the canonical route below. Preserve collection trailing
            slashes and use Depth 0, 1 or infinity according to the actual
            adapter behavior.
          </p>
          <div className="row">
            {["propfind", "query", "multiget", "sync"].map((k) => (
              <button
                key={k}
                onClick={() =>
                  setTemplate(
                    k === "multiget"
                      ? xmlExamples.multiget(
                          "/caldav/calendars/" + calendar + "/" + file,
                        )
                      : xmlExamples[k],
                  )
                }
              >
                {k === "query"
                  ? "calendar-query"
                  : k === "multiget"
                    ? "calendar-multiget"
                    : k === "sync"
                      ? "sync-collection"
                      : "PROPFIND"}
              </button>
            ))}
          </div>
          {template && (
            <>
              <Field label="XML recipe (copy into explorer)">
                <textarea
                  rows={8}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                />
              </Field>
              <button onClick={() => navigator.clipboard.writeText(template)}>
                Copy XML recipe
              </button>
            </>
          )}
          <Notice>
            sync-collection currently returns a snapshot and a synthesized sync
            token. It does not consume a prior token to provide incremental
            changes or deletion tombstones.
          </Notice>
        </section>
      </div>
      <section className="panel">
        <h2>iCalendar & ETag conflict laboratory</h2>
        <div className="form-grid">
          <Field
            label="Calendar UUID"
            value={calendar}
            onChange={(e) => setCalendar(e.target.value)}
          />
          <Field
            label="Event UUID.ics filename"
            value={file}
            onChange={(e) => setFile(e.target.value)}
          />
          <Field
            label="Current ETag"
            value={etag}
            onChange={(e) => setETag(e.target.value)}
          />
        </div>
        <Field label="Complete iCalendar document">
          <textarea
            rows={14}
            spellCheck="false"
            value={ics}
            onChange={(e) => setICS(e.target.value)}
          />
        </Field>
        <div className="row">
          <button onClick={() => execute("GET")}>
            1 · GET / refresh + capture ETag
          </button>
          <button
            onClick={() => {
              const uuid = crypto.randomUUID();
              setFile(uuid + ".ics");
              setICS(sampleICS(uuid, scenario(today()).event));
              setETag("");
            }}
          >
            New fictional ICS resource
          </button>
          <button className="primary" onClick={() => execute("PUT", etag)}>
            2 · PUT with current If-Match
          </button>
          <button disabled={!oldETag} onClick={() => execute("PUT", oldETag)}>
            3 · PUT with previous ETag
          </button>
          <button
            className="danger"
            disabled={!etag}
            onClick={() => execute("DELETE", etag)}
          >
            Conditional DELETE
          </button>
          <button onClick={() => saveText(ics, file, "text/calendar")}>
            Export ICS
          </button>
          <button
            onClick={() => {
              try {
                setParsed(parseICS(ics));
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Parse VEVENT
          </button>
        </div>
        <Notice>
          For a stale-ETag demonstration: GET, change SUMMARY, PUT with current
          ETag, then change SUMMARY again and PUT with the previous ETag. A real
          adapter 412 appears in the inspector. GET again to resolve. Writes
          require a REST demo-created calendar.
        </Notice>
        {parsed && <Json value={parsed} />}
        <p className="muted">
          The proxy validates UID/filename and normalizes line endings to CRLF.
          Use UTC ICS timestamps; the current adapter ignores TZID for floating
          date-times.
        </p>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <h2>Protocol explorer · every registered variant</h2>
      <Explorer service="caldav" session={session} run={run} />
    </>
  );
}
