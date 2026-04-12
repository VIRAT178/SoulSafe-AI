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

## AI
- POST /ai/analyze

## Service Health
- GET /health (api-node, ai-python)
- GET /scheduler/health
- GET /actuator/health (java services if actuator endpoint exposed)
