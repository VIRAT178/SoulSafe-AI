import { Router } from "express";
import { encryptCapsulePayload } from "../services/clients/encryptionClient.js";
import { verifyAccessToken } from "../services/tokens.js";
import { hashPassword } from "../services/security.js";
import {
  createCapsule,
  deleteCapsule,
  getCapsuleById,
  listWishCapsules,
  type CapsuleRecord,
  type WishDeliveryMode,
  type WishOccasionType,
  type WishRecipient,
  updateCapsule
} from "../services/repository.js";
import { toCapsuleResponse } from "./capsules.js";
import { sendWishCapsule } from "../services/wishService.js";
import { scheduleWish, ackScheduledWish } from "../services/queue.js";

const router = Router();

function getUserIdFromAuthHeader(authorization?: string): string {
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing bearer token");
  }

  const token = authorization.replace("Bearer ", "");
  return verifyAccessToken(token);
}

function parseRecipient(value: unknown): WishRecipient {
  if (!value || typeof value !== "object") {
    throw new Error("recipient is required");
  }

  const candidate = value as Partial<WishRecipient>;
  if (typeof candidate.name !== "string" || !candidate.name.trim()) {
    throw new Error("recipient.name is required");
  }

  if (typeof candidate.email !== "string" || !/.+@.+\..+/.test(candidate.email)) {
    throw new Error("recipient.email must be a valid email address");
  }

  const recipient: WishRecipient = {
    name: candidate.name.trim(),
    email: candidate.email.trim()
  };

  if (typeof candidate.dob === "string" && candidate.dob) {
    recipient.dob = candidate.dob;
  }

  return recipient;
}

