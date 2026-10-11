# Qualification report

## Scope

Standalone local FeraCalendar Developer Studio implementation. No publicly accessible authenticated demo or production infrastructure was deployed. No Calendar, CalDAV, Auth or Matters backend checkout was modified. Matters API remained clean at `d267fa3e573fe7e7bfa3b1c9c43a81d8615f0492`.

| Check                              | Result                                            | Evidence/scope                                                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REST source inventory              | 30 public +4 lifecycle +34 deprecated aliases     | Populated master; method/path/handler and reverse-registration reconciliation. Lifecycle has documentation only.                                                                                                                                   |
| CalDAV source inventory            | 30 canonical registrations +2 supplemental health | Exact/trailing/descendant variants retained; extension verbs translated to actual methods.                                                                                                                                                         |
| REST supplemental health           | 3 health routes total, outside34 operation count  | Legacy health +liveness/readiness supported as public health.                                                                                                                                                                                      |
| Node suite                         | 30 tests pass                                     | Proxy authentication, session expiry, credentials, owner boundaries, full30 REST dispatch, CalDAV variants, ETags/CRLF, workflow/read-after-write, timezone/DST, limits/redirects and source-only regressions.                                     |
| Browser suite                      | 7 tests pass                                      | Explicit interception: auth/logout/reveal, four calendar views/editor, sharing, availability, participation/history, full workflow, explorer/code/traces, XML/ICS and stale ETag, responsive layouts, keyboard and axe checks on all12 workspaces. |
| Production frontend build          | Passed                                            | Standalone Vite chunks; no Render/PDF dependencies.                                                                                                                                                                                                |
| Development and built local launch | Passed                                            | Loopback HTTP representative page/config checks.                                                                                                                                                                                                   |
| Live smoke without opt-in          | Refused, no upstream calls                        | Explicit account/instance/nonproduction flag required; default cleanup false.                                                                                                                                                                      |
| Live authenticated qualification   | Not run                                           | No expressly authorized nonproduction account/instance supplied. No real entitlement, sharing, availability database procedure or CalDAV credential success claimed.                                                                               |
| Screenshots                        | Captured and visually inspected                   | Intercepted synthetic browser-test sessions; not screenshots of a production account.                                                                                                                                                              |

Pinned source commits and OpenAPI hashes are recorded in [inventory.json](inventory.json) and [coverage](coverage.md). Auth's verified local default is10443 rather than the suggested example11000.

## Known live blockers and limits

The source controller's missing people getter prevents live people key/availability calls. The full walkthrough will stop there and preserve created resources. Review-only correction patches cover that defect, owner guards, route references, CalDAV condition handling, canonical ETags and exclusive all-day export. Other source limitations are recorded in [backend discrepancies](backend-discrepancies.md); no service behavior is bypassed or fabricated.

Local tests are fixtures, controlled source execution and browser interception. They demonstrate implementation and isolation, not a healthy production database, CalDAV service configuration, product entitlement, user linkage or backend authorization. ETag checks are non-atomic upstream; timezone floating/TZID and incremental synchronization remain limited. Real qualification requires a corrected nonproduction backend and an authorized account, then the opt-in smoke command with separately configured CalDAV credentials if needed.

## Operating/deployment requirements

Run `npm ci`, configure ignored `.env`, then `npm run dev` at http://127.0.0.1:4179. `npm run build` followed by `npm start` serves the built app on the same loopback port. Remote API connections require HTTPS plus explicit allowlist entries. Keep tokens and passwords out of files/logs/traces and never put Basic credentials in a URL.

Public hosting is intentionally not configured. A separately authorized deployment must establish its own HTTPS origin, secure cookie/proxy trust, reviewed session store, operator-controlled upstream allowlists, rate limits and service isolation. This task does not alter production FeraCalendar infrastructure, restart services or deploy patches. Matters API is outside the application destination boundary.
