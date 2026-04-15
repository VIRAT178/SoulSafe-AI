import { redis } from "./db.js";

const AI_QUEUE = "queue:ai-analysis";
const SCHEDULED_UNLOCKS = "queue:scheduled-unlocks";
const EVENT_TRIGGER_CAPSULES = "queue:event-trigger-capsules";

export async function enqueueAiAnalysis(capsuleId: string): Promise<void> {
  await redis().rPush(AI_QUEUE, capsuleId);
}

export async function dequeueAiAnalysis(): Promise<string | null> {
  return redis().lPop(AI_QUEUE);
}

export async function scheduleUnlock(capsuleId: string, unlockAt: string): Promise<void> {
  const score = Date.parse(unlockAt);
  if (Number.isNaN(score)) {
    throw new Error("Invalid unlockAt timestamp");
  }

  await redis().zAdd(SCHEDULED_UNLOCKS, {
    score,
    value: capsuleId
  });
}

export async function getDueUnlockCapsules(limit = 20): Promise<string[]> {
  return redis().zRangeByScore(SCHEDULED_UNLOCKS, 0, Date.now(), {
    LIMIT: {
      offset: 0,
      count: limit
    }
  });
}

export async function ackScheduledUnlock(capsuleId: string): Promise<void> {
  await redis().zRem(SCHEDULED_UNLOCKS, capsuleId);
}

export async function rescheduleUnlockInHours(capsuleId: string, hours: number): Promise<void> {
  const score = Date.now() + hours * 60 * 60 * 1000;
  await redis().zAdd(SCHEDULED_UNLOCKS, {
    score,
    value: capsuleId
  });
}

export async function registerEventTriggerCapsule(capsuleId: string): Promise<void> {
  await redis().sAdd(EVENT_TRIGGER_CAPSULES, capsuleId);
}

export async function unregisterEventTriggerCapsule(capsuleId: string): Promise<void> {
  await redis().sRem(EVENT_TRIGGER_CAPSULES, capsuleId);
}

export async function listEventTriggerCapsules(limit = 100): Promise<string[]> {
  const capsuleIds = await redis().sMembers(EVENT_TRIGGER_CAPSULES);
  return capsuleIds.slice(0, limit);
}
