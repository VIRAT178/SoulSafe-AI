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
        unlockEventRules: {
          bsonType: ["object", "null"],
          additionalProperties: false,
          required: ["type"],
          properties: {
            type: { enum: ["birthday", "exam", "breakup", "custom"] },
            date: { bsonType: ["string", "null"] },
            metadata: {
              bsonType: ["object", "null"],
              additionalProperties: false,
              properties: {
                personName: { bsonType: ["string", "null"] },
                eventName: { bsonType: ["string", "null"] }
              }
            }
          }
        },
        unlockKeyHash: { bsonType: ["string", "null"] },
        sentimentScore: { bsonType: ["double", "int", "long", "null"] },
        dominantEmotion: { bsonType: ["string", "null"] },
        emotionLabels: {
          bsonType: ["array", "null"],
          items: { bsonType: "string" }
        },
        contextTags: {
          bsonType: ["array", "null"],
          items: { bsonType: "string" }
        },
        analyzedAt: { bsonType: ["string", "null"] },
        emotionSimilarityScore: { bsonType: ["double", "int", "long", "null"] },
        createdAt: { bsonType: "string" },
        updatedAt: { bsonType: "string" }
      }
    }
  });

  await ensureCollectionWithValidator(db, "ai_analyses", {
    $jsonSchema: {
      bsonType: "object",
      required: ["capsuleId", "userId", "capsuleTitle", "sentimentScore", "dominantEmotion", "emotionLabels", "contextTags", "emotionSimilarityScore", "analyzedAt"],
      additionalProperties: true,
      properties: {
        capsuleId: { bsonType: "string", minLength: 24, maxLength: 24 },
        userId: { bsonType: "string", minLength: 24, maxLength: 24 },
        capsuleTitle: { bsonType: "string", minLength: 1, maxLength: 200 },
        sentimentScore: { bsonType: ["double", "int", "long"] },
        dominantEmotion: { bsonType: "string", minLength: 1 },
        emotionLabels: {
          bsonType: "array",
          items: { bsonType: "string" }
        },
        contextTags: {
          bsonType: "array",
          items: { bsonType: "string" }
        },
        emotionSimilarityScore: { bsonType: ["double", "int", "long"] },
        analyzedAt: { bsonType: "string" }
      }
    }
  });

  await ensureCollectionWithValidator(db, "unlock_events", {
    $jsonSchema: {
      bsonType: "object",
      required: ["capsuleId", "userId", "triggerType", "decisionReason", "processedAt"],
      additionalProperties: true,
      properties: {
        capsuleId: { bsonType: "string", minLength: 24, maxLength: 24 },
        userId: { bsonType: "string", minLength: 24, maxLength: 24 },
        triggerType: { enum: ["date", "event", "emotion", "manual"] },
        decisionReason: { bsonType: "string", minLength: 1 },
        eventName: { bsonType: ["string", "null"] },
        processedAt: { bsonType: "string" }
      }
    }
  });

  await ensureIndex(db, "users", { email: 1 }, { unique: true, name: "users_email_uq" });
  await ensureIndex(db, "capsules", { userId: 1, createdAt: -1 }, { name: "capsules_user_created_idx" });
  await ensureIndex(db, "capsules", { userId: 1, status: 1, unlockAt: 1 }, { name: "capsules_user_status_unlock_idx" });
  await ensureIndex(db, "capsules", { status: 1, unlockAt: 1 }, { name: "capsules_status_unlock_idx" });
  await ensureIndex(db, "capsules", { status: 1, "unlockEventRules.type": 1, "unlockEventRules.date": 1 }, { name: "capsules_event_rule_idx" });
  await ensureIndex(db, "ai_analyses", { userId: 1, analyzedAt: -1 }, { name: "ai_analyses_user_date_idx" });
  await ensureIndex(db, "ai_analyses", { capsuleId: 1, analyzedAt: -1 }, { name: "ai_analyses_capsule_date_idx" });
  await ensureIndex(db, "unlock_events", { capsuleId: 1, processedAt: -1 }, { name: "unlock_events_capsule_processed_idx" });
  await ensureIndex(db, "unlock_events", { capsuleId: 1, triggerType: 1, processedAt: -1 }, { name: "unlock_events_capsule_trigger_processed_idx" });
}
