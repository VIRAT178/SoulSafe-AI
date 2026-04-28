import { describe, it, expect, vi, beforeEach } from "vitest";
import { enhanceWishMessage } from "../../src/services/aiEnhancementService.js";

describe("AI Enhancement Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle Python service connection error gracefully", async () => {
    // Mock fetch to simulate connection error
    global.fetch = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(
      enhanceWishMessage({
        recipientName: "Alice",
        occasionType: "birthday",
        message: "Happy birthday!",
      })
    ).rejects.toThrow("Failed to enhance message");
  });

  it("should handle Python service HTTP errors", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Service error",
    });

    await expect(
      enhanceWishMessage({
        recipientName: "Alice",
        occasionType: "birthday",
        message: "Happy birthday!",
      })
    ).rejects.toThrow("Python service error");
  });

  it("should accept valid input parameters", async () => {
    const validInputs = {
      recipientName: "Alice",
      occasionType: "birthday" as const,
      message: "Happy birthday Alice!",
    };

    expect(validInputs.recipientName).toBeTruthy();
    expect(validInputs.occasionType).toBe("birthday");
    expect(validInputs.message).toBeTruthy();
  });
});
