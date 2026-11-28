import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { local } from "./api.js";
import { uuidPattern } from "../shared/data.js";
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
import RetailScheduling, { DueReminders, PublicBooking } from "./components/RetailScheduling.jsx";
const restCount = operations.filter((o) => o.service === "rest" && !o.internal && !o.health).length;
const caldavCount = operations.filter((o) => o.service === "caldav" && !o.health && !o.discoveryRedirect).length;
const pages = [
  ["Calendar", "calendar"],
  ["Scheduling tools", "clock"],
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
  const [requestedInstance] = useState(() => {
    const instance = new URLSearchParams(window.location.search).get("instance");
    return uuidPattern.test(instance || "") ? instance : "";
  });
  const [page, setPage] = useState(requestedInstance ? "Getting started" : "Calendar"),
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
      .then(([c]) => setConfig({ ...c, instance: requestedInstance || c.instance }))
      .catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, [requestedInstance]);
  useEffect(() => {
    if (requestedInstance && session.authenticated && session.instance === requestedInstance) setPage("Calendar");
  }, [requestedInstance, session.authenticated, session.instance]);
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
            {restCount} REST operations
            <br />
            {caldavCount} CalDAV registrations
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
          <DueReminders connected={session.authenticated} />
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
              {page === "Scheduling tools" && <RetailScheduling {...props} />}
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
                  <h2>REST and CalDAV contracts</h2>
                  <p>
                    The explorers cover canonical calendar and scheduling routes,
                    CalDAV discovery, and service health checks.
                  </p>
                  <Notice>
                    Calendar Person records and FerAuth accounts have separate IDs.
                    Visibility bits filter results. Calendar and CalDAV lab
                    writes require records created in the current Studio session.
                    Scheduling tools use the signed-in member's plan and permissions.
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
                    </li>
                    <li>
                      Calendar resolve routes require the VERIFY.CALDAV service
                      permission. The walkthrough uses calendar access reads.
                    </li>
                    <li>
                      Recurrence is stored as metadata. History paginates older events.
                    </li>
                    <li>
                      Invitation operations do not send emails. No configurable
                      event webhook is exposed.
                    </li>
                    <li>
                      CalDAV supports IANA TZIDs and exclusive all-day end dates.
                      Sync starts with a snapshot. A stale token requires a fresh
                      snapshot after a 403 valid-sync-token response.
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
const bookingRoute = /^\/book\/([a-zA-Z0-9_-]{32})\/?$/.exec(window.location.pathname);
createRoot(document.getElementById("root")).render(bookingRoute ? <PublicBooking slug={bookingRoute[1]} /> : <App />);
