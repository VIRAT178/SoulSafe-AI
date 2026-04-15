import { resilientJsonRequest } from "../httpClient.js";

type AnalyzeResponse = {
  sentimentScore: number;
  emotionLabels: string[];
  contextTags?: string[];
  recommendationHints?: string[];
  sentimentTrendScore?: number;
  dominantEmotion?: string;
  analyzedAt?: string;
  emotionSimilarityScore?: number;
  transcriptDetected?: boolean;
  recommendationSummary?: string | null;
};

const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";

export async function analyzeCapsule(capsuleId: string, text: string): Promise<AnalyzeResponse | null> {
  try {
    return await resilientJsonRequest<AnalyzeResponse>({
      serviceName: "ai-service",
      url: `${aiServiceUrl}/ai/analyze`,
      method: "POST",
      body: { capsuleId, text }
    });
  } catch {
    return null;
  }
}
