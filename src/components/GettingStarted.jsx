import React, { useState } from "react";
import { local, pretty } from "../api.js";
import { Field, Json, Notice } from "./Common.jsx";
export default function GettingStarted({ config, session, refresh, run }) {
  const [instance, setInstance] = useState(config.instance || ""),
    [email, setEmail] = useState(config.email || ""),
    [password, setPassword] = useState(""),
    [apiKey, setKey] = useState(""),
    [mode, setMode] = useState("password"),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await run(() =>
        local("login", {
          instance,
          ...(mode === "key" ? { apiKey } : { email, password }),
        }),
      );
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setPassword("");
      setKey("");
      setBusy(false);
    }
  }
  return (
    <div className="two">
      <section className="panel">
        <h2>Connect to FeraCal</h2>
        <p>A live API session, kept in server memory until it expires.</p>
        <dl>
          <dt>FerAuth endpoint</dt>
          <dd>{config.auth}/api/v1/auth</dd>
          <dt>Calendar API</dt>
          <dd>{config.calendar}</dd>
          <dt>Session expires</dt>
          <dd>
            {session.expires
              ? new Date(session.expires).toLocaleString()
              : "Not connected"}
          </dd>
        </dl>
        <form onSubmit={login}>
          <Field
            label="Instance UUID"
            value={instance}
            onChange={(e) => setInstance(e.target.value)}
            required
          />
          <Field label="Credential type">
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="password">Email and password</option>
              <option value="key">Provisioned API-key account</option>
            </select>
          </Field>
          {mode === "key" ? (
            <>
              <Notice>
                Use only an account provisioned for API-key login. This does not
                create an API key.
              </Notice>
              <Field
                label="API key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setKey(e.target.value)}
                required
              />
            </>
          ) : (
            <>
              <Field
                label="Email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Field
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Connecting..." : "Authenticate"}
          </button>
        </form>
        {session.authenticated && (
          <div className="token">
            <button
              onClick={async () => {
                try {
                  setToken((await local("token", {})).token);
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Reveal my token
            </button>
            {token && (
              <>
                <button onClick={() => navigator.clipboard.writeText(token)}>
                  Copy my token
                </button>
                <button onClick={() => setToken("")}>Hide token</button>
                <textarea
                  aria-label="Revealed session token"
                  readOnly
                  value={token}
                />
              </>
            )}
          </div>
        )}
      </section>
      <section className="panel">
        <div className="eyebrow">AUTHENTICATION IN FIVE STEPS</div>
        <h2>From credentials to requests</h2>
        <ol className="steps">
          <li>
            <b>POST /api/v1/auth</b>
            <p>
              Send email/password and the instance header. API-key accounts send
              x-api-key instead.
            </p>
          </li>
          <li>
            <b>Inspect the response</b>
            <p>
              The inspector shows the actual status and response, with the
              returned token redacted.
            </p>
          </li>
          <li>
            <b>Extract the JWT</b>
            <p>
              The server holds the returned token. Reveal is an explicit action
              for your own session.
            </p>
          </li>
          <li>
            <b>Execute Calendar operations</b>
            <Json
              value={{
                instance: instance || "YOUR_INSTANCE_UUID",
                "x-auth-token": "[REDACTED]",
              }}
            />
          </li>
          <li>
            <b>Expire or disconnect</b>
            <p>
              JWT expiry and the one-hour local session deadline are enforced.
              Logout removes both REST and CalDAV credentials.
            </p>
          </li>
        </ol>
        <Notice>
          No passwords, API keys, Basic credentials or tokens are saved in
          localStorage, downloadable traces or application logs.
        </Notice>
      </section>
    </div>
  );
}
