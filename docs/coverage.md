# Audited operation coverage

49 public REST operations include 18 scheduling operations audited from the deployed router. 32 CalDAV registrations, the discovery redirect, and 4 supplemental health operations are available. The Studio excludes 35 deprecated aliases and keeps 4 lifecycle and 2 CalDAV adapter-only REST operations outside its executor.

rest: source commit c40678bc1f99fd18bef20b9201470f1f638f3017; contract SHA256 30bf31b4b74891cc818ac56b69683e40b7cf9df7af44aad875585cd6125cf4f8; source reconciled true.

caldav: source commit b765a57ce429489b4ad6bb83e93c0adfdfa1ef69; contract SHA256 5763923fdc24994a522b79de84bb43779b75e950833dcb878dda23fe94a06fe7; source reconciled true.

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
| rest | GET | /api/v1/calendars/public | x-auth-token + instance | routes/api/v1/calendar/routes.js |
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
| caldav | HEAD | /caldav/ | HTTP Basic | src/caldav/router.js |
| caldav | PROPFIND | /caldav/ | HTTP Basic | src/caldav/router.js |
| rest | GET | /api/v1/retail/capabilities | x-auth-token + instance | routes/api/v1/retail.js |
| rest | GET | /api/v1/retail/tasks | x-auth-token + instance | routes/api/v1/retail.js |
| rest | POST | /api/v1/retail/tasks | x-auth-token + instance | routes/api/v1/retail.js |
| rest | PATCH | /api/v1/retail/tasks/{uuid} | x-auth-token + instance | routes/api/v1/retail.js |
| rest | DELETE | /api/v1/retail/tasks/{uuid} | x-auth-token + instance | routes/api/v1/retail.js |
| rest | GET | /api/v1/retail/reminders | x-auth-token + instance | routes/api/v1/retail.js |
| rest | POST | /api/v1/retail/reminders | x-auth-token + instance | routes/api/v1/retail.js |
| rest | POST | /api/v1/retail/reminders/{uuid}/dismiss | x-auth-token + instance | routes/api/v1/retail.js |
| rest | GET | /api/v1/retail/booking-pages | x-auth-token + instance | routes/api/v1/retail.js |
| rest | POST | /api/v1/retail/booking-pages | x-auth-token + instance | routes/api/v1/retail.js |
| rest | PATCH | /api/v1/retail/booking-pages/{uuid} | x-auth-token + instance | routes/api/v1/retail.js |
| rest | GET | /api/v1/retail/booking-pages/{uuid}/reservations | x-auth-token + instance | routes/api/v1/retail.js |
| rest | GET | /api/v1/retail/automation-rules | x-auth-token + instance | routes/api/v1/retail.js |
| rest | POST | /api/v1/retail/automation-rules | x-auth-token + instance | routes/api/v1/retail.js |
| rest | PATCH | /api/v1/retail/automation-rules/{uuid} | x-auth-token + instance | routes/api/v1/retail.js |
| rest | DELETE | /api/v1/retail/automation-rules/{uuid} | x-auth-token + instance | routes/api/v1/retail.js |
| rest | GET | /api/v1/retail/booking/{slug} | none | routes/api/v1/retail.js |
| rest | POST | /api/v1/retail/booking/{slug}/reservations | none | routes/api/v1/retail.js |
| caldav | PROPFIND | /.well-known/caldav | none | src/app.js |
