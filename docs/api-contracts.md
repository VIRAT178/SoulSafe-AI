# API Contracts (MVP)

## Auth
- POST /auth/register
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout

## Capsules
- POST /capsules
- GET /capsules
- GET /capsules/:id
- PATCH /capsules/:id
- POST /capsules/:id/lock
- POST /capsules/:id/release
- POST /capsules/:id/simulate-release

### Capsule Event Trigger Fields
- unlockEventRules.type: birthday | exam | breakup | custom
- unlockEventRules.date: optional ISO datetime
- unlockEventRules.metadata.personName: optional
- unlockEventRules.metadata.eventName: optional

### Capsule Detail Explainability
- GET /capsules/:id now includes:
	- capsule: full capsule payload
	- unlockReason: string | null
	- Backward compatibility: existing top-level capsule fields are still returned.

## AI
- POST /ai/analyze
- GET /ai/timeline/:userId

### AI Timeline Response
- date: ISO datetime
- sentimentScore: number
- emotion: dominant emotion
- capsuleTitle: capsule title used in timeline tooltip

## Service Health
- GET /health (api-node, ai-python)
- GET /scheduler/health
- GET /actuator/health (java services if actuator endpoint exposed)
