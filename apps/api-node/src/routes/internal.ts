import { Router } from "express";
import { getCapsuleById, listDueWishCapsules, markWishCapsulePendingApproval, recordAuditLog } from "../services/repository.js";
import { sendWishCapsule } from "../services/wishService.js";

const router = Router();

router.get("/wish-capsules/due", async (_req, res) => {
  try {
    const capsules = await listDueWishCapsules(100);
    return res.json(capsules.map((capsule) => ({
      id: capsule.id,
      userId: capsule.userId,
      type: capsule.type,
      title: capsule.title,
      status: capsule.status,
      deliveryMode: capsule.deliveryMode,
      scheduledAt: capsule.scheduledAt,
      recipient: capsule.recipient,
      occasionType: capsule.occasionType,
      emailTemplateId: capsule.emailTemplateId
    })));
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/send-wish", async (req, res) => {
  try {
    const capsuleId = typeof req.body.capsuleId === "string" ? req.body.capsuleId : undefined;
    if (!capsuleId) {
      return res.status(400).json({ error: "capsuleId is required" });
    }

    const result = await sendWishCapsule(capsuleId, { source: "scheduler" });
    if (!result.sent && result.reason === "capsule-not-found") {
      return res.status(404).json({ error: "Wish capsule not found" });
    }

    if (!result.sent) {
      return res.status(409).json({ error: result.reason });
    }

    return res.json({ capsuleId, status: "sent" });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

router.post("/wish-capsules/:id/request-approval", async (req, res) => {
  try {
    const capsuleId = req.params.id;
    const reason = typeof req.body.reason === "string" && req.body.reason ? req.body.reason : "Wish capsule reached its scheduled time";
    const capsule = await getCapsuleById(capsuleId);
    if (!capsule || capsule.type !== "wish") {
      return res.status(404).json({ error: "Wish capsule not found" });
    }

    if (capsule.status === "pending_approval") {
      return res.json({ capsuleId, status: capsule.status, reason: "Already awaiting approval" });
    }

    const pending = await markWishCapsulePendingApproval(capsuleId);
    await recordAuditLog({
      capsuleId,
      userId: capsule.userId,
      action: "wish_pending_approval",
      category: "wish_capsule",
      status: pending?.status || capsule.status,
      details: { reason }
    });

    return res.json({ capsuleId, status: pending?.status || "pending_approval", reason });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

export default router;