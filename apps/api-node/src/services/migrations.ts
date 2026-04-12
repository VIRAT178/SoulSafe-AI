import { type Db, MongoServerError } from "mongodb";

async function ensureCollectionWithValidator(db: Db, name: string, validator: Record<string, unknown>): Promise<void> {
  const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();

  if (!exists) {
    await db.createCollection(name, { validator });
    return;
  }

  try {
    await db.command({
      collMod: name,
      validator
    });
  } catch (error) {
    // Ignore unsupported collMod scenarios in local/dev Mongo versions.
    if (!(error instanceof MongoServerError)) {
      throw error;
    }
  }
}

async function ensureIndex(
  db: Db,
  collectionName: string,
  keys: Record<string, 1 | -1>,
  options: { unique?: boolean; name?: string }
): Promise<void> {
  try {
    await db.collection(collectionName).createIndex(keys, options);
  } catch (error) {
    if (error instanceof MongoServerError && (error.code === 85 || error.code === 86 || error.codeName === "IndexOptionsConflict")) {
      return;
    }
    throw error;
  }
}

export async function runMongoMigrations(db: Db): Promise<void> {
  await ensureCollectionWithValidator(db, "users", {
    $jsonSchema: {
      bsonType: "object",
      required: ["fullName", "email", "passwordHash", "isEmailVerified", "createdAt", "updatedAt"],
      additionalProperties: true,
      properties: {
        fullName: { bsonType: "string", minLength: 1, maxLength: 120 },
        email: { bsonType: "string", pattern: "^.+@.+$" },
        passwordHash: { bsonType: "string", minLength: 20 },
        profilePicUrl: { bsonType: ["string", "null"] },
        bio: { bsonType: ["string", "null"] },
        isEmailVerified: { bsonType: "bool" },
        verifiedAt: { bsonType: ["string", "null"] },
        createdAt: { bsonType: "string" },
        updatedAt: { bsonType: "string" }
      }
    }
  });

  await ensureCollectionWithValidator(db, "capsules", {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "title", "encryptedPayload", "encryptionMethod", "status", "createdAt", "updatedAt"],
      additionalProperties: true,
      properties: {
        userId: { bsonType: "string", minLength: 24, maxLength: 24 },
        title: { bsonType: "string", minLength: 1, maxLength: 200 },
        encryptedPayload: { bsonType: "string", minLength: 1 },
        encryptionMethod: { bsonType: "string", minLength: 1 },
        mediaUrl: { bsonType: ["string", "null"] },
        status: { enum: ["draft", "locked", "released"] },
        unlockAt: { bsonType: ["string", "null"] },
        unlockKeyHash: { bsonType: ["string", "null"] },
        sentimentScore: { bsonType: ["double", "int", "long", "null"] },
        emotionLabels: {
          bsonType: ["array", "null"],
          items: { bsonType: "string" }
        },
        createdAt: { bsonType: "string" },
        updatedAt: { bsonType: "string" }
      }
    }
  });

  await ensureIndex(db, "users", { email: 1 }, { unique: true, name: "users_email_uq" });
  await ensureIndex(db, "capsules", { userId: 1, createdAt: -1 }, { name: "capsules_user_created_idx" });
  await ensureIndex(db, "capsules", { userId: 1, status: 1, unlockAt: 1 }, { name: "capsules_user_status_unlock_idx" });
  await ensureIndex(db, "capsules", { status: 1, unlockAt: 1 }, { name: "capsules_status_unlock_idx" });
}
