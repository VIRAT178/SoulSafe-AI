import { processUnlockDecision } from "../services/unlockOrchestrator.js";
import { ackScheduledUnlock, getDueUnlockCapsules, rescheduleUnlockInHours } from "../services/queue.js";

const UNLOCK_POLL_INTERVAL_MS = 2000;

export function startUnlockWorker(): void {
  setInterval(async () => {
    try {
      const dueCapsules = await getDueUnlockCapsules(30);
      for (const capsuleId of dueCapsules) {
        const result = await processUnlockDecision(capsuleId);
        if (!result.released && result.reason !== "capsule-not-found") {
          await rescheduleUnlockInHours(capsuleId, 24);
        }

        await ackScheduledUnlock(capsuleId);
      }
    } catch (error) {
      console.error("Unlock worker failed", error);
    }
  }, UNLOCK_POLL_INTERVAL_MS);
}
