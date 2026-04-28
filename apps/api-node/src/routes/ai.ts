import { Router } from "express";
import { listAiTimeline } from "../services/repository.js";
import { verifyAccessToken } from "../services/tokens.js";
import { enhanceWishMessage } from "../services/aiEnhancementService.js";

const router = Router();

function getUserIdFromAuthHeader(authorization?: string): string {
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing bearer token");
  }

  return verifyAccessToken(authorization.replace("Bearer ", ""));
}

router.get("/timeline/:userId", async (req, res) => {
  try {
    const authUserId = getUserIdFromAuthHeader(req.headers.authorization);
    if (authUserId !== req.params.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const timeline = await listAiTimeline(req.params.userId);
    return res.json(timeline);
  } catch (error) {
    return res.status(401).json({ error: (error as Error).message });
  }
});

router.post("/enhance-message", async (req, res) => {
  try {
    const { recipientName, occasionType, message } = req.body;

    if (!recipientName || !occasionType || !message) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["recipientName", "occasionType", "message"],
      });
    }

    const suggestions = await enhanceWishMessage({
      recipientName,
      occasionType,
      message,
    });

    return res.json(suggestions);
  } catch (error) {
    console.error("Error enhancing message:", error);
    return res.status(500).json({
      error: "Failed to enhance message",
      message: (error as Error).message,
    });
  }
});

export default router;
