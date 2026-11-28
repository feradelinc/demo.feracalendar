import React, { useEffect, useState } from "react";
import { Notice } from "./Common.jsx";
import { retail } from "./RetailScheduling.jsx";

export default function EventTrash({ onRestored }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let current = true;
    setResult(null);
    setError("");
    retail("event-trash?page=" + page)
      .then(data => { if (current) setResult(data); })
      .catch(cause => { if (current) setError(cause.message); });
    return () => { current = false; };
  }, [page]);

  async function restore(uuid) {
    setRestoring(true);
    setError("");
    setStatus("");
    try {
      const restored = await retail("event-trash/" + uuid + "/restore", "POST", {});
      setStatus(restored.skippedAssociations
        ? "Event restored. Some people or resources are no longer available."
        : "Event restored.");
      if (page > 1 && result.items.length === 1) setPage(page - 1);
      else setResult(await retail("event-trash?page=" + page));
      await onRestored();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setRestoring(false);
    }
  }

  return <section className="panel" aria-labelledby="event-trash-heading">
    <h2 id="event-trash-heading">Deleted events</h2>
    <Notice>Restore events from calendars you can edit within 30 days of deletion.</Notice>
    {error && <p className="error" role="alert">{error}</p>}
    {status && <p role="status">{status}</p>}
    {!result && !error && <p role="status">Loading deleted events…</p>}
    {result?.items.length === 0 && <p>No deleted events.</p>}
    {result?.items.length > 0 && <ul>
      {result.items.map(item => <li key={item.uuid}>
        <div className="row">
          <div>
            <strong>{item.title || "Untitled event"}</strong>
            <p className="muted">{item.calendarName} · Deleted {new Date(item.deletedAt).toLocaleString()}</p>
          </div>
          <button type="button" disabled={restoring} onClick={() => restore(item.uuid)}
            aria-label={"Restore " + (item.title || "untitled event")}>Restore</button>
        </div>
      </li>)}
    </ul>}
    {(page > 1 || result?.nextPage) && <div className="row">
      <button type="button" disabled={restoring || page === 1} onClick={() => setPage(page - 1)}>Previous page</button>
      <button type="button" disabled={restoring || !result?.nextPage} onClick={() => setPage(result.nextPage)}>Next page</button>
    </div>}
  </section>;
}
