import { Router } from "express";
import { decryptCapsulePayload, encryptCapsulePayload } from "../services/clients/encryptionClient.js";
import { simulateUnlock } from "../services/clients/schedulerClient.js";
import {
  createCapsule,
  deleteCapsule,
  getLatestUnlockReason,
  getCapsuleById,
  listCapsules,
  lockCapsule,
  recordUnlockEvent,
  type UnlockEventRule,
  unlockCapsuleWithKey,
  updateCapsule
} from "../services/repository.js";
import { enqueueAiAnalysis, registerEventTriggerCapsule, scheduleUnlock } from "../services/queue.js";
import { sendCapsuleCreatedEmail } from "../services/mailer.js";
import { findUserById } from "../services/repository.js";
import { verifyAccessToken } from "../services/tokens.js";
import { processUnlockDecision } from "../services/unlockOrchestrator.js";
import { hashPassword } from "../services/security.js";

const router = Router();

function getUserIdFromAuthHeader(authorization?: string): string {
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing bearer token");
  }
  const token = authorization.replace("Bearer ", "");
  return verifyAccessToken(token);
}

function parseUnlockEventRule(value: unknown): UnlockEventRule | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as {
    type?: string;
    date?: string;
    metadata?: { personName?: string; eventName?: string };
  };

  if (!candidate.type || !["birthday", "exam", "breakup", "custom"].includes(candidate.type)) {
    throw new Error("Invalid unlockEventRules.type");
  }

  const parsed: UnlockEventRule = {
    type: candidate.type as UnlockEventRule["type"]
  };

  if (typeof candidate.date === "string" && candidate.date) {
    parsed.date = candidate.date;
  }

  if (candidate.metadata && typeof candidate.metadata === "object") {
    parsed.metadata = {
      personName: typeof candidate.metadata.personName === "string" ? candidate.metadata.personName : undefined,
      eventName: typeof candidate.metadata.eventName === "string" ? candidate.metadata.eventName : undefined
    };
  }

  return parsed;
}

async function toCapsuleResponse(capsule: {
  id: string;
  userId: string;
  title: string;
  encryptedPayload: string;
    mediaUrl?: string;
  status: "draft" | "locked" | "released";
  unlockAt?: string;
  unlockEventRules?: UnlockEventRule;
  sentimentScore?: number;
  dominantEmotion?: string;
  emotionLabels?: string[];
  analyzedAt?: string;
  createdAt: string;
  updatedAt: string;
}) {
  const body = capsule.status === "released" ? await decryptCapsulePayload(capsule.encryptedPayload) : null;
  return {
    id: capsule.id,
    userId: capsule.userId,
    title: capsule.title,
    body,
    mediaUrl: capsule.mediaUrl,
    status: capsule.status,
    unlockAt: capsule.unlockAt,
    unlockEventRules: capsule.unlockEventRules,
    sentimentScore: capsule.sentimentScore,
    dominantEmotion: capsule.dominantEmotion,
    emotionLabels: capsule.emotionLabels,
    analyzedAt: capsule.analyzedAt,
    createdAt: capsule.createdAt,
    updatedAt: capsule.updatedAt
  };
}

function isCapsuleOverdue(capsule: {
  status: "draft" | "locked" | "released";
  unlockAt?: string;
}): boolean {
  if (capsule.status !== "locked" || !capsule.unlockAt) {
    return false;
  }

  const unlockAtMs = Date.parse(capsule.unlockAt);
  return !Number.isNaN(unlockAtMs) && unlockAtMs <= Date.now();
}

async function refreshOverdueCapsuleState(capsule: {
  id: string;
  userId: string;
  title: string;
  encryptedPayload: string;
  mediaUrl?: string;
  status: "draft" | "locked" | "released";
  unlockAt?: string;
  unlockEventRules?: UnlockEventRule;
  sentimentScore?: number;
  dominantEmotion?: string;
  emotionLabels?: string[];
  analyzedAt?: string;
  createdAt: string;
  updatedAt: string;
}) {
  if (!isCapsuleOverdue(capsule)) {
    return capsule;
  }

  await processUnlockDecision(capsule.id);
  const refreshed = await getCapsuleById(capsule.id);
  return refreshed || capsule;
}

