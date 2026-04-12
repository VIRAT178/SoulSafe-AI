# Threat Model (Initial)

## Assets
- Capsule payloads and metadata
- User identity and refresh tokens
- Unlock decision logs

## Primary Risks
- Unauthorized access to locked capsules
- Token theft and replay
- Service-to-service trust boundary bypass
- Sensitive memory leakage in logs

## Controls
- Enforce least privilege between services.
- Sign and rotate JWT secrets.
- Encrypt payloads before persistence.
- Keep logs structured and redact sensitive fields.
- Add audit trails for read/release/download actions.
