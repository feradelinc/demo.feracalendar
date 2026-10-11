# Developer guide

## Architecture

`server/app.js` owns fixed upstream destinations, transient sessions, authentication, credential isolation, registry dispatch, owner verification and mutation provenance. `server/index.js` serves Vite middleware during development and the built static frontend in local production mode. Both bind to `127.0.0.1`.

`shared/operations.json` is generated from the pinned REST and CalDAV OpenAPI snapshots by `scripts/audit.mjs`. The audit verifies methods, exact/trailing-slash/descendant paths and handlers against actual Express registrations, checks for undocumented source registrations, and records source commits and contract hashes. Original operation identifiers are preserved, including the REST generator's trailing `}` characters. CalDAV extension keys become actual `PROPFIND` and `REPORT` methods.

`shared/data.js` implements path/query validation, redaction, fictional scenario generation, half-open ranges and Temporal time-zone conversion. `shared/protocol.js` parses bounded XML and VEVENT data, provides protocol recipes and emits folded UTF-8/CRLF ICS. `shared/workflow.js` captures returned identifiers and runs the same sequence used by the browser and opt-in live smoke command.

React components are separated by workspace: GettingStarted, CalendarWorkspace, Management, Walkthrough, Explorer, CalDAVLab and shared inspector controls. There is no import, dependency or runtime reference to another demo project. `tests/fixture.js` belongs only to test code.

## Connection

Configure `.env` from `.env.example`, then open http://127.0.0.1:4179. Default local ports are source-verified: Auth 10443, Calendar 11400, CalDAV 11410. The source branches are REST `master`, CalDAV `main` and Auth `main`; existing local backend branches were preserved by inspecting detached worktrees.

For remote service access, configure each HTTPS base and list it explicitly in `ALLOWED_API_URLS`, comma-separated. Bases cannot contain credentials, query strings or path prefixes. Auth, Calendar and CalDAV destinations must be distinct. User requests cannot override destinations or methods. Known Matters hostnames and port 11303 are rejected.

Enter the FeraCal product instance UUID and your authorized email/password in Getting started. The proxy calls `POST /api/v1/auth` with the `instance` header. API-key login is only for actually provisioned API-key accounts; the demo creates no key or entitlement. FerAuth enforces its own account, IP whitelist and CAN.LOGIN rules. Returned tokens are held server-side and subsequent requests use `x-auth-token` plus the same owner instance.

Cookies are HttpOnly and SameSite=Strict; Secure is set on HTTPS requests. This application is loopback-only and uses HTTP for the local browser connection. Public HTTPS hosting would require a separately reviewed deployment/session configuration and is not enabled. Sessions end at JWT expiry or the one-hour local deadline; logout removes both REST and CalDAV credentials. Reveal/copy is explicit for the user's own JWT and remains in component memory only.

CalDAV uses its own entered username/password and HTTP Basic authentication. Connection is verified by a real PROPFIND returning 207; OPTIONS is not treated as authentication proof because the adapter's earlier OPTIONS responder is unauthenticated. Disconnect removes Basic credentials without disconnecting REST.

## Calendar workspace and data contracts

Load accessible calendars using the signed-in FerAuth user UUID. Select calendars, a view, date and IANA time zone. Navigation and view changes query the new interval once calendars are selected. Failed loads clear event results and display the error. Click a returned event to inspect or edit its exact supported fields. Saving calls `POST /api/v1/events`; optional person/resource association is a separate `POST /api/v1/events/invite` request.

Wall-clock inputs convert to ISO instants using Temporal. DST gaps/folds are rejected unless the user explicitly selects earlier/later disambiguation. All-day inputs use local midnight and an exclusive end date; spring-forward days may span 23 hours. Returned events overlap an interval only when `endsAt > start` and `startsAt < end`. Calendar colors are presentation choices, not claimed persisted API fields.

Calendar commands support uuid, owner, person/key, name and shared. OpenAPI examples also advertise unsupported calendar color/timeZone/visibility mutation fields; these are deliberately not sent. Owner defaults to the signed-in instance, and any supplied different owner is rejected. Visibility checkboxes construct OWNER=1, MEMBER=2, AVAILABLE=4 and GLOBAL=8, but these are filters, not authorization. Returned visibility classifications can be 0/1/2; they differ from input bit values.

People update by owner-scoped key, not a Person UUID mutation field. Supported contact fields are firstName, lastName, displayName, email, phone and optional `user` (a FerAuth identity UUID). Resources update by UUID or key and support displayName/email. Calendar membership roles persisted by the model are admin/editor/viewer; owner is derived from the calendar's personUuid, not a supported membership assignment. Sharing requires an owner/admin/editor inviter.

