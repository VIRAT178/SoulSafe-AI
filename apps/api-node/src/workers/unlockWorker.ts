import { evaluateEventTrigger } from "../services/clients/schedulerClient.js";
import { listEventRuleCapsules } from "../services/repository.js";
import { processUnlockDecision } from "../services/unlockOrchestrator.js";
import {
  ackScheduledUnlock,
  getDueUnlockCapsules,
  listEventTriggerCapsules,
  rescheduleUnlockInHours,
  unregisterEventTriggerCapsule
} from "../services/queue.js";

const UNLOCK_POLL_INTERVAL_MS = 2000;

export function startUnlockWorker(): void {
  setInterval(async () => {
    try {
      const dueCapsules = await getDueUnlockCapsules(30);
      for (const capsuleId of dueCapsules) {
        const result = await processUnlockDecision(capsuleId, { triggerType: "date" });
        if (!result.released && result.reason !== "capsule-not-found" && result.reason !== "already-released") {
          await rescheduleUnlockInHours(capsuleId, 24);
        }

        await ackScheduledUnlock(capsuleId);
      }

      const queuedEventCapsules = await listEventTriggerCapsules(100);
      const eventRuleCapsules = await listEventRuleCapsules(100);
      const eventRuleMap = new Map(eventRuleCapsules.map((capsule) => [capsule.id, capsule]));

      for (const capsuleId of queuedEventCapsules) {
        const capsule = eventRuleMap.get(capsuleId);
        if (!capsule || !capsule.unlockEventRules) {
          await unregisterEventTriggerCapsule(capsuleId);
          continue;
        }

        const evaluation = await evaluateEventTrigger(capsule.id, capsule.unlockEventRules);
        if (!evaluation?.triggered) {
          continue;
        }

        const result = await processUnlockDecision(capsule.id, {
          triggerType: "event",
          eventName: evaluation.eventName
        });

        if (result.released || result.reason === "already-released" || result.reason === "capsule-not-found") {
          await unregisterEventTriggerCapsule(capsule.id);
        }
      }
    } catch (error) {
      console.error("Unlock worker failed", error);
    }
  }, UNLOCK_POLL_INTERVAL_MS);
}
