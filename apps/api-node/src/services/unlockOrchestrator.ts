import { decideUnlock } from "./clients/recommendationClient.js";
import { findUserById, getCapsuleById, releaseCapsule } from "./repository.js";
import { sendCapsuleOpenedEmail } from "./mailer.js";

export async function processUnlockDecision(capsuleId: string): Promise<{ released: boolean; reason: string }> {
  const capsule = await getCapsuleById(capsuleId);
  if (!capsule) {
    return { released: false, reason: "capsule-not-found" };
  }

  const sentimentLabel = (capsule.sentimentScore || 0) < -0.3 ? "sad" : "neutral";
  const recommendation = await decideUnlock(sentimentLabel);

  if (recommendation.action === "delay-24h") {
    return { released: false, reason: recommendation.reason };
  }

  const released = await releaseCapsule(capsuleId);
  if (!released) {
    return { released: false, reason: "capsule-not-found" };
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

  return { released: true, reason: recommendation.reason };
}
