# Current backend qualification

The original contract inventory and review patches record REST master `59a18b9` and CalDAV main `94a1fa4`. Actual production on 2026-10-11 uses the accumulated `fix/preprod35-db-profile` source branches and release `v0.1.0-api-release.20261011.82`. This distinction was verified from both production nodes, not inferred from the old deployment manifests.

That release already contains `support/resource-scope.js`, signed Matters owner-partition support, cross-calendar CalDAV checks, propagation of failed reads, conditional mutation forwarding and canonical `entityTag` responses. Reapplying the old six patches would overwrite stronger fixes or conflict with current source. These existing corrections are preserved.

Two remaining runtime files are corrected in the new candidate `v0.1.0-api-release.20261011.83`:

- REST `routes/api/v1/person/service.js`: restore the missing getter using VIEW.PERSON, the existing resolved owner, key lookup and availability procedure, interval validation and action recording. [Merged PR](https://github.com/feradelinc/feradel.calendar.api/pull/1), source commit `80993088f407ed93c9771dee919cb7f449e71226`.
- CalDAV `src/caldav/ics.js`: preserve supplied exclusive all-day DTEND, with a one-day fallback only when no valid end is present. [Merged PR](https://github.com/feradelinc/feradel.calendar.caldav/pull/1), source commit `3536e5afc1ab10205b6cd98337bf64175384586b`.

An isolated canary ran all twelve services with readiness 200. Fourteen targeted Linux regression tests passed: seven REST tests covering people and signed Matters scope and seven CalDAV tests covering all-day round trips, event ownership and conditional ETags. A verified TLS database read confirmed that `PRC_FindPeopleAvailableForTime` already exists. No migration or customer record mutation was performed. The canary was terminated before starting the rolling production refresh to preserve connection capacity.

The candidate's complete service inventory differs from release 82 in exactly those two files. Every Matters runtime file and every other service file is byte-identical; runtime parameters, permissions, signing secrets, database configuration, networking and host routes are preserved. Rollback selects the immutable release 82 artifact. Actual fleet completion and live site checks are recorded in the deployment receipt after rollout.

Current Calendar resolve/resolveAccess routes require `VERIFY.CALDAV`, a service permission. They remain inspectable and executable in the explorer subject to actual backend authorization. The ordinary-user walkthrough uses `/calendars/access/u/{userUuid}/v/{visibility}` instead, with a regression in which resolver requests are denied. This preserves the backend security behavior used by Matters and CalDAV.

Full authenticated live account workflows have not been run: no expressly authorized nonproduction account was supplied. Unit/browser fixtures, real public-site checks, database metadata checks and actual fleet health checks are reported separately. Recurrence remains metadata, sync remains a snapshot, floating TZID parsing remains limited, and invitation operations do not deliver email.