Event commands use title rather than treating an owner-scoped key as an event's independent identity. Event `key` resolves a person/calendar context; key retrieval can use a person or resource key. Creator/creatorKey is required for source role enforcement. The model supports tentative/confirmed/cancelled and event/todo/journal/block/alarm/holiday. Recurrence is a string such as `FREQ=WEEKLY;BYDAY=MO;COUNT=6`; it is persisted, not expanded by the REST service.

Invitation attendee roles are `org`, `req`, `opt`, `non`, statuses are invited/accepted/declined/tentative, and mark is free/busy/tentative/oof. Person participation persists role and respondedAt. Resource participation persists status/mark, not role/respondedAt. Upserting participation is the existing update mechanism; no acceptance endpoint or email delivery is advertised.

Availability routes return available people/resources for the selected interval. An optional focus UUID/key is a local filter of returned records, explicitly labeled. No fabricated backend busy timeline or recurrence-based availability is shown. Results depend on backend stored procedures and their installation.

History is older event data sorted by startsAt/createdAt, not change-audit revisions. Source-supported `history`, `limit`, `offset`, `before`, `uuid` and `uuids` queries are available in the explorer; list pagination applies only in history mode. Limit is 1?100 and offset is 0?10000.

## Mutation provenance and tenant boundaries

The server creates a random session prefix for new owner-scoped keys and calendar names. Successful create responses populate an in-memory ledger of returned UUIDs. Updates, invitations, sharing and deletes must reference ledger-owned records; a browser cannot adopt arbitrary existing identifiers. Calendar UUIDs are independently checked through the owner-scoped calendar GET before risky requests. Event results are checked against their actual parent calendars, including UUID-filtered lists.

DELETE and unshare require explicit confirmation of the exact path target/key. Cleanup uses ledger records in dependency order and stops on failure. A restart/logout loses provenance and therefore disables mutation of earlier records; use authorized upstream administration to manage preserved data later. The demo does not silently recreate access or bypass backend roles.

The proxy rejects force, signed owner-scope override headers, unknown fields, arbitrary methods/URLs, path traversal and internal lifecycle operations. Remote credentials go only to their fixed service; redirects are not followed. Same-origin/custom-header checks protect local mutations, request bodies are capped at 2 MiB, responses at 8 MiB and upstream requests have 30-second timeouts. DTD/entity declarations are prohibited. Credentials are never logged or persisted. Trace downloads omit bodies/data and contact fields; screen inspectors show actual account data for the signed-in user, redacting secrets.

## CalDAV laboratory

The protocol explorer preserves all exact, trailing-slash and descendant registrations. Use OPTIONS, HEAD, PROPFIND with Depth 0/1/infinity, and REPORT with calendar-query, calendar-multiget or sync-collection. Responses are shown as highlighted XML and parsed href/displayname/privilege/ETag/calendar-data/sync summaries. Deeper-path responses are the actual adapter result; the Studio does not invent a collection tree.

Use complete VCALENDAR/VEVENT documents. The proxy validates UUID.ics against UID, normalizes CRLF and emits folded UTF-8 sample lines. UTC timestamp examples avoid the adapter's verified TZID limitation. All-day and ETag discrepancies are documented separately.

For conflict demonstration: GET a demo-created event, capture ETag, edit SUMMARY, PUT with If-Match, change again and PUT using the previous ETag. Inspect the actual 412, GET again and reapply the edit with the refreshed tag. Use conditional DELETE only on a demo-created resource. New ICS creation first verifies that its UUID does not exist; edits require If-Match. The lab never fabricates protocol statuses. The current adapter's returned PUT ETag may differ from a subsequent GET until the separate canonical-ETag patch is applied.

## Running tests and live qualification

`npm test` uses explicit local upstream fixtures, source inventory checks and selected standalone backend functions. Source-only patch regression tests skip when pinned backend checkouts are absent. `npm run test:ui` uses explicit browser interception and also checks all workspaces with axe WCAG A/AA and responsive widths. Install Chromium with `npx playwright install chromium` if needed.

`npm run audit` checks the bundled snapshot/registry independently. To requalify against source, set `CALENDAR_SOURCE` to a checkout of populated REST master and `CALDAV_SOURCE` to CalDAV main. Changed contracts or registrations cause failure; review changes and refresh snapshots intentionally.

Live smoke requires explicit ignored nonproduction credentials and `SMOKE_NONPRODUCTION=true`. It prints tenant and configured bases, creates uniquely prefixed records, verifies returned event data/recurrence, exercises sharing and availability, and retains identifiers in ignored `output/live-qualification.json`. Optional shared-user and CalDAV credentials permit their additional checks. `SMOKE_CLEANUP=true` requests only this run's scoped cleanup; it is false by default. Do not treat intercepted tests as live service qualification.
