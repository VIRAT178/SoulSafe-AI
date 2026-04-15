import { resilientJsonRequest } from "../httpClient.js";
import type { UnlockEventRule } from "../repository.js";

type SchedulerResponse = {
  event: string;
  capsuleId: string;
  simulatedAt: string;
};

export type EventTriggerEvaluation = {
  capsuleId: string;
  triggered: boolean;
  triggerType: "event" | "date" | "none";
  eventName?: string;
  decisionReason?: string;
  idempotencyKey?: string;
};

const schedulerUrl = process.env.SCHEDULER_URL || "http://localhost:8081";

export async function simulateUnlock(capsuleId: string): Promise<SchedulerResponse | null> {
  try {
    return await resilientJsonRequest<SchedulerResponse>({
      serviceName: "scheduler-service",
      url: `${schedulerUrl}/scheduler/simulate-unlock`,
      method: "POST",
      body: { capsuleId }
    });
  } catch {
    return null;
  }
}

export async function evaluateEventTrigger(
  capsuleId: string,
  rule: UnlockEventRule,
  nowIso = new Date().toISOString()
): Promise<EventTriggerEvaluation | null> {
  try {
    return await resilientJsonRequest<EventTriggerEvaluation>({
      serviceName: "scheduler-service",
      url: `${schedulerUrl}/scheduler/evaluate-event`,
      method: "POST",
      body: {
        capsuleId,
        now: nowIso,
        rule
      }
    });
  } catch {
    return null;
  }
}
