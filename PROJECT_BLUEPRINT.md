# SoulSafe AI - Project Blueprint

## Product Definition

SoulSafe AI is a digital time capsule platform where users store meaningful messages, memories, and media today, and AI helps deliver them at emotionally relevant moments in the future.

### Core Value
- Preserve memories securely.
- Lock content by date or event trigger.
- Use AI to infer emotional context and improve timing/relevance of unlock recommendations.
- Deliver memories at the right moment, not just at a stored timestamp.

---

## High-Level Architecture

### Frontend
- Stack: React + TypeScript
- Responsibilities:
  - User onboarding and authentication
  - Capsule creation/editing
  - Media upload UI
  - Timeline dashboard
  - Notification center and unlock feed

### Core Backend API
- Stack: Node.js (Express or NestJS)
- Responsibilities:
  - Auth (JWT + refresh token flow)
  - User profile and capsule CRUD
  - File metadata + upload orchestration
  - Policy engine interface for unlock rules
  - API gateway to downstream services

### AI and Security Microservices
- Stack: Java Spring Boot (microservices)
- Services:
  1. Scheduling service
     - Maintains date/event unlock queues
     - Dispatches unlock jobs
  2. Encryption service
     - Envelope encryption for capsule payloads
     - Key management integration
  3. Recommendation orchestrator
     - Consumes emotion/context scores
     - Applies unlock recommendation policy

### AI Layer
- Stack: Python (FastAPI)
- Responsibilities:
  - Emotion classification from text/voice transcripts
  - Sentiment trend scoring
  - Context tagging (life events, relationship categories, intent)
  - Optional retrieval + summarization for recommendations
  - Runs after capsule save so analysis is available before capsule opening

### Data Layer
- MongoDB:
  - User profiles
  - Capsules, metadata, unlock policies, AI tags
- Redis:
  - Job queues, cache, rate-limits, temporary session artifacts

### Security
- JWT access + refresh token rotation
- Encryption at rest and in transit
- Content-level encryption for sensitive memories
- Audit logs for unlock/view/download actions

---

## Service Boundaries

1. API Gateway (Node)
- Owns external APIs.
- Validates user identity and request payloads.
- Routes work to Java/Python services.

2. Capsule Domain Service (Node)
- Capsule lifecycle: draft -> locked -> scheduled -> released.
- Enforces user ownership and sharing settings.

3. Scheduler Service (Java)
- Evaluates unlock date/event triggers.
- Publishes unlock-ready events.

4. AI Analysis Service (Python)
- Async analysis pipeline for new capsules.
- Produces emotion/context metadata.

5. Recommendation Service (Java)
- Applies recommendation policy:
  - strict unlock (hard date/event)
  - soft recommendation windows (emotion-aware)

6. Encryption Service (Java)
- Handles encrypt/decrypt workflow through secure APIs.
- Never exposes raw keys to frontend or public API.

---

## Suggested Event Flow

1. User creates capsule in React app.
2. Node API encrypts the payload, then stores metadata in MongoDB and the media reference.
3. User receives a creation email with capsule details.
4. AI service asynchronously analyzes the capsule body and stores sentiment/emotion metadata.
5. Scheduler indexes unlock conditions.
6. At trigger time, scheduler emits unlock event.
7. Recommendation service evaluates whether to:
   - unlock immediately, or
   - delay/recommend for better emotional timing.
8. User receives an opening email and accesses the released capsule.

---

## Data Model (Initial)

### users
- _id
- email
- passwordHash
- displayName
- createdAt
- settings

### capsules
- _id
- userId
- title
- contentType (text/image/video/audio/mixed)
- encryptedPayloadRef
- lockMode (date/event/hybrid)
- unlockAt
- unlockEventRules
- aiAnalysisId
- status (draft/locked/released/archived)
- createdAt
- updatedAt

### ai_analyses
- _id
- capsuleId
- sentimentScore
- emotionLabels
- confidence
- contextTags
- recommendationHints
- analyzedAt

### unlock_events
- _id
- capsuleId
- triggerType
- triggerTimestamp
- actionTaken
- decisionReason
- processedAt

### audit_logs
- _id
- userId
- capsuleId
- action
- ipHash
- userAgentHash
- timestamp

---

## API Surface (MVP)

### Auth
- POST /auth/register
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout

### Capsules
- POST /capsules
- GET /capsules
- GET /capsules/:id
- PATCH /capsules/:id
- POST /capsules/:id/lock
- POST /capsules/:id/release (internal/admin/scheduler)

### AI
- POST /ai/analyze/:capsuleId (internal)
- GET /ai/analysis/:capsuleId

### Notifications
- GET /notifications
- POST /notifications/preferences

---

## Non-Functional Requirements

- p95 API latency < 300ms for standard read paths
- Async pipeline for heavy AI tasks
- Idempotent unlock jobs (avoid duplicate release)
- Strong observability:
  - distributed tracing
  - per-service metrics
  - structured logs
- Backup + disaster recovery for capsule data

---

## MVP Delivery Plan (Practical)

Phase 1: Foundation
- Monorepo setup
- Auth + user service
- Capsule CRUD (without AI)
- Basic date-based unlock

Phase 2: Security
- Content encryption workflow
- Audit logging
- Security hardening and token rotation

Phase 3: AI v1
- Text sentiment + emotion labels
- Store AI metadata in MongoDB
- Display analysis in dashboard

Phase 4: Recommendation Engine
- Rule-based recommendation windows
- Event-driven unlock orchestration
- User notification delivery

Phase 5: Intelligence Upgrade
- Better context extraction
- Fine-tuned timing strategy
- Explainable recommendation reasons in UI

---

## Recommended Repo Layout

/apps
  /web-react
  /api-node
/services
  /scheduler-java
  /encryption-java
  /recommendation-java
  /ai-python
/packages
  /shared-types
  /shared-config
/infra
  /docker
  /k8s
  /terraform
/docs
  architecture.md
  api-contracts.md
  threat-model.md

---



This gives a working product loop early, before full AI complexity.
