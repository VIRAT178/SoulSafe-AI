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

## Security Baseline
- JWT access and refresh rotation.
- Content-level encryption through dedicated service.
- Audit event capture for all sensitive access operations.
