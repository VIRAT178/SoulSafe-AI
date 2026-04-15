import { MongoClient, ObjectId } from "mongodb";
import { createClient, type RedisClientType } from "redis";
import { runMongoMigrations } from "./migrations.js";

export type UserDoc = {
  _id: ObjectId;
  username?: string;
  fullName: string;
  email: string;
  passwordHash: string;
  profilePicUrl?: string;
  bio?: string;
  isEmailVerified: boolean;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CapsuleDoc = {
  _id: ObjectId;
  userId: string;
  title: string;
  encryptedPayload: string;
  encryptionMethod: string;
  mediaUrl?: string;
  status: "draft" | "locked" | "released";
  unlockAt?: string;
  unlockEventRules?: {
    type: "birthday" | "exam" | "breakup" | "custom";
    date?: string;
    metadata?: {
      personName?: string;
      eventName?: string;
    };
  };
  unlockKeyHash?: string;
  sentimentScore?: number;
  dominantEmotion?: string;
  emotionLabels?: string[];
  contextTags?: string[];
  analyzedAt?: string;
  emotionSimilarityScore?: number;
  createdAt: string;
  updatedAt: string;
};

export type AiAnalysisDoc = {
  _id: ObjectId;
  capsuleId: string;
  userId: string;
  capsuleTitle: string;
  sentimentScore: number;
  dominantEmotion: string;
  emotionLabels: string[];
  contextTags: string[];
  emotionSimilarityScore: number;
  analyzedAt: string;
};

export type UnlockEventDoc = {
  _id: ObjectId;
  capsuleId: string;
  userId: string;
  triggerType: "date" | "event" | "emotion" | "manual";
  decisionReason: string;
  eventName?: string;
  processedAt: string;
};

const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/soulsafe";
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const mongoClient = new MongoClient(mongoUri);
const redisClient: RedisClientType = createClient({ url: redisUrl });

let isConnected = false;

export async function connectDatastores(): Promise<void> {
  if (isConnected) {
    return;
  }

  await mongoClient.connect();
  await redisClient.connect();
  await runMongoMigrations(mongoClient.db());

  isConnected = true;
}

export function usersCollection() {
  return mongoClient.db().collection<UserDoc>("users");
}

export function capsulesCollection() {
  return mongoClient.db().collection<CapsuleDoc>("capsules");
}

export function aiAnalysesCollection() {
  return mongoClient.db().collection<AiAnalysisDoc>("ai_analyses");
}

export function unlockEventsCollection() {
  return mongoClient.db().collection<UnlockEventDoc>("unlock_events");
}

export function redis(): RedisClientType {
  return redisClient;
}
