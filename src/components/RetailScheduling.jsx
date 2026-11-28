import React, { useEffect, useState } from "react";
import { Field, Notice } from "./Common.jsx";

export async function retail(route, method = "GET", fields) {
  const response = await fetch("/demo/retail/" + route, {
    method,
    headers: method === "GET" ? {} : { "content-type": "application/json", "x-demo-request": "1" },
    body: fields === undefined ? undefined : JSON.stringify(fields),
  });
  const payload = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(payload.message || "Calendar request failed."), { status: response.status });
  return payload;
}

const displayTime = (value) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const dateInput = (value) => value ? new Date(value).toISOString() : null;

export function DueReminders({ connected }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  async function refresh() {
    const result = await retail("reminders?due=true");
    setItems(result.items);
  }
  useEffect(() => {
    if (!connected) { setItems([]); return; }
    const poll = () => refresh().catch(() => {});
    poll();
    const timer = setInterval(poll, 30000);
    return () => clearInterval(timer);
  }, [connected]);
  if (!connected || !items.length) return null;
  return <section className="panel" aria-label="Due reminders">
    <h2>Due reminders</h2>
    {error && <p className="error" role="alert">{error}</p>}
    <ul>{items.map(item => <li key={item.uuid}>
      <div className="row"><span>{item.title}</span><button type="button" onClick={async () => {
        setError("");
        try { await retail("reminders/" + item.uuid + "/dismiss", "POST", {}); await refresh(); }
        catch (cause) { setError(cause.message); }
      }}>Dismiss</button></div>
    </li>)}</ul>
  </section>;
}

function Form({ label, submit, children }) {
  const [error, setError] = useState(""), [working, setWorking] = useState(false);
  return <form onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setWorking(true); setError("");
    try { await submit(values); form.reset(); }
    catch (cause) { setError(cause.message); }
    finally { setWorking(false); }
  }}>
    {children}
    <button className="primary" disabled={working}>{label}</button>
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}

function TaskForm({ add }) {
  return <Form label="Add task" submit={values => add("tasks", {
    title: values.get("title"), notes: values.get("notes"), dueAt: dateInput(values.get("due")),
  })}>
    <Field name="title" label="Task title" required maxLength={200} />
    <Field name="notes" label="Notes"><textarea name="notes" maxLength={4000} /></Field>
    <Field name="due" label="Due date and time" type="datetime-local" />
  </Form>;
}

function ReminderForm({ tasks, add }) {
  return <Form label="Set reminder" submit={values => add("reminders", {
    title: values.get("title"), dueAt: dateInput(values.get("time")), taskUuid: values.get("task") || undefined,
  })}>
    <Field name="title" label="Reminder title" required maxLength={200} />
    <Field name="time" label="Remind me at" type="datetime-local" required />
    <Field label="Related task"><select name="task" aria-label="Related task">
      <option value="">None</option>{tasks.filter(task => !task.completedAt).map(task => <option key={task.uuid} value={task.uuid}>{task.title}</option>)}
    </select></Field>
  </Form>;
}

function BookingForm({ add, calendar }) {
  const [slots, setSlots] = useState([0]);
  return <Form label="Publish booking page" submit={async values => {
    await add("booking-pages", { calendarUuid: calendar, title: values.get("title"),
      duration: Number(values.get("duration")), slots: values.getAll("slots").map(dateInput) });
    setSlots([0]);
  }}>
    <Field name="title" label="Booking page title" required maxLength={120} />
    <Field name="duration" label="Duration in minutes" type="number" min={5} max={240} defaultValue={30} required />
    {slots.map((slot, index) => <Field name="slots" key={slot} label={"Time slot " + (index + 1)} type="datetime-local" required />)}
    <button type="button" disabled={slots.length >= 48} onClick={() => setSlots([...slots, slots.length])}>Add a time slot</button>{" "}
  </Form>;
}

function RuleForm({ add, calendar }) {
  return <Form label="Create rule" submit={values => add("automation-rules", {
    calendarUuid: calendar, title: values.get("title"), minutesBefore: Number(values.get("offset")),
    trigger: values.get("trigger"),
  })}>
    <Field name="title" label="Reminder title" required maxLength={120} />
    <Field label="When"><select name="trigger" aria-label="When">
      <option value="event.created">An event is created</option><option value="booking.created">A booking is confirmed</option>
    </select></Field>
    <Field name="offset" label="Remind me this many minutes before start" type="number" min={0} max={10080} defaultValue={15} required />
  </Form>;
}

