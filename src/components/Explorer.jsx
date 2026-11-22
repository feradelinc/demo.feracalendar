import React, { useState, useEffect } from "react";
import operations from "../../shared/operations.json" with { type: "json" };
import { local, pretty } from "../api.js";
import { scenario, today } from "../../shared/data.js";
import { xmlExamples, sampleICS } from "../../shared/protocol.js";
import { Field, Json, Notice } from "./Common.jsx";
export default function Explorer({
  service = "rest",
  session,
  run,
  selection,
}) {
  const ops = operations.filter((o) => !o.internal && o.service === service),
    [search, setSearch] = useState(""),
    [id, setId] = useState(selection || ops[0].id),
    [params, setParams] = useState({}),
    [query, setQuery] = useState({}),
    [headers, setHeaders] = useState({}),
    [body, setBody] = useState("{}"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const op = ops.find((o) => o.id === id) || ops[0];
  useEffect(() => {
    const params = {};
    const eventUuid = op.method === "PUT" ? crypto.randomUUID() : "";
    for (const p of op.parameters.filter((p) => p.in === "path"))
      params[p.name] =
        p.name === "visibility"
          ? "15"
          : p.name === "instance"
            ? session.instance || ""
            : p.name === "path"
              ? op.method === "PUT"
                ? eventUuid + ".ics"
                : ["GET", "DELETE"].includes(op.method)
                ? ""
                : "events"
              : p.name === "startAt"
                ? new Date().toISOString()
                : p.name === "endAt"
                  ? new Date(Date.now() + 86400000).toISOString()
                  : "";
    setParams(params);
    setQuery({});
    setHeaders(
      !op.discoveryRedirect && ["REPORT", "PROPFIND"].includes(op.method) ? { Depth: "0" } : {},
    );
    const s = scenario(
      today(),
      "America/New_York",
      session.prefix || "northstar-example",
    );
    const nextDay = new Date(Date.now() + 86_400_000).toISOString();
    const value =
      op.retail
        ? {
            ...op.example,
            ...(op.example.dueAt ? { dueAt: nextDay } : {}),
            ...(op.example.startsAt ? { startsAt: nextDay, requestId: crypto.randomUUID() } : {}),
            ...(op.example.slots ? { slots: [nextDay] } : {}),
          }
        : op.group === "people"
        ? s.avery
        : op.group === "resources"
          ? s.room
          : op.group === "calendars"
            ? op.route.endsWith("/share")
              ? { calendar: "", person: "", inviter: "", role: "editor" }
              : op.route.endsWith("/unshare")
                ? { calendar: "", person: "" }
                : s.calendar
            : op.group === "events"
              ? op.route.endsWith("/invite")
                ? {
                    event: "",
                    person: "",
                    invitedBy: "",
                    status: "accepted",
                    role: "req",
                    mark: "",
                    respondedAt: new Date().toISOString(),
                  }
                : { ...s.event, calendar: "", creator: "" }
              : {};
    setBody(
      service === "caldav"
        ? op.method === "REPORT"
          ? xmlExamples.query
          : op.method === "PROPFIND" && !op.discoveryRedirect
            ? xmlExamples.propfind
            : op.method === "PUT"
              ? sampleICS(eventUuid, s.event)
              : ""
        : pretty(value),
    );
  }, [op.id, session.prefix, session.instance]);
  useEffect(() => {
    if (selection) setId(selection);
  }, [selection]);
  async function execute(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = {
        operationId: op.id,
        params,
        query,
        headers,
        ...(op.schema || (!op.discoveryRedirect && ["PUT", "REPORT", "PROPFIND"].includes(op.method))
          ? { body: service === "rest" ? JSON.parse(body) : body }
          : {}),
      };
      if (op.method === "DELETE" || op.route.endsWith("/unshare")) {
        const target =
          params.uuid || params.key || params.path || payload.body?.calendar;
        if (
          !window.confirm(
            `Confirm ${op.method} for exact target ${target}.`,
          )
        )
          return;
        payload.confirmation = target;
      }
      await run(() => local("execute", payload));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="explorer">
      <section className="panel operation-list">
        <Field
          label="Search operations"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Method, path, description?"
        />
        <p className="muted">
          {ops.length} executable registrations · canonical routes
        </p>
        {ops
          .filter((o) =>
            (o.method + " " + o.route + " " + o.summary)
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((o) => (
            <button
              className={op.id === o.id ? "selected" : ""}
              key={o.id}
              onClick={() => setId(o.id)}
            >
              <span className={"method " + o.method.toLowerCase()}>
                {o.method}
              </span>
              <span>{o.route}</span>
            </button>
          ))}
      </section>
      <section className="panel">
        <div className="row">
          <span className={"method " + op.method.toLowerCase()}>
            {op.method}
          </span>
          <code className="route">{op.route}</code>
        </div>
        <h2>{op.summary}</h2>
        <p>
          {op.auth} · {op.permission}
        </p>
        {op.conditions.map((c) => (
          <Notice key={c}>{c}</Notice>
        ))}
        <form onSubmit={execute}>
          <div className="form-grid">
            {op.parameters
              .filter((p) => p.in === "path")
              .map((p) => (
                <Field
                  key={p.name}
                  label={p.name + " · required path"}
                  value={params[p.name] || ""}
                  onChange={(e) =>
                    setParams({ ...params, [p.name]: e.target.value })
                  }
                  required
                />
              ))}
            {op.parameters
              .filter((p) => p.in === "query")
              .map((p) => (
                <Field
                  key={p.name}
                  label={p.name + " · optional query"}
                  value={query[p.name] || ""}
                  onChange={(e) =>
                    setQuery({ ...query, [p.name]: e.target.value })
                  }
                />
              ))}
          </div>
          {service === "caldav" && (
            <>
              {!op.discoveryRedirect && ["PROPFIND", "REPORT"].includes(op.method) && <Field label="Depth">
                <select
                  value={headers.Depth || "0"}
                  onChange={(e) =>
                    setHeaders({ ...headers, Depth: e.target.value })
                  }
                >
                  <option>0</option>
                  <option>1</option>
                  <option>infinity</option>
                </select>
              </Field>}
              {["PUT", "DELETE"].includes(op.method) && (
                <Field
                  label="If-Match ETag"
                  value={headers["If-Match"] || ""}
                  onChange={(e) =>
                    setHeaders({ ...headers, "If-Match": e.target.value })
                  }
                />
              )}
              {op.method === "PUT" && (
                <Field
                  label="If-None-Match"
                  placeholder="* creates a new event only"
                  value={headers["If-None-Match"] || ""}
                  onChange={(e) =>
                    setHeaders({ ...headers, "If-None-Match": e.target.value })
                  }
                />
              )}
            </>
          )}
          {(op.schema || ["PUT", "PROPFIND", "REPORT"].includes(op.method)) && (
            <Field
              label={
                service === "rest" ? "Request JSON" : "Protocol request body"
              }
            >
              <textarea
                spellCheck="false"
                rows={13}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </Field>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Executing..." : "Execute operation"}
          </button>
        </form>
        {op.schema && (
          <details>
            <summary>Source-audited body schema</summary>
            <Json value={op.schema} />
          </details>
        )}
        <p className="muted">
          Source: {op.source.route} · {op.source.handler}
        </p>
        <p className="muted">
          Declared response statuses: {op.responses.join(", ")}. Inspect the
          actual result; runtime errors may differ.
        </p>
      </section>
    </div>
  );
}
