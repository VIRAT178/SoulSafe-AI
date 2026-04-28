import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  readFile: vi.fn().mockResolvedValue(
    "<h2>{{recipientName}}</h2><p>{{message}}</p><p>{{senderName}}</p><footer>{{footer}}</footer>"
  )
}));

vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile
}));

vi.mock("../../src/services/mailer.js", () => ({
  sendEmail: mocks.sendEmail
}));

import { sendWishEmail } from "../../src/services/emailService.js";

describe("sendWishEmail", () => {
  it("renders the template placeholders and sends the email", async () => {
    await sendWishEmail({
      to: "recipient@example.com",
      recipientName: "Ava",
      senderName: "Noah",
      message: "Congrats <b>today</b>",
      occasionType: "graduation",
      templateId: "custom"
    });

    expect(mocks.readFile).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);

    const emailPayload = mocks.sendEmail.mock.calls[0][0] as { to: string; subject: string; html: string; text: string };
    expect(emailPayload.to).toBe("recipient@example.com");
    expect(emailPayload.subject).toBe("Congratulations Ava");
    expect(emailPayload.html).toContain("Ava");
    expect(emailPayload.html).toContain("Congrats &lt;b&gt;today&lt;/b&gt;");
    expect(emailPayload.html).toContain("Noah");
    expect(emailPayload.html).toContain("scheduled via SoulSafe AI by Noah");
    expect(emailPayload.text).toContain("Congrats <b>today</b>");
  });
});