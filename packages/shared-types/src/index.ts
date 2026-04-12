export type CapsuleStatus = "draft" | "locked" | "released" | "archived";

export type Capsule = {
  id: string;
  userId: string;
  title: string;
  body?: string;
  status: CapsuleStatus;
  unlockAt?: string;
};

export type AiAnalysis = {
  capsuleId: string;
  sentimentScore: number;
  emotionLabels: string[];
  contextTags: string[];
  recommendationHints: string[];
};
