import { redis } from "./db.js";
import { decryptCapsulePayload } from "./clients/encryptionClient.js";
import { findUserById, getCapsuleById, markWishCapsulePendingApproval, markWishCapsuleSent, recordAuditLog } from "./repository.js";
import { sendWishEmail } from "./emailService.js";
import { ackScheduledWish } from "./queue.js";
import { sendWishDeliveredEmail } from "./mailer.js";

const WISH_SEND_LOCK_PREFIX = "wish:send:lock:";
const WISH_SEND_RATE_PREFIX = "wish:send:rate:";
const DAILY_WISH_SEND_LIMIT = 5;

function toDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function acquireSendLock(capsuleId: string): Promise<boolean> {
  const lockKey = `${WISH_SEND_LOCK_PREFIX}${capsuleId}`;
  const response = await redis().set(lockKey, "1", { NX: true, EX: 60 });
  return response === "OK";
}

async function releaseSendLock(capsuleId: string): Promise<void> {
  await redis().del(`${WISH_SEND_LOCK_PREFIX}${capsuleId}`);
}

async function enforceWishRateLimit(recipientEmail: string): Promise<void> {
  const rateKey = `${WISH_SEND_RATE_PREFIX}${recipientEmail.toLowerCase()}:${toDateKey()}`;
  const count = await redis().incr(rateKey);
  if (count === 1) {
    await redis().expire(rateKey, 60 * 60 * 24);
  }

  if (count > DAILY_WISH_SEND_LIMIT) {
    throw new Error("Wish capsule send limit reached for today");
  }
}

export async function requestWishApproval(capsuleId: string, reason = "Wish capsule scheduled for manual approval"): Promise<{ capsuleId: string; status: string }> {
  const existing = await getCapsuleById(capsuleId);
  if (!existing || existing.type !== "wish") {
    throw new Error("Wish capsule not found");
  }

  if (existing.status === "pending_approval") {
    return { capsuleId: existing.id, status: existing.status };
  }

  const capsule = await markWishCapsulePendingApproval(capsuleId);
  if (!capsule) {
    throw new Error("Wish capsule not found");
  }

  await recordAuditLog({
    capsuleId: capsule.id,
    userId: capsule.userId,
    action: "approval_requested",
    category: "wish_capsule",
    status: capsule.status,
    details: { reason }
  });

  return { capsuleId: capsule.id, status: capsule.status };
}

export async function sendWishCapsule(capsuleId: string, context: { source: "manual" | "scheduler" | "approval" } = { source: "manual" }): Promise<{ sent: boolean; reason: string }> {
  const acquired = await acquireSendLock(capsuleId);
  if (!acquired) {
    return { sent: false, reason: "send-in-progress" };
  }

  try {
    const capsule = await getCapsuleById(capsuleId);
    if (!capsule || capsule.type !== "wish") {
      return { sent: false, reason: "capsule-not-found" };
    }

    if (!capsule.recipient?.email || !capsule.recipient?.name) {
      throw new Error("Wish capsule recipient is missing");
    }

    if (capsule.status === "sent") {
      return { sent: false, reason: "already-sent" };
    }

    const owner = await findUserById(capsule.userId);
    if (!owner) {
      throw new Error("Sender account not found");
    }

    if (capsule.encryptedPayload && capsule.recipient.email) {
      await enforceWishRateLimit(capsule.recipient.email);
    }

    const message = capsule.encryptedPayload ? await decryptCapsulePayload(capsule.encryptedPayload) : "";
    const resolvedMessage = typeof message === "string" && message.trim() ? message : "A special wish from SoulSafe AI.";

    await sendWishEmail({
      to: capsule.recipient.email,
      recipientName: capsule.recipient.name,
      senderName: owner.fullName,
      message: resolvedMessage,
      occasionType: capsule.occasionType || "custom",
      templateId: capsule.emailTemplateId
    });

    const updated = await markWishCapsuleSent(capsule.id);
    if (!updated) {
      throw new Error("Unable to mark wish capsule as sent");
    }

    await recordAuditLog({
      capsuleId: updated.id,
      userId: updated.userId,
      action: "wish_sent",
      category: "wish_capsule",
      status: updated.status,
      details: { source: context.source, recipientEmail: updated.recipient?.email, templateId: updated.emailTemplateId }
    });

    // remove any scheduled entry (best-effort)
    try {
      await ackScheduledWish(updated.id);
    } catch (err) {
      // ignore
    }

    // notify owner when delivery mode is auto
    try {
      if (updated.deliveryMode === "auto") {
        const ownerAccount = owner || (await findUserById(updated.userId));
        if (ownerAccount) {
          await sendWishDeliveredEmail({
            email: ownerAccount.email,
            fullName: ownerAccount.fullName,
            recipientName: updated.recipient?.name || "recipient",
            scheduledAt: updated.scheduledAt,
            sentAt: updated.sentAt,
            title: updated.title
          });
        }
      }
    } catch (err) {
      // best-effort notification
      console.warn("Failed to notify owner about delivered wish", err);
    }

    

    return { sent: true, reason: "sent" };
  } finally {
    await releaseSendLock(capsuleId);
  }
}