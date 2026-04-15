import { resilientJsonRequest } from "../httpClient.js";

type RecommendationResponse = {
  action: "unlock-now" | "delay-24h";
  reason: string;
  decisionReason: string;
  priorityScore?: number;
};

type RecommendationRequest = {
  triggerType: "date" | "event" | "emotion" | "manual";
  eventName?: string;
  sentimentScore?: number;
  dominantEmotion?: string;
  emotionSimilarityScore?: number;
  contextTags?: string[];
};

const recommendationUrl = process.env.RECOMMENDATION_URL || "http://localhost:8083";

export async function decideUnlock(payload: RecommendationRequest): Promise<RecommendationResponse> {
  try {
    return await resilientJsonRequest<RecommendationResponse>({
      serviceName: "recommendation-service",
      url: `${recommendationUrl}/recommendation/decide`,
      method: "POST",
      body: payload
    });
  } catch {
    return {
      action: "unlock-now",
      reason: "fallback policy",
      decisionReason: "Reached your scheduled unlock date"
    };
  }
}
