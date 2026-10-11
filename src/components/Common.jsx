import React, { useState } from "react";
import { pretty, snippets, downloadTrace } from "../api.js";
import { davSummary, parseICS, formattedXML } from "../../shared/protocol.js";
export function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {props.children || <input {...props} />}
    </label>
  );
}
export function Json({ value }) {
  return (
    <pre className="code" tabIndex={0} aria-label="Code and data">
      <code>{pretty(value)}</code>
    </pre>
  );
}
export function Notice({ children }) {
  return <div className="notice">{children}</div>;
}
export function Visibility({ value, onChange }) {
  return (
    <fieldset className="mask">
      <legend>Visibility mask · {value}</legend>
      {Object.entries({ OWNER: 1, MEMBER: 2, AVAILABLE: 4, GLOBAL: 8 }).map(
        ([name, bit]) => (
          <label key={name}>
            <input
              type="checkbox"
              checked={!!(value & bit)}
              onChange={() => onChange(value ^ bit)}
            />
            {name} ({bit})
          </label>
        ),
      )}
    </fieldset>
  );
}
export function Inspector({ result }) {
  const [tab, setTab] = useState("Response");
  if (!result)
    return (
      <div className="empty compact">
        Execute a request to inspect the real response.
      </div>
    );
  const code = snippets(result.request);
  let summary = result.data;
  try {
    if (result.contentType?.includes("xml")) summary = davSummary(result.data);
    else if (result.contentType?.includes("calendar"))
      summary = parseICS(result.data);
  } catch (e) {
    summary = { parseError: e.message };
  }
  return (
    <section className="inspector">
      <div className="row">
        <h3>Request inspector</h3>
        <span className={"badge " + (result.status >= 400 ? "bad" : "")}>
          HTTP {result.status}
        </span>
        <span className="muted">{result.elapsedMs} ms</span>
        <button onClick={() => downloadTrace(result)}>
          Download sanitized trace
        </button>
      </div>
      <div className="tabs">
        {[
          "Response",
          "Structured",
          "Request",
          "Headers",
          "JavaScript",
          "cURL",
        ].map((t) => (
          <button aria-pressed={tab === t} key={t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Response" ? (
        result.status === 204 ? (
          <Notice>204 No Content · empty response body</Notice>
        ) : result.contentType?.includes("xml") ? (
          <pre className="code xml" tabIndex={0} aria-label="XML response">
            <code>
              {(() => {
                let xml;
                try {
                  xml = formattedXML(result.data);
                } catch {
                  xml = result.data;
                }
                return String(xml)
                  .split(/(<[^>]+>)/g)
                  .map((part, index) =>
                    part.startsWith("<") ? (
                      <span className="xml-tag" key={index}>
                        {part}
                      </span>
                    ) : (
                      part
                    ),
                  );
              })()}
            </code>
          </pre>
        ) : (
          <Json value={result.data} />
        )
      ) : tab === "Structured" ? (
        <Json value={summary} />
      ) : tab === "Request" ? (
        <Json value={result.request} />
      ) : tab === "Headers" ? (
        <Json value={result.headers} />
      ) : (
        <>
          <button
            onClick={() =>
              navigator.clipboard.writeText(
                tab === "JavaScript" ? code.js : code.curl,
              )
            }
          >
            Copy {tab}
          </button>
          <Json value={tab === "JavaScript" ? code.js : code.curl} />
        </>
      )}
    </section>
  );
}
