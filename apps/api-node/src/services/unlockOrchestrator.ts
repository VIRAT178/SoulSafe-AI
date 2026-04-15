import { decideUnlock } from "./clients/recommendationClient.js";
import { findUserById, getCapsuleById, recordUnlockEvent, releaseCapsule } from "./repository.js";
import { sendCapsuleOpenedEmail } from "./mailer.js";

type UnlockContext = {
  triggerType?: "date" | "event" | "emotion" | "manual";
  eventName?: string;
};

export async function processUnlockDecision(
  capsuleId: string,
  context: UnlockContext = {}
): Promise<{ released: boolean; reason: string; decisionReason?: string }> {
  const capsule = await getCapsuleById(capsuleId);
  if (!capsule) {
    return { released: false, reason: "capsule-not-found" };
  }

  if (capsule.status === "released") {
    return { released: false, reason: "already-released" };
  }

  const triggerType = context.triggerType || "date";
  const recommendation = await decideUnlock({
    triggerType,
    eventName: context.eventName,
    sentimentScore: capsule.sentimentScore,
    dominantEmotion: capsule.dominantEmotion,
    emotionSimilarityScore: capsule.emotionSimilarityScore,
    contextTags: capsule.contextTags
  });

  if (recommendation.action === "delay-24h") {
    return { released: false, reason: recommendation.reason, decisionReason: recommendation.decisionReason };
  }

  const released = await releaseCapsule(capsuleId);
  if (!released) {
    return { released: false, reason: "already-released" };
  }

  const owner = await findUserById(released.userId);
  if (owner) {
    await sendCapsuleOpenedEmail({
      email: owner.email,
      fullName: owner.fullName,
      title: released.title,
      openedAt: released.updatedAt
    });
  }

  await recordUnlockEvent({
    capsuleId: released.id,
    userId: released.userId,
    triggerType,
    decisionReason: recommendation.decisionReason,
    eventName: context.eventName,
    processedAt: new Date().toISOString()
  });

  return { released: true, reason: recommendation.reason, decisionReason: recommendation.decisionReason };
}