async function getOwnedCapsule(capsuleId: string, userId: string) {
  const capsule = await getCapsuleById(capsuleId);
  if (!capsule || capsule.userId !== userId) {
    return null;
  }

  return capsule;
}

router.post("/", async (req, res) => {
  try {
    const userId = getUserIdFromAuthHeader(req.headers.authorization);
    const { title, body, mediaUrl, unlockAt, unlockKey } = req.body;
    const unlockEventRules = parseUnlockEventRule(req.body.unlockEventRules);
    if (!title || !body) {
      return res.status(400).json({ error: "title and body are required" });
    }

    const encrypted = await encryptCapsulePayload(body);
    const capsule = await createCapsule({
      userId,
      title,
      encryptedPayload: encrypted.encryptedPayload,
      encryptionMethod: encrypted.method,
      mediaUrl: typeof mediaUrl === "string" ? mediaUrl : undefined,
      unlockAt: typeof unlockAt === "string" ? unlockAt : undefined,
      unlockEventRules,
      unlockKeyHash: typeof unlockKey === "string" && unlockKey ? hashPassword(unlockKey) : undefined
    });

    await enqueueAiAnalysis(capsule.id);

    if (typeof unlockAt === "string" && unlockAt) {
      await scheduleUnlock(capsule.id, unlockAt);
    }

    if (unlockEventRules) {
      await registerEventTriggerCapsule(capsule.id);
    }

    const created = await getCapsuleById(capsule.id);
    if (!created) {
      return res.status(500).json({ error: "Capsule created but not retrievable" });
    }

    const owner = await findUserById(userId);
    if (owner) {
      await sendCapsuleCreatedEmail({
        email: owner.email,
        fullName: owner.fullName,
        title: created.title,
        unlockAt: created.unlockAt,
        mediaAttached: Boolean(created.mediaUrl)
      });
    }

    return res.status(201).json(await toCapsuleResponse(created));
  } catch (error) {
    return res.status(401).json({ error: (error as Error).message });
  }
});

