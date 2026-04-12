import { resilientJsonRequest } from "../httpClient.js";

type RecommendationResponse = {
  action: "unlock-now" | "delay-24h";
  reason: string;
};

const recommendationUrl = process.env.RECOMMENDATION_URL || "http://localhost:8083";

export async function decideUnlock(sentiment: string): Promise<RecommendationResponse> {
  try {
    return await resilientJsonRequest<RecommendationResponse>({
      serviceName: "recommendation-service",
      url: `${recommendationUrl}/recommendation/decide`,
      method: "POST",
      body: { sentiment }
    });
  } catch {
    return { action: "unlock-now", reason: "fallback policy" };
  }
}