function resolveScheduledAt(recipient: WishRecipient, occasionType: WishOccasionType, scheduledAt?: string): string {
  if (scheduledAt) {
    const parsed = new Date(scheduledAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("scheduledAt must be a valid date-time");
    }

    return parsed.toISOString();
  }

  if (occasionType === "birthday" && recipient.dob) {
    const dob = new Date(recipient.dob);
    if (!Number.isNaN(dob.getTime())) {
      const now = new Date();
      const thisYear = new Date(Date.UTC(now.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate(), 9, 0, 0, 0));
      return (thisYear.getTime() >= now.getTime() ? thisYear : new Date(Date.UTC(now.getUTCFullYear() + 1, dob.getUTCMonth(), dob.getUTCDate(), 9, 0, 0, 0))).toISOString();
    }
  }

  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

async function getOwnedWishCapsule(capsuleId: string, userId: string): Promise<CapsuleRecord | null> {
  const capsule = await getCapsuleById(capsuleId);
  if (!capsule || capsule.userId !== userId || capsule.type !== "wish") {
    return null;
  }

  return capsule;
}

router.post("/", async (req, res) => {
  try {
    const userId = getUserIdFromAuthHeader(req.headers.authorization);
    const recipient = parseRecipient(req.body.recipient);
    const message = typeof req.body.message === "string" ? req.body.message : typeof req.body.body === "string" ? req.body.body : "";
    const occasionType = (req.body.occasionType as WishOccasionType) || "custom";
    const deliveryMode = (req.body.deliveryMode as WishDeliveryMode) || "auto";
    const emailTemplateId = typeof req.body.emailTemplateId === "string" && req.body.emailTemplateId ? req.body.emailTemplateId : occasionType;
    const scheduledAt = resolveScheduledAt(recipient, occasionType, typeof req.body.scheduledAt === "string" ? req.body.scheduledAt : undefined);

    if (!message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const encrypted = await encryptCapsulePayload(message);
    const capsule = await createCapsule({
      userId,
      type: "wish",
      title: typeof req.body.title === "string" && req.body.title.trim() ? req.body.title : `Wish for ${recipient.name}`,
      encryptedPayload: encrypted.encryptedPayload,
      encryptionMethod: encrypted.method,
      recipient,
      occasionType,
      deliveryMode,
      emailTemplateId,
      scheduledAt,
      status: deliveryMode === "manual_approval" ? "pending_approval" : "scheduled_for_delivery",
      unlockKeyHash: typeof req.body.unlockKey === "string" && req.body.unlockKey ? hashPassword(req.body.unlockKey) : undefined
    });

    if (capsule.scheduledAt) {
      try {
        await scheduleWish(capsule.id, capsule.scheduledAt);
      } catch (err) {
        // scheduling failure shouldn't break creation flow
        console.warn("Failed to schedule wish in queue", err);
      }
    }

    return res.status(201).json(await toCapsuleResponse(capsule));
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

router.get("/", async (req, res) => {
  try {
    const userId = getUserIdFromAuthHeader(req.headers.authorization);
    const capsules = await listWishCapsules(userId);
    const response = await Promise.all(capsules.map((capsule) => toCapsuleResponse(capsule)));
    return res.json(response);
  } catch (error) {
    return res.status(401).json({ error: (error as Error).message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const userId = getUserIdFromAuthHeader(req.headers.authorization);
    const capsule = await getOwnedWishCapsule(req.params.id, userId);
    if (!capsule) {
      return res.status(404).json({ error: "Wish capsule not found" });
    }

    return res.json(await toCapsuleResponse(capsule));
  } catch (error) {
    return res.status(401).json({ error: (error as Error).message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const userId = getUserIdFromAuthHeader(req.headers.authorization);
    const capsule = await getOwnedWishCapsule(req.params.id, userId);
    if (!capsule) {
      return res.status(404).json({ error: "Wish capsule not found" });
    }

    const updates: Record<string, unknown> = {};
    if (typeof req.body.title === "string" && req.body.title.trim()) {
      updates.title = req.body.title;
    }

    if (req.body.recipient) {
      updates.recipient = parseRecipient(req.body.recipient);
    }

    if (typeof req.body.occasionType === "string") {
      updates.occasionType = req.body.occasionType;
    }

    if (typeof req.body.deliveryMode === "string") {
      updates.deliveryMode = req.body.deliveryMode;
    }

    if (typeof req.body.emailTemplateId === "string") {
      updates.emailTemplateId = req.body.emailTemplateId;
    }

    if (typeof req.body.scheduledAt === "string") {
      const parsed = new Date(req.body.scheduledAt);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: "scheduledAt must be a valid date-time" });
      }

      updates.scheduledAt = parsed.toISOString();
    }

    if (typeof req.body.message === "string" && req.body.message.trim()) {
      const encrypted = await encryptCapsulePayload(req.body.message);
      updates.encryptedPayload = encrypted.encryptedPayload;
      updates.encryptionMethod = encrypted.method;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "deliveryMode")) {
      updates.status = req.body.deliveryMode === "manual_approval" ? "pending_approval" : "scheduled_for_delivery";
    }

    const updated = await updateCapsule(capsule.id, updates as Parameters<typeof updateCapsule>[1]);
    if (!updated) {
      return res.status(404).json({ error: "Wish capsule not found" });
    }

    if (updated.scheduledAt) {
      try {
        await scheduleWish(updated.id, updated.scheduledAt);
      } catch (err) {
        console.warn("Failed to schedule updated wish in queue", err);
      }
    }

    return res.json(await toCapsuleResponse(updated));
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

router.post('/:id/send-now', async (req, res) => {
  try {
    const userId = getUserIdFromAuthHeader(req.headers.authorization);
    const capsule = await getOwnedWishCapsule(req.params.id, userId);
    if (!capsule) {
      return res.status(404).json({ error: "Wish capsule not found" });
    }

    const result = await sendWishCapsule(capsule.id, { source: "manual" });
    if (!result.sent && result.reason === "capsule-not-found") {
      return res.status(404).json({ error: "Wish capsule not found" });
    }

    if (!result.sent) {
      return res.status(409).json({ error: result.reason });
    }

    const refreshed = await getCapsuleById(capsule.id);
    try {
      await ackScheduledWish(capsule.id);
    } catch (err) {
      // best-effort
    }

    return res.json(await toCapsuleResponse(refreshed || capsule));
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const userId = getUserIdFromAuthHeader(req.headers.authorization);
    const capsule = await getOwnedWishCapsule(req.params.id, userId);
    if (!capsule) {
      return res.status(404).json({ error: "Wish capsule not found" });
    }

    const result = await sendWishCapsule(capsule.id, { source: "approval" });
    if (!result.sent) {
      return res.status(409).json({ error: result.reason });
    }

    const refreshed = await getCapsuleById(capsule.id);
    try {
      await ackScheduledWish(capsule.id);
    } catch (err) {
      // best-effort
    }

    return res.json(await toCapsuleResponse(refreshed || capsule));
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserIdFromAuthHeader(req.headers.authorization);
    const capsule = await getOwnedWishCapsule(req.params.id, userId);
    if (!capsule) {
      return res.status(404).json({ error: "Wish capsule not found" });
    }

    const removed = await deleteCapsule(req.params.id, userId);
    if (!removed) {
      return res.status(404).json({ error: "Wish capsule not found" });
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(401).json({ error: (error as Error).message });
  }
});

export default router;