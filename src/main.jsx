import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { local } from "./api.js";
import { Inspector, Json, Notice } from "./components/Common.jsx";
import GettingStarted from "./components/GettingStarted.jsx";
import CalendarWorkspace from "./components/CalendarWorkspace.jsx";
import Management, {
  Availability,
  Invitations,
  History,
} from "./components/Management.jsx";
import Walkthrough from "./components/Walkthrough.jsx";
import Explorer from "./components/Explorer.jsx";
import CalDAVLab from "./components/CalDAVLab.jsx";
import operations from "../shared/operations.json" with { type: "json" };
import Icon from "./components/Icon.jsx";
const pages = [
  ["Calendar", "calendar"],
  ["Getting started", "connect"],
  ["Full demonstration", "play"],
  ["Calendars & sharing", "share"],
  ["People", "person"],
  ["Resources", "box"],
  ["Invitations", "mail"],
  ["Availability", "clock"],
  ["Recurrence & history", "history"],
  ["API explorer", "code"],
  ["CalDAV laboratory", "sync"],
  ["Contracts & boundaries", "book"],
];

function App() {
  const [page, setPage] = useState("Calendar"),
    [config, setConfig] = useState(null),
    [session, setSession] = useState({ authenticated: false }),
    [context, setContext] = useState({}),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [running, setRunning] = useState(false);
  async function refresh() {
    setSession(await local("session"));
  }
  useEffect(() => {
    Promise.all([local("config"), refresh()])
      .then(([c]) => setConfig(c))
      .catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, []);
  async function run(fn) {
    setRunning(true);
    setError("");
    try {
      const r = await fn();
      setResult(r);
      await refresh();
      return r;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setRunning(false);
    }
  }
  const props = {
    config,
    session,
    context,
    run,
    refresh,
    onContext: (value) => setContext((c) => ({ ...c, ...value })),
  };
  return (
    <div className="shell">
      <aside>
        <a
          className="brand"
          href="#calendar"
          onClick={() => setPage("Calendar")}
        >
          <img src="/assets/cal-logo.svg" alt="FeraCal" />
        </a>
        <div className="studio-label">DEVELOPER STUDIO</div>
        <nav aria-label="Workspaces">
          {pages.map(([label, icon]) => (
            <button
              key={label}
              className={page === label ? "active" : ""}
              aria-current={page === label ? "page" : undefined}
              onClick={() => {
                setPage(label);
                setError("");
              }}
            >
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="live-dot" /> LIVE API MODE
          <p>
            30 REST operations
            <br />
            30 CalDAV registrations
          </p>
          <img src="/assets/feradel.svg" alt="Feradel" />
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <span className="breadcrumb">FeraCalendar / Developer Studio</span>
            <h1>{page}</h1>
          </div>
          <div className="connection">
            <span
              className={
                "status-dot " + (session.authenticated ? "connected" : "")
              }
            />
            <span>
              {session.authenticated ? "REST connected" : "Not authenticated"}
            </span>
            {session.caldavConnected && (
              <span className="badge">CalDAV connected</span>
            )}
            {session.authenticated || session.caldavConnected ? (
              <button
                onClick={async () => {
                  await local("logout", {});
                  setContext({});
                  setResult(null);
                  await refresh();
                  setPage("Getting started");
                }}
              >
                Logout
              </button>
            ) : (
              <button onClick={() => setPage("Getting started")}>
                Connect account
              </button>
            )}
          </div>
        </header>
        <div className="content">
          {error && (
            <p className="error global-error" role="alert">
              {error}
            </p>
          )}
          {!config ? (
            <Notice>Loading local configuration...</Notice>
          ) : (
            <>
              {page === "Calendar" && <CalendarWorkspace {...props} />}{" "}
              {page === "Getting started" && <GettingStarted {...props} />}{" "}
              {page === "Full demonstration" && <Walkthrough {...props} />}{" "}
              {page === "Calendars & sharing" && (
                <Management key="calendars" kind="calendars" {...props} />
              )}{" "}
              {page === "People" && (
                <Management key="people" kind="people" {...props} />
              )}{" "}
              {page === "Resources" && (
                <Management key="resources" kind="resources" {...props} />
              )}{" "}
              {page === "Invitations" && <Invitations {...props} />}{" "}
              {page === "Availability" && <Availability {...props} />}{" "}
              {page === "Recurrence & history" && <History {...props} />}{" "}
              {page === "API explorer" && <Explorer {...props} />}{" "}
              {page === "CalDAV laboratory" && <CalDAVLab {...props} />}{" "}
              {page === "Contracts & boundaries" && (
                <section className="panel">
                  <div className="eyebrow">SOURCE-AUDITED CONTRACTS</div>
                  <h2>Public capabilities. Explicit boundaries.</h2>
                  <p>
                    All canonical public operations have executable support.
                    Implementation coverage is distinct from live API
                    qualification. Deprecated aliases are intentionally
                    excluded.
                  </p>
                  <Notice>
                    Calendar Person records differ from FerAuth identities.
                    Visibility bits are list filters, not authorization. Writes
                    and cleanup are confined to records created in the current
                    session. Matters API is never a destination and is
                    unchanged.
                  </Notice>
                  <h3>Privileged lifecycle operations ? documentation only</h3>
                  <Json
                    value={operations
                      .filter((o) => o.internal)
                      .map((o) => ({
                        method: o.method,
                        route: o.route,
                        authentication: o.auth,
                      }))}
                  />
                  <h3>Source-confirmed limitations</h3>
                  <ul>
                    <li>
                      People lookup and availability require VIEW.PERSON.
                      The original source audit found a missing getter; the
                      hosted backend includes its correction.
                    </li>
                    <li>
                      The proxy independently verifies calendar ownership and
                      restricts writes to records created in this session.
                    </li>
                    <li>
                      Named permission checks are invoked by most services,
                      contrary to the general OpenAPI access description.
                      Current calendar resolve routes require VERIFY.CALDAV,
                      a backend service permission. The guided walkthrough uses
                      normal calendar access reads instead.
                    </li>
                    <li>
                      Recurrence is stored as metadata. History lists older
                      events with source-supported pagination, not revision
                      history.
                    </li>
                    <li>
                      Invitation operations do not send emails. No configurable
                      event webhook is exposed.
                    </li>
                    <li>
                      CalDAV sync returns a snapshot and TZID parsing is limited.
                      The hosted adapter preserves exclusive all-day end dates
                      and forwards conditional ETags to the Calendar API.
                    </li>
                  </ul>
                  <p>
                    See repository docs/developer-guide.md,
                    docs/backend-discrepancies.md and docs/qualification.md for
                    source evidence and reviewable backend patches.
                  </p>
                </section>
              )}
            </>
          )}
          {result && <Inspector result={result} />}
          <footer>
            <span>FeraCalendar Developer Studio</span>
            <span>
              {running
                ? "Request in progress..."
                : "Local transient sessions · live upstream responses"}
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
