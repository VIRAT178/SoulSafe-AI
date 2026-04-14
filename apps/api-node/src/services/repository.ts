import { ObjectId } from "mongodb";
import { capsulesCollection, type CapsuleDoc, usersCollection } from "./db.js";
import { verifyPassword } from "./security.js";

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
  title: string;
  encryptedPayload: string;
  encryptionMethod: string;
  mediaUrl?: string;
  status: "draft" | "locked" | "released";
  unlockAt?: string;
  sentimentScore?: number;
  emotionLabels?: string[];
  createdAt: string;
  updatedAt: string;
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
    title: doc.title,
    encryptedPayload: doc.encryptedPayload,
    encryptionMethod: doc.encryptionMethod,
    mediaUrl: doc.mediaUrl,
    status: doc.status,
    unlockAt: doc.unlockAt,
    sentimentScore: doc.sentimentScore,
    emotionLabels: doc.emotionLabels,
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
  mediaUrl?: string;
  unlockAt?: string;
  unlockKeyHash?: string;
}): Promise<CapsuleRecord> {
  const now = new Date().toISOString();
  const doc: CapsuleDoc = {
    _id: new ObjectId(),
    userId: input.userId,
    title: input.title,
    encryptedPayload: input.encryptedPayload,
    encryptionMethod: input.encryptionMethod,
    mediaUrl: input.mediaUrl,
    status: input.unlockAt || input.unlockKeyHash ? "locked" : "draft",
    unlockAt: input.unlockAt,
    unlockKeyHash: input.unlockKeyHash,
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

export async function getCapsuleById(capsuleId: string): Promise<CapsuleRecord | null> {
  const doc = await capsulesCollection().findOne({ _id: new ObjectId(capsuleId) });
  return doc ? toCapsuleRecord(doc) : null;
}

export async function updateCapsule(capsuleId: string, updates: Partial<Pick<CapsuleRecord, "title" | "encryptedPayload" | "encryptionMethod">>): Promise<CapsuleRecord | null> {
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

export async function attachAiSignals(capsuleId: string, sentimentScore: number, emotionLabels: string[]): Promise<void> {
  await capsulesCollection().updateOne(
    { _id: new ObjectId(capsuleId) },
    {
      $set: {
        sentimentScore,
        emotionLabels,
        updatedAt: new Date().toISOString()
      }
    }
  );
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
