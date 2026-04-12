import { analyzeCapsule } from "../services/clients/aiClient.js";
import { decryptCapsulePayload } from "../services/clients/encryptionClient.js";
import { attachAiSignals, findUserById, getCapsuleById } from "../services/repository.js";
import { sendCapsuleAnalysisEmail } from "../services/mailer.js";
import { dequeueAiAnalysis } from "../services/queue.js";

const AI_POLL_INTERVAL_MS = 1500;

export function startAiWorker(): void {
  setInterval(async () => {
    const capsuleId = await dequeueAiAnalysis();
    if (!capsuleId) {
      return;
    }

    try {
      const capsule = await getCapsuleById(capsuleId);
      if (!capsule) {
        return;
      }

      const body = await decryptCapsulePayload(capsule.encryptedPayload);
      const analysis = await analyzeCapsule(capsuleId, body);
      if (!analysis) {
        return;
      }

      await attachAiSignals(capsuleId, analysis.sentimentScore, analysis.emotionLabels);

      const owner = await findUserById(capsule.userId);
      if (owner) {
        await sendCapsuleAnalysisEmail({
          email: owner.email,
          fullName: owner.fullName,
          title: capsule.title,
          sentimentScore: analysis.sentimentScore,
          emotionLabels: analysis.emotionLabels
        });
      }
    } catch (error) {
      console.error("AI worker failed", error);
    }
  }, AI_POLL_INTERVAL_MS);
}