router.post("/:id/unlock-with-key", async (req, res) => {
  const { unlockKey } = req.body;
  if (!unlockKey) {
    return res.status(400).json({ error: "unlockKey is required" });
  }

  try {
    const userId = getUserIdFromAuthHeader(req.headers.authorization);
    const capsule = await getOwnedCapsule(req.params.id, userId);
    if (!capsule) {
      return res.status(404).json({ error: "Capsule not found" });
    }

    const released = await unlockCapsuleWithKey(capsule.id, String(unlockKey));
    if (!released) {
      return res.status(404).json({ error: "Capsule not found" });
    }

    await recordUnlockEvent({
      capsuleId: released.id,
      userId: released.userId,
      triggerType: "manual",
      decisionReason: "Opened early using your capsule encryption key",
      processedAt: new Date().toISOString()
    });

    return res.json(await toCapsuleResponse(released));
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

router.get("/", async (req, res) => {
  try {
    const userId = getUserIdFromAuthHeader(req.headers.authorization);
    const capsules = await listCapsules(userId);
    const normalized = await Promise.all(capsules.map((capsule) => refreshOverdueCapsuleState(capsule)));
    const response = await Promise.all(normalized.map((capsule) => toCapsuleResponse(capsule)));
    return res.json(response);
  } catch (error) {
    return res.status(401).json({ error: (error as Error).message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const userId = getUserIdFromAuthHeader(req.headers.authorization);
    const capsule = await getOwnedCapsule(req.params.id, userId);
    if (!capsule) {
      return res.status(404).json({ error: "Capsule not found" });
    }

    const normalized = await refreshOverdueCapsuleState(capsule);
    const payload = await toCapsuleResponse(normalized);
    const unlockReason = await getLatestUnlockReason(normalized.id);

    return res.json({
      ...payload,
      capsule: payload,
      unlockReason
    });
  } catch (error) {
    return res.status(401).json({ error: (error as Error).message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const userId = getUserIdFromAuthHeader(req.headers.authorization);
    const capsule = await getOwnedCapsule(req.params.id, userId);
    if (!capsule) {
      return res.status(404).json({ error: "Capsule not found" });
    }

    const updates: { title?: string; encryptedPayload?: string; encryptionMethod?: string } = {};
    if (req.body.title) {
      updates.title = req.body.title;
    }
    if (req.body.body) {
      const encrypted = await encryptCapsulePayload(req.body.body);
      updates.encryptedPayload = encrypted.encryptedPayload;
      updates.encryptionMethod = encrypted.method;
    }

    const updated = await updateCapsule(capsule.id, updates);
    if (!updated) {
      return res.status(404).json({ error: "Capsule not found" });
    }

    return res.json(await toCapsuleResponse(updated));
  } catch (error) {
    return res.status(401).json({ error: (error as Error).message });
  }
});

router.post("/:id/lock", async (req, res) => {
  const { unlockAt } = req.body;
  if (!unlockAt) {
    return res.status(400).json({ error: "unlockAt is required" });
  }

  try {
    const userId = getUserIdFromAuthHeader(req.headers.authorization);
    const capsule = await getOwnedCapsule(req.params.id, userId);
    if (!capsule) {
      return res.status(404).json({ error: "Capsule not found" });
    }

    const locked = await lockCapsule(capsule.id, unlockAt);
    if (!locked) {
      return res.status(404).json({ error: "Capsule not found" });
    }

    await scheduleUnlock(locked.id, unlockAt);
    await simulateUnlock(locked.id);
    return res.json(await toCapsuleResponse(locked));
  } catch (error) {
    return res.status(404).json({ error: (error as Error).message });
  }
});

router.post("/:id/release", async (req, res) => {
  try {
    const userId = getUserIdFromAuthHeader(req.headers.authorization);
    const capsule = await getOwnedCapsule(req.params.id, userId);
    if (!capsule) {
      return res.status(404).json({ error: "Capsule not found" });
    }

    const result = await processUnlockDecision(capsule.id, { triggerType: "manual" });
    if (result.reason === "capsule-not-found") {
      return res.status(404).json({ error: "Capsule not found" });
    }

    if (!result.released) {
      return res.status(409).json({
        error: "Unlock delayed by policy",
        reason: result.reason
      });
    }

    const released = await getCapsuleById(capsule.id);
    if (!released) {
      return res.status(404).json({ error: "Capsule not found" });
    }

    return res.json(await toCapsuleResponse(released));
  } catch (error) {
    return res.status(404).json({ error: (error as Error).message });
  }
});

router.post("/:id/simulate-release", async (req, res) => {
  try {
    const userId = getUserIdFromAuthHeader(req.headers.authorization);
    const capsule = await getOwnedCapsule(req.params.id, userId);
    if (!capsule) {
      return res.status(404).json({ error: "Capsule not found" });
    }

    await simulateUnlock(capsule.id);
    const result = await processUnlockDecision(capsule.id, { triggerType: "date" });
    if (result.reason === "capsule-not-found") {
      return res.status(404).json({ error: "Capsule not found" });
    }

    if (!result.released) {
      return res.status(409).json({ error: "Unlock delayed by AI policy", reason: result.reason });
    }

    const released = await getCapsuleById(capsule.id);
    if (!released) {
      return res.status(404).json({ error: "Capsule not found" });
    }

    return res.json(await toCapsuleResponse(released));
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const userId = getUserIdFromAuthHeader(req.headers.authorization);
    const removed = await deleteCapsule(req.params.id, userId);

    if (!removed) {
      return res.status(404).json({ error: "Capsule not found" });
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(401).json({ error: (error as Error).message });
  }
});

export default router;
