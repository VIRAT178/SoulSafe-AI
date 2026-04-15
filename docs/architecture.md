# Architecture

## Platform Topology
- UI: React app for capsule lifecycle and notification feed.
- Core API: Node.js external gateway and domain API.
- Microservices: Java scheduler, encryption, recommendation.
- AI: Python FastAPI service for sentiment and context.
- Data: MongoDB (persistent), Redis (ephemeral queue/cache).

## Communication Pattern
- Synchronous: REST from web -> API and API -> internal services.
- Asynchronous target state: queue-based unlock and analysis workflows.

## Event-Based Unlocking
- Capsules can now be unlocked by date and event rules (birthday, exam, breakup, custom).
- API stores event rules on capsules and registers event jobs in Redis.
- Scheduler service evaluates event rules and returns idempotent trigger decisions.
- Unlock worker merges date and event triggers before recommendation policy is applied.

## AI Timeline and Explainability
- AI analysis now persists sentiment score, dominant emotion, analyzed timestamp, and emotion similarity.
- API exposes emotion timeline per user for UI visualization.
- Unlock decisions persist decision reasons in unlock_events and are returned by capsule detail API.

## Security Baseline
- JWT access and refresh rotation.
- Content-level encryption through dedicated service.
- Audit event capture for all sensitive access operations.
