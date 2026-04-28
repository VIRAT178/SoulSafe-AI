import { ObjectId } from "mongodb";
import {
  aiAnalysesCollection,
  auditLogsCollection,
  capsulesCollection,
  type CapsuleDoc,
  unlockEventsCollection,
  usersCollection
} from "./db.js";
import { verifyPassword } from "./security.js";

export type CapsuleType = "personal" | "wish";
export type WishOccasionType = "birthday" | "anniversary" | "graduation" | "custom";
export type WishDeliveryMode = "auto" | "manual_approval";
export type CapsuleStatus = "draft" | "locked" | "released" | "scheduled_for_delivery" | "sent" | "pending_approval";

export type WishRecipient = {
  name: string;
  email: string;
  dob?: string;
};

export type UnlockEventRule = {
  type: "birthday" | "exam" | "breakup" | "custom";
  date?: string;
  metadata?: {
    personName?: string;
    eventName?: string;
  };
};

export type UserRecord = {
  id: string;
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

export type CapsuleRecord = {
  id: string;
  userId: string;
  type: CapsuleType;
  title: string;
  encryptedPayload: string;
  encryptionMethod: string;
  mediaUrl?: string;
  status: CapsuleStatus;
  unlockAt?: string;
  unlockEventRules?: UnlockEventRule;
  recipient?: WishRecipient;
  occasionType?: WishOccasionType;
  deliveryMode?: WishDeliveryMode;
  emailTemplateId?: string;
  scheduledAt?: string;
  sentAt?: string;
  sentimentScore?: number;
  dominantEmotion?: string;
  emotionLabels?: string[];
  contextTags?: string[];
  analyzedAt?: string;
  emotionSimilarityScore?: number;
  createdAt: string;
  updatedAt: string;
};

export type AiTimelinePoint = {
  capsuleId: string;
  date: string;
  sentimentScore: number;
  emotion: string;
  capsuleTitle: string;
};

export type UnlockEventRecord = {
  capsuleId: string;
  userId: string;
  triggerType: "date" | "event" | "emotion" | "manual";
  decisionReason: string;
  eventName?: string;
  processedAt: string;
};

function toUserRecord(doc: {
  _id: ObjectId;
  fullName: string;
  email: string;
  passwordHash: string;
  profilePicUrl?: string;
  bio?: string;
  isEmailVerified?: boolean;
  verifiedAt?: string;
  createdAt: string;
  updatedAt?: string;
}): UserRecord {
  return {
    id: doc._id.toHexString(),
    fullName: doc.fullName,
    email: doc.email,
    passwordHash: doc.passwordHash,
    profilePicUrl: doc.profilePicUrl,
    bio: doc.bio,
    isEmailVerified: doc.isEmailVerified ?? false,
    verifiedAt: doc.verifiedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt || doc.createdAt
  };
}

function toCapsuleRecord(doc: CapsuleDoc): CapsuleRecord {
  return {
    id: doc._id.toHexString(),
    userId: doc.userId,
    type: doc.type || "personal",
    title: doc.title,
    encryptedPayload: doc.encryptedPayload,
    encryptionMethod: doc.encryptionMethod,
    mediaUrl: doc.mediaUrl,
    status: doc.status,
    unlockAt: doc.unlockAt,
    unlockEventRules: doc.unlockEventRules,
    recipient: doc.recipient,
    occasionType: doc.occasionType,
    deliveryMode: doc.deliveryMode,
    emailTemplateId: doc.emailTemplateId,
    scheduledAt: doc.scheduledAt,
    sentAt: doc.sentAt,
    sentimentScore: doc.sentimentScore,
    dominantEmotion: doc.dominantEmotion,
    emotionLabels: doc.emotionLabels,
    contextTags: doc.contextTags,
    analyzedAt: doc.analyzedAt,
    emotionSimilarityScore: doc.emotionSimilarityScore,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export async function createUser(input: {
  fullName: string;
  email: string;
  passwordHash: string;
  profilePicUrl?: string;
  bio?: string;
}): Promise<UserRecord> {
  const now = new Date().toISOString();
  const result = await usersCollection().insertOne({
    _id: new ObjectId(),
    username: input.email,
    fullName: input.fullName,
    email: input.email,
    passwordHash: input.passwordHash,
    profilePicUrl: input.profilePicUrl,
    bio: input.bio,
    isEmailVerified: false,
    createdAt: now,
    updatedAt: now
  });

  return {
    id: result.insertedId.toHexString(),
    fullName: input.fullName,
    email: input.email,
    passwordHash: input.passwordHash,
    profilePicUrl: input.profilePicUrl,
    bio: input.bio,
    isEmailVerified: false,
    createdAt: now,
    updatedAt: now
  };
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const doc = await usersCollection().findOne({ email });
  return doc ? toUserRecord(doc) : null;
}

export async function findUserById(userId: string): Promise<UserRecord | null> {
  const doc = await usersCollection().findOne({ _id: new ObjectId(userId) });
  return doc ? toUserRecord(doc) : null;
}

export async function markUserEmailVerified(userId: string): Promise<UserRecord | null> {
  const now = new Date().toISOString();
  const updated = await usersCollection().findOneAndUpdate(
    { _id: new ObjectId(userId) },
    {
      $set: {
        isEmailVerified: true,
        verifiedAt: now,
        updatedAt: now
      }
    },
    { returnDocument: "after" }
  );

  return updated ? toUserRecord(updated) : null;
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<UserRecord | null> {
  const now = new Date().toISOString();
  const updated = await usersCollection().findOneAndUpdate(
    { _id: new ObjectId(userId) },
    {
      $set: {
        passwordHash,
        updatedAt: now
      }
    },
    { returnDocument: "after" }
  );

  return updated ? toUserRecord(updated) : null;
}

export async function updateUserProfile(
  userId: string,
  updates: {
    fullName?: string;
    profilePicUrl?: string;
    bio?: string;
  }
): Promise<UserRecord | null> {
  const now = new Date().toISOString();
  const setFields: Record<string, string | undefined> = { updatedAt: now };

  if (typeof updates.fullName === "string") {
    setFields.fullName = updates.fullName;
  }

  if (typeof updates.profilePicUrl === "string") {
    setFields.profilePicUrl = updates.profilePicUrl;
  }

  if (typeof updates.bio === "string") {
    setFields.bio = updates.bio;
  }

  const updated = await usersCollection().findOneAndUpdate(
    { _id: new ObjectId(userId) },
    { $set: setFields },
    { returnDocument: "after" }
  );

  return updated ? toUserRecord(updated) : null;
}

export async function createCapsule(input: {
  userId: string;
  title: string;
  encryptedPayload: string;
  encryptionMethod: string;
  type?: CapsuleType;
  mediaUrl?: string;
  unlockAt?: string;
  unlockEventRules?: UnlockEventRule;
  unlockKeyHash?: string;
  recipient?: WishRecipient;
  occasionType?: WishOccasionType;
  deliveryMode?: WishDeliveryMode;
  emailTemplateId?: string;
  scheduledAt?: string;
  status?: CapsuleStatus;
}): Promise<CapsuleRecord> {
  const now = new Date().toISOString();
  const hasEventRule = Boolean(input.unlockEventRules?.type);
  const capsuleType = input.type || "personal";
  const resolvedStatus =
    input.status ||
    (capsuleType === "wish"
      ? input.deliveryMode === "manual_approval"
        ? "pending_approval"
        : input.scheduledAt
          ? "scheduled_for_delivery"
          : "draft"
      : input.unlockAt || input.unlockKeyHash || hasEventRule
        ? "locked"
        : "draft");
  const doc: CapsuleDoc = {
    _id: new ObjectId(),
    userId: input.userId,
    type: capsuleType,
    title: input.title,
    encryptedPayload: input.encryptedPayload,
    encryptionMethod: input.encryptionMethod,
    mediaUrl: input.mediaUrl,
    status: resolvedStatus,
    unlockAt: input.unlockAt,
    unlockEventRules: input.unlockEventRules,
    unlockKeyHash: input.unlockKeyHash,
    recipient: input.recipient,
    occasionType: input.occasionType,
    deliveryMode: input.deliveryMode,
    emailTemplateId: input.emailTemplateId,
    scheduledAt: input.scheduledAt,
    createdAt: now,
    updatedAt: now
  };

  await capsulesCollection().insertOne(doc);
  return toCapsuleRecord(doc);
}

export async function listCapsules(userId: string): Promise<CapsuleRecord[]> {
  const docs = await capsulesCollection().find({ userId }).sort({ createdAt: -1 }).toArray();
  return docs.map(toCapsuleRecord);
}

export async function listWishCapsules(userId: string): Promise<CapsuleRecord[]> {
  const docs = await capsulesCollection().find({ userId, type: "wish" }).sort({ createdAt: -1 }).toArray();
  return docs.map(toCapsuleRecord);
}

export async function listDueWishCapsules(limit = 100): Promise<CapsuleRecord[]> {
  const now = Date.now();
  const docs = await capsulesCollection()
    .find({
      type: "wish",
      status: { $in: ["scheduled_for_delivery", "pending_approval"] },
      scheduledAt: { $exists: true }
    })
    .sort({ scheduledAt: 1 })
    .limit(limit * 3)
    .toArray();

  const dueDocs = docs
    .filter((doc) => {
      if (!doc.scheduledAt) {
        return false;
      }

      const scheduledMs = new Date(doc.scheduledAt).getTime();
      return !Number.isNaN(scheduledMs) && scheduledMs <= now;
    })
    .slice(0, limit);

  return dueDocs.map(toCapsuleRecord);
}

export async function getCapsuleById(capsuleId: string): Promise<CapsuleRecord | null> {
  const doc = await capsulesCollection().findOne({ _id: new ObjectId(capsuleId) });
  return doc ? toCapsuleRecord(doc) : null;
}

export async function updateCapsule(
  capsuleId: string,
  updates: Partial<Pick<CapsuleRecord, "title" | "encryptedPayload" | "encryptionMethod" | "type" | "recipient" | "occasionType" | "deliveryMode" | "emailTemplateId" | "scheduledAt" | "status" | "sentAt" | "mediaUrl" | "unlockAt" | "unlockEventRules">>
): Promise<CapsuleRecord | null> {
  const result = await capsulesCollection().findOneAndUpdate(
    { _id: new ObjectId(capsuleId) },
    {
      $set: {
        ...updates,
        updatedAt: new Date().toISOString()
      }
    },
    { returnDocument: "after" }
  );

  return result ? toCapsuleRecord(result) : null;
}

export async function lockCapsule(capsuleId: string, unlockAt: string): Promise<CapsuleRecord | null> {
  const result = await capsulesCollection().findOneAndUpdate(
    { _id: new ObjectId(capsuleId) },
    {
      $set: {
        status: "locked",
        unlockAt,
        updatedAt: new Date().toISOString()
      }
    },
    { returnDocument: "after" }
  );

  return result ? toCapsuleRecord(result) : null;
}

export async function releaseCapsule(capsuleId: string): Promise<CapsuleRecord | null> {
  const result = await capsulesCollection().findOneAndUpdate(
    {
      _id: new ObjectId(capsuleId),
      status: { $ne: "released" }
    },
    {
      $set: {
        status: "released",
        updatedAt: new Date().toISOString()
      }
    },
    { returnDocument: "after" }
  );

  return result ? toCapsuleRecord(result) : null;
}

export async function markWishCapsulePendingApproval(capsuleId: string): Promise<CapsuleRecord | null> {
  const result = await capsulesCollection().findOneAndUpdate(
    {
      _id: new ObjectId(capsuleId),
      type: "wish",
      status: { $in: ["draft", "scheduled_for_delivery", "pending_approval"] }
    },
    {
      $set: {
        status: "pending_approval",
        updatedAt: new Date().toISOString()
      }
    },
    { returnDocument: "after" }
  );

  return result ? toCapsuleRecord(result) : null;
}

export async function markWishCapsuleScheduled(capsuleId: string): Promise<CapsuleRecord | null> {
  const result = await capsulesCollection().findOneAndUpdate(
    {
      _id: new ObjectId(capsuleId),
      type: "wish"
    },
    {
      $set: {
        status: "scheduled_for_delivery",
        updatedAt: new Date().toISOString()
      }
    },
    { returnDocument: "after" }
  );

  return result ? toCapsuleRecord(result) : null;
}

export async function markWishCapsuleSent(capsuleId: string): Promise<CapsuleRecord | null> {
  const now = new Date().toISOString();
  const result = await capsulesCollection().findOneAndUpdate(
    {
      _id: new ObjectId(capsuleId),
      type: "wish",
      status: { $ne: "sent" }
    },
    {
      $set: {
        status: "sent",
        sentAt: now,
        updatedAt: now
      }
    },
    { returnDocument: "after" }
  );

  return result ? toCapsuleRecord(result) : null;
}

export async function unlockCapsuleWithKey(capsuleId: string, unlockKey: string): Promise<CapsuleRecord | null> {
  const capsule = await capsulesCollection().findOne({ _id: new ObjectId(capsuleId) });
  if (!capsule) {
    return null;
  }

  if (!capsule.unlockKeyHash) {
    throw new Error("This capsule does not support early unlock");
  }

  if (!verifyPassword(unlockKey, capsule.unlockKeyHash)) {
    throw new Error("Invalid unlock key");
  }

  const result = await capsulesCollection().findOneAndUpdate(
    { _id: new ObjectId(capsuleId) },
    {
      $set: {
        status: "released",
        updatedAt: new Date().toISOString()
      }
    },
    { returnDocument: "after" }
  );

  return result ? toCapsuleRecord(result) : null;
}

export async function attachAiSignals(
  capsuleId: string,
  sentimentScore: number,
  dominantEmotion: string,
  emotionLabels: string[],
  contextTags: string[],
  analyzedAt: string,
  emotionSimilarityScore: number
): Promise<void> {
  const capsule = await getCapsuleById(capsuleId);
  if (!capsule) {
    return;
  }

  await capsulesCollection().updateOne(
    { _id: new ObjectId(capsuleId) },
    {
      $set: {
        sentimentScore,
        dominantEmotion,
        emotionLabels,
        contextTags,
        analyzedAt,
        emotionSimilarityScore,
        updatedAt: new Date().toISOString()
      }
    }
  );

  await aiAnalysesCollection().insertOne({
    _id: new ObjectId(),
    capsuleId,
    userId: capsule.userId,
    capsuleTitle: capsule.title,
    sentimentScore,
    dominantEmotion,
    emotionLabels,
    contextTags,
    emotionSimilarityScore,
    analyzedAt
  });
}

export async function listAiTimeline(userId: string): Promise<AiTimelinePoint[]> {
  const docs = await aiAnalysesCollection()
    .find({ userId })
    .sort({ analyzedAt: 1 })
    .toArray();

  return docs.map((doc) => ({
    capsuleId: doc.capsuleId,
    date: doc.analyzedAt,
    sentimentScore: doc.sentimentScore,
    emotion: doc.dominantEmotion,
    capsuleTitle: doc.capsuleTitle
  }));
}

export async function listEventRuleCapsules(limit = 100): Promise<CapsuleRecord[]> {
  const docs = await capsulesCollection()
    .find({ status: "locked", unlockEventRules: { $exists: true } })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map(toCapsuleRecord);
}

export async function recordUnlockEvent(input: UnlockEventRecord): Promise<void> {
  await unlockEventsCollection().insertOne({
    _id: new ObjectId(),
    capsuleId: input.capsuleId,
    userId: input.userId,
    triggerType: input.triggerType,
    decisionReason: input.decisionReason,
    eventName: input.eventName,
    processedAt: input.processedAt
  });
}

export async function recordAuditLog(input: {
  capsuleId?: string;
  userId?: string;
  action: string;
  category: string;
  status?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await auditLogsCollection().insertOne({
    _id: new ObjectId(),
    capsuleId: input.capsuleId,
    userId: input.userId,
    action: input.action,
    category: input.category,
    status: input.status,
    details: input.details,
    createdAt: new Date().toISOString()
  });
}

export async function getLatestUnlockReason(capsuleId: string): Promise<string | null> {
  const event = await unlockEventsCollection().findOne(
    { capsuleId },
    {
      sort: { processedAt: -1 },
      projection: { decisionReason: 1 }
    }
  );

  return event?.decisionReason || null;
}

export async function deleteCapsule(capsuleId: string, userId: string): Promise<boolean> {
  try {
    const result = await capsulesCollection().deleteOne({
      _id: new ObjectId(capsuleId),
      userId
    });
    return result.deletedCount === 1;
  } catch {
    return false;
  }
}
