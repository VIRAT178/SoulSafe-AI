# SoulSafe AI Monorepo

Industry-ready microservices scaffold for a digital time-capsule web app.

## Services
- Web frontend: React + TypeScript (`apps/web-react`)
- Core API: Node.js + Express + TypeScript (`apps/api-node`)
- Scheduler: Java Spring Boot (`services/scheduler-java`)
- Encryption: Java Spring Boot (`services/encryption-java`)
- Recommendation: Java Spring Boot (`services/recommendation-java`)
- AI analysis: Python FastAPI (`services/ai-python`)

## Quick Start
1. Install Node dependencies at workspace root:
   - `npm install`
2. Start full stack with Docker Compose (recommended):
   - `docker compose up --build`
3. Or run services manually:
   - MongoDB + Redis locally
   - Java services (`mvn spring-boot:run`) for scheduler/encryption/recommendation
   - AI service:
     - `cd services/ai-python && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000`
   - API:
     - `npm run dev:api`
   - Web app:
   - `npm run dev:web`
4. Open the web app at `http://localhost:5173`.

## Initial Vertical Slice
- Register/login
- Create capsule
- Lock by date
- Simulate scheduler release
- View timeline and unlock feed

## Contracts And Validation
- OpenAPI spec: `apps/api-node/openapi.yaml`
- Contract tests: `npm --workspace @soulsafe/api-node run test:contract`

## Async Processing
- AI analysis is queued in Redis and processed by the API background worker.
- Scheduled unlocks are stored in a Redis sorted set and executed by a polling unlock worker.
- Mongo collection validators and compound indexes are applied automatically at API startup.

See `PROJECT_BLUEPRINT.md` for architecture detail.
