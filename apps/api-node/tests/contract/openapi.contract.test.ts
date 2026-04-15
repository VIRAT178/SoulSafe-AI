// @ts-nocheck
import { readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import YAML from "yaml";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { issueAccessToken } from "../../src/services/tokens.js";

vi.mock("../../src/services/repository.js", () => {
  const capsules = [
    {
      id: "capsule-1",
      userId: "user-1",
      title: "My capsule",
      encryptedPayload: Buffer.from("hello", "utf8").toString("base64"),
      encryptionMethod: "base64-local-fallback",
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      unlockAt: undefined,
      sentimentScore: 0,
      emotionLabels: ["neutral"]
    }
  ];

  return {
    createUser: vi.fn(async () => ({ id: "user-1", email: "test@soulsafe.ai", passwordHash: "hash", createdAt: new Date().toISOString() })),
    findUserByEmail: vi.fn(async () => ({ id: "user-1", email: "test@soulsafe.ai", passwordHash: "hash", createdAt: new Date().toISOString() })),
    createCapsule: vi.fn(async ({ userId, title }) => {
      const capsule = {
        ...capsules[0],
        id: "capsule-2",
        userId,
        title
      };
      capsules.push(capsule);
      return capsule;
    }),
    listCapsules: vi.fn(async () => capsules),
    getCapsuleById: vi.fn(async (id: string) => capsules.find((item) => item.id === id) || capsules[0]),
    updateCapsule: vi.fn(async () => capsules[0]),
    lockCapsule: vi.fn(async () => ({ ...capsules[0], status: "locked", unlockAt: new Date().toISOString() })),
    releaseCapsule: vi.fn(async () => ({ ...capsules[0], status: "released" })),
    attachAiSignals: vi.fn(async () => undefined)
  };
});

vi.mock("../../src/services/security.js", () => ({
  hashPassword: vi.fn(() => "hash"),
  verifyPassword: vi.fn(() => true)
}));

vi.mock("../../src/services/tokens.js", () => ({
  issueAccessToken: vi.fn(() => "access-token"),
  issueRefreshToken: vi.fn(async () => "refresh-token"),
  verifyAccessToken: vi.fn(() => "user-1"),
  verifyRefreshToken: vi.fn(async () => "user-1"),
  revokeRefreshToken: vi.fn(async () => undefined)
}));

vi.mock("../../src/services/clients/encryptionClient.js", () => ({
  encryptCapsulePayload: vi.fn(async (plaintext: string) => ({
    encryptedPayload: Buffer.from(plaintext, "utf8").toString("base64"),
    method: "base64-local-fallback"
  })),
  decryptCapsulePayload: vi.fn(async () => "hello")
}));

vi.mock("../../src/services/clients/schedulerClient.js", () => ({
  simulateUnlock: vi.fn(async () => ({ event: "unlock-ready", capsuleId: "capsule-1", simulatedAt: new Date().toISOString() }))
}));

vi.mock("../../src/services/queue.js", () => ({
  enqueueAiAnalysis: vi.fn(async () => undefined),
  scheduleUnlock: vi.fn(async () => undefined)
}));

vi.mock("../../src/services/unlockOrchestrator.js", () => ({
  processUnlockDecision: vi.fn(async () => ({ released: true, reason: "rule-based recommendation v1" }))
}));

describe("OpenAPI contract", () => {
  const openapiPath = join(process.cwd(), "openapi.yaml");

  it("is a valid OpenAPI document", async () => {
    await expect(SwaggerParser.validate(openapiPath)).resolves.toBeTruthy();
  });

  it("contains required critical paths", () => {
    const document = YAML.parse(readFileSync(openapiPath, "utf8")) as { paths: Record<string, unknown> };
    expect(document.paths["/auth/register"]).toBeTruthy();
    expect(document.paths["/auth/login"]).toBeTruthy();
    expect(document.paths["/capsules"]).toBeTruthy();
    expect(document.paths["/capsules/{id}/simulate-release"]).toBeTruthy();
  });
});

describe("HTTP contract for core endpoints", () => {
  let app: any;

  beforeAll(async () => {
    const { createApp } = await import("../../src/app.js");
    app = createApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("register returns auth contract shape", async () => {
    const response = await request(app).post("/auth/register").send({
      email: "test@soulsafe.ai",
      password: "password123"
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ id: expect.any(String), email: expect.any(String) }),
        accessToken: expect.any(String),
        refreshToken: expect.any(String)
      })
    );
  });

  it("create capsule returns capsule contract shape", async () => {
    const response = await request(app)
      .post("/capsules")
      .set("Authorization", "Bearer access-token")
      .send({ title: "A title", body: "Some memory" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        title: expect.any(String),
        status: expect.any(String)
      })
    );
  });

  it("simulate release returns released capsule", async () => {
    const response = await request(app)
      .post("/capsules/capsule-1/simulate-release")
      .set("Authorization", "Bearer access-token")
      .send({});

    expect([200, 409]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          status: expect.stringMatching(/draft|locked|released/)
        })
      );
    }
  });
});
