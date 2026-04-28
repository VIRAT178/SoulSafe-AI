import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redis: {
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn()
  },
  getCapsuleById: vi.fn(),
  markWishCapsulePendingApproval: vi.fn(),
  markWishCapsuleSent: vi.fn(),
  recordAuditLog: vi.fn(),
  findUserById: vi.fn(),
  sendWishEmail: vi.fn()
}));

vi.mock("../../src/services/db.js", () => ({
  redis: () => mocks.redis
}));

vi.mock("../../src/services/repository.js", () => ({
  findUserById: mocks.findUserById,
  getCapsuleById: mocks.getCapsuleById,
  markWishCapsulePendingApproval: mocks.markWishCapsulePendingApproval,
  markWishCapsuleSent: mocks.markWishCapsuleSent,
  recordAuditLog: mocks.recordAuditLog
}));

vi.mock("../../src/services/emailService.js", () => ({
  sendWishEmail: mocks.sendWishEmail
}));

import { requestWishApproval } from "../../src/services/wishService.js";

describe("requestWishApproval", () => {
  it("does not duplicate approval work when already pending approval", async () => {
    mocks.getCapsuleById.mockResolvedValue({
      id: "capsule-1",
      userId: "user-1",
      type: "wish",
      title: "Wish for Ava",
      encryptedPayload: "cipher",
      encryptionMethod: "base64-local-fallback",
      status: "pending_approval",
      createdAt: "2026-04-28T00:00:00.000Z",
      updatedAt: "2026-04-28T00:00:00.000Z"
    });

    const result = await requestWishApproval("capsule-1");

    expect(result).toEqual({ capsuleId: "capsule-1", status: "pending_approval" });
    expect(mocks.markWishCapsulePendingApproval).not.toHaveBeenCalled();
    expect(mocks.recordAuditLog).not.toHaveBeenCalled();
  });
});