export default function RetailScheduling({ session, context }) {
  const [data, setData] = useState(null), [error, setError] = useState("");
  const [calendar, setCalendar] = useState("");
  const [reservations, setReservations] = useState({});
  async function refresh() {
    const { features, calendars } = await retail("capabilities");
    const [tasks, reminders, pages, rules] = await Promise.all([
      retail("tasks"), retail("reminders"),
      features.bookingPages ? retail("booking-pages") : { items: [] },
      features.automationRules ? retail("automation-rules") : { items: [] },
    ]);
    setData({ features, calendars, tasks: tasks.items, reminders: reminders.items, pages: pages.items, rules: rules.items });
  }
  useEffect(() => {
    setData(null); setError(""); setCalendar(""); setReservations({});
    if (session.authenticated) refresh().catch(cause => setError(cause.message));
  }, [session.authenticated, session.instance]);
  async function update(route, method, values) {
    setError("");
    try { await retail(route, method, values); await refresh(); }
    catch (cause) { setError(cause.message); }
  }
  const add = async (route, values) => { await retail(route, "POST", values); await refresh(); };
  if (!session.authenticated) return <Notice>Connect your FeraCal account to manage scheduling.</Notice>;
  if (!data) return <p role={error ? "alert" : "status"}>{error || "Loading scheduling tools…"}</p>;
  const preferred = calendar || context.calendar?.uuid;
  const selected = data.calendars.find(item => item.uuid === preferred)?.uuid || data.calendars[0]?.uuid || "";
  return <>
    {error && <p className="error" role="alert">{error}</p>}
    <section className="panel">
      <h2>Tasks</h2>
      <TaskForm add={add} />
      <ul>{data.tasks.map(task => <li key={task.uuid}>
        <div className="row">
          <span>{task.title}{task.dueAt && " · " + displayTime(task.dueAt)}</span>
          <button type="button" onClick={() => update("tasks/" + task.uuid, "PATCH", { completed: !task.completedAt })}>{task.completedAt ? "Reopen" : "Complete"}</button>
          <button type="button" onClick={() => update("tasks/" + task.uuid, "DELETE")}>Delete</button>
        </div>
        {task.notes && <p>{task.notes}</p>}
      </li>)}</ul>
    </section>
    <section className="panel">
      <h2>Reminders</h2>
      <ReminderForm tasks={data.tasks} add={add} />
      <ul>{data.reminders.map(item => <li key={item.uuid}>{item.title} · {displayTime(item.dueAt)}{" "}
        <button type="button" onClick={() => update("reminders/" + item.uuid + "/dismiss", "POST", {})}>Dismiss</button>
      </li>)}</ul>
    </section>
    {(data.features.bookingPages || data.features.automationRules) && <section className="panel">
      {selected ? <Field label="Calendar"><select value={selected} aria-label="Calendar" onChange={event => setCalendar(event.target.value)}>
        {data.calendars.map(item => <option key={item.uuid} value={item.uuid}>{item.name}</option>)}
      </select></Field> : <Notice>Create a calendar or request editing access to configure booking pages and automations.</Notice>}
      {data.features.bookingPages && <>
        <h2>Booking pages</h2>
        {selected && <BookingForm add={add} calendar={selected} />}
        {data.pages.map(item => <div key={item.uuid}>
          <div className="row">
            {item.published ? <a href={"/book/" + item.slug}>{item.title}</a> : <span>{item.title} · Unpublished</span>}
            <button type="button" onClick={() => update("booking-pages/" + item.uuid, "PATCH", { published: !item.published })}>{item.published ? "Unpublish" : "Publish"}</button>
            <button type="button" onClick={async () => {
              try {
                const result = await retail("booking-pages/" + item.uuid + "/reservations");
                setReservations({ ...reservations, [item.uuid]: result.items });
              } catch (cause) { setError(cause.message); }
            }}>View reservations</button>
          </div>
          {reservations[item.uuid] && <ul>{reservations[item.uuid].map(booking => <li key={booking.uuid}>{booking.guestName} · {booking.guestEmail} · {displayTime(booking.startsAt)}</li>)}</ul>}
        </div>)}
      </>}
      {data.features.automationRules && <>
        <h2>Automation rules</h2>
        {selected && <RuleForm add={add} calendar={selected} />}
        {data.rules.map(item => <div className="row" key={item.uuid}>
          <span>{item.title}</span>
          <button type="button" onClick={() => update("automation-rules/" + item.uuid, "PATCH", { enabled: !item.enabled })}>{item.enabled ? "Disable" : "Enable"}</button>
          <button type="button" onClick={() => update("automation-rules/" + item.uuid, "DELETE")}>Delete</button>
        </div>)}
      </>}
    </section>}
  </>;
}

export function PublicBooking({ slug }) {
  const [page, setPage] = useState(null), [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const resource = "booking/" + slug;
  useEffect(() => {
    retail(resource).then(result => setPage(result.item)).catch(cause => setError(cause.message));
  }, [resource]);
  return <main className="content"><section className="panel">
    {error ? <p className="error" role="alert">{error}</p> : !page ? <p role="status">Loading booking page…</p> : <>
      <h1>{page.title}</h1>
      {confirmed ? <p role="status">Confirmed for {displayTime(confirmed.startsAt)}. Reference {confirmed.confirmation}.</p>
        : !page.slots.length ? <p>No times are currently available.</p> : <>
          <p>{page.duration} minutes. Times are shown in your local time zone.</p>
          <Form label="Confirm booking" submit={async values => {
            const fields = { startsAt: values.get("slot"), name: values.get("name"), email: values.get("email") };
            const snapshot = JSON.stringify(fields);
            const requestId = attempt?.snapshot === snapshot ? attempt.requestId : crypto.randomUUID();
            setAttempt({ snapshot, requestId });
            try {
              const result = await retail(resource + "/reservations", "POST", { ...fields, requestId });
              setConfirmed(result.item);
            } catch (cause) {
              if (cause.status === 409) {
                await retail(resource).then(result => setPage(result.item)).catch(() => {});
              }
              throw cause;
            }
          }}>
            <Field label="Choose a time"><select name="slot" aria-label="Choose a time">{page.slots.map(slot => <option key={slot} value={slot}>{displayTime(slot)}</option>)}</select></Field>
            <Field name="name" label="Your name" autoComplete="name" required maxLength={120} />
            <Field name="email" label="Your email" type="email" autoComplete="email" required maxLength={254} />
          </Form>
        </>}
    </>}
  </section></main>;
}
