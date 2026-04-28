import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sendEmail } from "./mailer.js";
import type { WishOccasionType } from "./repository.js";

type WishEmailInput = {
  to: string;
  recipientName: string;
  senderName: string;
  message: string;
  occasionType: WishOccasionType;
  templateId?: string;
};

const templateDir = resolve(process.cwd(), "templates");

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTemplate(source: string, values: Record<string, string>): string {
  return source.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => values[key] || "");
}

function buildSubject(occasionType: WishOccasionType, recipientName: string): string {
  const labels: Record<WishOccasionType, string> = {
    birthday: "Happy Birthday",
    anniversary: "Happy Anniversary",
    graduation: "Congratulations",
    custom: "A special message for you"
  };

  return `${labels[occasionType]} ${recipientName}`.trim();
}

async function loadTemplate(templateName: string): Promise<string> {
  return readFile(resolve(templateDir, `${templateName}.html`), "utf8");
}

export async function sendWishEmail(input: WishEmailInput): Promise<void> {
  const templateName = input.templateId || input.occasionType || "custom";
  const template = await loadTemplate(templateName);
  const html = renderTemplate(template, {
    recipientName: escapeHtml(input.recipientName),
    senderName: escapeHtml(input.senderName),
    message: escapeHtml(input.message),
    footer: escapeHtml(`This message was scheduled via SoulSafe AI by ${input.senderName}`)
  });

  const text = [
    `Hi ${input.recipientName},`,
    "",
    input.message,
    "",
    `-- ${input.senderName} via SoulSafe AI`
  ].join("\n");

  await sendEmail({
    to: input.to,
    subject: buildSubject(input.occasionType, input.recipientName),
    html,
    text
  });
}

type CreatorNotificationInput = {
  to: string;
  creatorName: string;
  recipientName: string;
  sentAt: Date;
  occasionType: WishOccasionType;
};

export async function sendCreatorNotificationEmail(input: CreatorNotificationInput): Promise<void> {
  const sentTime = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC"
  }).format(input.sentAt);

  const occasionLabel = {
    birthday: "birthday wish",
    anniversary: "anniversary message",
    graduation: "congratulatory message",
    custom: "special message"
  }[input.occasionType] || "wish";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0f766e;">Your Wish Has Been Delivered! 🎉</h2>
      <p>Hi ${escapeHtml(input.creatorName)},</p>
      <p>Great news! Your ${occasionLabel} to <strong>${escapeHtml(input.recipientName)}</strong> has been successfully delivered.</p>
      <div style="background-color: #f0f9f8; border-left: 4px solid #0f766e; padding: 15px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Delivery Details:</strong></p>
        <p style="margin: 5px 0;"><strong>Recipient:</strong> ${escapeHtml(input.recipientName)}</p>
        <p style="margin: 5px 0;"><strong>Sent at:</strong> ${sentTime} UTC</p>
      </div>
      <p>Thank you for using SoulSafe AI to share your heartfelt wishes!</p>
      <p style="color: #666; font-size: 12px; margin-top: 30px;">
        — SoulSafe AI Team<br/>
        Spreading love, one wish at a time.
      </p>
    </div>
  `;

  const text = [
    `Your Wish Has Been Delivered! 🎉`,
    "",
    `Hi ${input.creatorName},`,
    "",
    `Great news! Your ${occasionLabel} to ${input.recipientName} has been successfully delivered.`,
    "",
    `Delivery Details:`,
    `Recipient: ${input.recipientName}`,
    `Sent at: ${sentTime} UTC`,
    "",
    `Thank you for using SoulSafe AI to share your heartfelt wishes!`,
    "",
    `— SoulSafe AI Team`,
    `Spreading love, one wish at a time.`
  ].join("\n");

  await sendEmail({
    to: input.to,
    subject: `✓ Your wish to ${input.recipientName} was delivered`,
    html,
    text
  });
}