import { resilientJsonRequest } from "../httpClient.js";

type SchedulerResponse = {
  event: string;
  capsuleId: string;
  simulatedAt: string;
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
