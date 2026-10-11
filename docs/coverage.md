# Audited operation coverage

30 public REST operations, 4 documented lifecycle operations (no executable controls), 34 deprecated aliases excluded, 30 CalDAV registrations, and 4 supplemental liveness/readiness registrations. Implemented means executable support, not live qualification.

rest: source commit 59a18b9df641779911b5e8febfe046730703fe92; contract SHA256 e5bb5c404fa82377ead1441d33b45767fdfda6891867f8419ce2a9a789e5d508; source reconciled true.

caldav: source commit 94a1fa41058c790a3240a61c336e466d4716e057; contract SHA256 b6e5fb3355bbe9a0571c51fb766e473c2630827a8f5b9395917f2e653d9b840a; source reconciled true.

| Service | Method | Route | Auth | Source |
|---|---|---|---|---|
| rest | GET | /health/live | none | support/active-active.js |
| rest | GET | /health/ready | none | support/active-active.js |
| rest | GET | /health | none | support/active-active.js |
| rest | POST | /api/v1/calendars | x-auth-token + instance | routes/api/v1/calendar/routes.js |
| rest | POST | /api/v1/calendars/share | x-auth-token + instance | routes/api/v1/calendar/routes.js |
| rest | POST | /api/v1/calendars/unshare | x-auth-token + instance | routes/api/v1/calendar/routes.js |
| rest | GET | /api/v1/calendars/access/u/{userUuid}/v/{visibility} | x-auth-token + instance | routes/api/v1/calendar/routes.js |
| rest | GET | /api/v1/calendars/resolve/{uuid}/u/{userUuid} | x-auth-token + instance | routes/api/v1/calendar/routes.js |
| rest | GET | /api/v1/calendars/resolve/{uuid} | x-auth-token + instance | routes/api/v1/calendar/routes.js |
| rest | GET | /api/v1/calendars/o/k/{key}/v/{visibility} | x-auth-token + instance | routes/api/v1/calendar/routes.js |
| rest | GET | /api/v1/calendars/v/{visibility} | x-auth-token + instance | routes/api/v1/calendar/routes.js |
| rest | GET | /api/v1/calendars/i/{uuid} | x-auth-token + instance | routes/api/v1/calendar/routes.js |
| rest | DELETE | /api/v1/calendars/i/{uuid} | x-auth-token + instance | routes/api/v1/calendar/routes.js |
| rest | POST | /api/v1/people | x-auth-token + instance | routes/api/v1/person/routes.js |
| rest | GET | /api/v1/people/o/k/{key} | x-auth-token + instance | routes/api/v1/person/routes.js |
| rest | GET | /api/v1/people/available/s/{startAt}/e/{endAt} | x-auth-token + instance | routes/api/v1/person/routes.js |
| rest | DELETE | /api/v1/people/i/{uuid} | x-auth-token + instance | routes/api/v1/person/routes.js |
| rest | DELETE | /api/v1/people/k/{key} | x-auth-token + instance | routes/api/v1/person/routes.js |
| rest | POST | /api/v1/resources | x-auth-token + instance | routes/api/v1/resource/routes.js |
| rest | GET | /api/v1/resources | x-auth-token + instance | routes/api/v1/resource/routes.js |
| rest | GET | /api/v1/resources/o/k/{key} | x-auth-token + instance | routes/api/v1/resource/routes.js |
| rest | GET | /api/v1/resources/available/s/{startAt}/e/{endAt} | x-auth-token + instance | routes/api/v1/resource/routes.js |
| rest | DELETE | /api/v1/resources/i/{uuid} | x-auth-token + instance | routes/api/v1/resource/routes.js |
| rest | DELETE | /api/v1/resources/k/{key} | x-auth-token + instance | routes/api/v1/resource/routes.js |
| rest | POST | /api/v1/events | x-auth-token + instance | routes/api/v1/event/routes.js |
| rest | POST | /api/v1/events/invite | x-auth-token + instance | routes/api/v1/event/routes.js |
| rest | GET | /api/v1/events/o/k/{key}/v/{visibility} | x-auth-token + instance | routes/api/v1/event/routes.js |
| rest | GET | /api/v1/events/i/{uuid} | x-auth-token + instance | routes/api/v1/event/routes.js |
| rest | DELETE | /api/v1/events/i/{uuid} | x-auth-token + instance | routes/api/v1/event/routes.js |
| rest | GET | /api/v1/events/history/c/{calendar} | x-auth-token + instance | routes/api/v1/event/routes.js |
| rest | GET | /api/v1/events/s/{startAt}/e/{endAt}/k/{key}/v/{visibility} | x-auth-token + instance | routes/api/v1/event/routes.js |
| rest | GET | /api/v1/events/s/{startAt}/e/{endAt}/c/{calendar} | x-auth-token + instance | routes/api/v1/event/routes.js |
| rest | DELETE | /api/v1/events/i/{uuid}/k/{key} | x-auth-token + instance | routes/api/v1/event/routes.js |
| rest | POST | /api/v1/internal/provisioning/license-product | Privileged HMAC | routes/api/v1/internal/lifecycle.js |
| rest | POST | /api/v1/internal/settings/license-product | Privileged HMAC | routes/api/v1/internal/lifecycle.js |
| rest | POST | /api/v1/internal/deprovisioning/license-product | Privileged HMAC | routes/api/v1/internal/lifecycle.js |
| rest | POST | /api/v1/internal/lifecycle/license-product | Privileged HMAC | routes/api/v1/internal/lifecycle.js |
| caldav | GET | /health/live | none | support/active-active.js |
| caldav | GET | /health/ready | none | support/active-active.js |
| caldav | GET | /health | none | src/app.js |
| caldav | OPTIONS | /caldav/{path} | none (app-level capability responder) | src/caldav/router.js |
| caldav | HEAD | /caldav/principals/{instance}/{person} | HTTP Basic | src/caldav/router.js |
| caldav | PROPFIND | /caldav/principals/{instance}/{person} | HTTP Basic | src/caldav/router.js |
| caldav | HEAD | /caldav/principals/{instance}/{person}/ | HTTP Basic | src/caldav/router.js |
| caldav | PROPFIND | /caldav/principals/{instance}/{person}/ | HTTP Basic | src/caldav/router.js |
| caldav | OPTIONS | /caldav/instance/{instance} | none (app-level capability responder) | src/caldav/router.js |
| caldav | HEAD | /caldav/instance/{instance} | HTTP Basic | src/caldav/router.js |
| caldav | PROPFIND | /caldav/instance/{instance} | HTTP Basic | src/caldav/router.js |
| caldav | OPTIONS | /caldav/instance/{instance}/ | none (app-level capability responder) | src/caldav/router.js |
| caldav | HEAD | /caldav/instance/{instance}/ | HTTP Basic | src/caldav/router.js |
| caldav | PROPFIND | /caldav/instance/{instance}/ | HTTP Basic | src/caldav/router.js |
| caldav | OPTIONS | /caldav/instance/{instance}/{path} | none (app-level capability responder) | src/caldav/router.js |
| caldav | HEAD | /caldav/instance/{instance}/{path} | HTTP Basic | src/caldav/router.js |
| caldav | PROPFIND | /caldav/instance/{instance}/{path} | HTTP Basic | src/caldav/router.js |
| caldav | OPTIONS | /caldav/calendars/{calendarUuid} | none (app-level capability responder) | src/caldav/router.js |
| caldav | HEAD | /caldav/calendars/{calendarUuid} | HTTP Basic | src/caldav/router.js |
| caldav | PROPFIND | /caldav/calendars/{calendarUuid} | HTTP Basic | src/caldav/router.js |
| caldav | REPORT | /caldav/calendars/{calendarUuid} | HTTP Basic | src/caldav/router.js |
| caldav | OPTIONS | /caldav/calendars/{calendarUuid}/ | none (app-level capability responder) | src/caldav/router.js |
| caldav | HEAD | /caldav/calendars/{calendarUuid}/ | HTTP Basic | src/caldav/router.js |
| caldav | PROPFIND | /caldav/calendars/{calendarUuid}/ | HTTP Basic | src/caldav/router.js |
| caldav | REPORT | /caldav/calendars/{calendarUuid}/ | HTTP Basic | src/caldav/router.js |
| caldav | OPTIONS | /caldav/calendars/{calendarUuid}/{path} | none (app-level capability responder) | src/caldav/router.js |
| caldav | HEAD | /caldav/calendars/{calendarUuid}/{path} | HTTP Basic | src/caldav/router.js |
| caldav | PROPFIND | /caldav/calendars/{calendarUuid}/{path} | HTTP Basic | src/caldav/router.js |
| caldav | REPORT | /caldav/calendars/{calendarUuid}/{path} | HTTP Basic | src/caldav/router.js |
| caldav | GET | /caldav/calendars/{calendarUuid}/{path} | HTTP Basic | src/caldav/router.js |
| caldav | PUT | /caldav/calendars/{calendarUuid}/{path} | HTTP Basic | src/caldav/router.js |
| caldav | DELETE | /caldav/calendars/{calendarUuid}/{path} | HTTP Basic | src/caldav/router.js |
