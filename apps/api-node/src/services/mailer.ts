import nodemailer from "nodemailer";

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function createMailer() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromEmail = process.env.EMAIL_FROM || "SoulSafe AI <noreply@soulsafe.ai>";

  const smtpEnabled = Boolean(smtpHost && smtpUser && smtpPass);
  const transporter = smtpEnabled
    ? nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      })
    : nodemailer.createTransport({
        jsonTransport: true
      });

  return { transporter, fromEmail, smtpEnabled };
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const { transporter, fromEmail, smtpEnabled } = createMailer();
  const info = await transporter.sendMail({
    from: fromEmail,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html
  });

  if (!smtpEnabled) {
    console.log("[mail:dev-json]", JSON.stringify({ messageId: info.messageId, envelope: info.envelope }, null, 2));
  }
}

function emailLayout(title: string, body: string, accent = "#0f766e"): string {
  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;background:#f3f7fb;padding:24px;color:#0f172a;">
      <div style="max-width:620px;margin:auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #dbe5f0;">
        <div style="background:linear-gradient(120deg,${accent},#0ea5e9);padding:18px 24px;color:#fff;">
          <h1 style="margin:0;font-size:22px;">SoulSafe AI</h1>
        </div>
        <div style="padding:24px;line-height:1.6;">
          <h2 style="margin:0 0 10px;font-size:20px;">${title}</h2>
          ${body}
        </div>
      </div>
    </div>
  `;
}

export async function sendVerificationOtpEmail(input: {
  email: string;
  fullName: string;
  otp: string;
}): Promise<void> {
  const html = emailLayout(
    "Verify your SoulSafe account",
    `<p>Hi ${input.fullName},</p>
     <p>Use this one-time OTP to verify your email and finish your registration:</p>
     <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:18px 0;">${input.otp}</p>
     <p>This OTP expires in 10 minutes.</p>`,
    "#0f766e"
  );

  await sendEmail({
    to: input.email,
    subject: "SoulSafe verification OTP",
    text: `Hi ${input.fullName}, your SoulSafe verification OTP is ${input.otp}. It expires in 10 minutes.`,
    html
  });
}

export async function sendWelcomeEmail(input: {
  email: string;
  fullName: string;
  bio?: string;
}): Promise<void> {
  const bioLine = input.bio ? `<p><strong>Bio:</strong> ${input.bio}</p>` : "";
  const html = emailLayout(
    "Welcome to SoulSafe AI",
    `<p>Hi ${input.fullName},</p>
     <p>Your account is now verified and ready. Your secure memory capsule dashboard is waiting for you.</p>
     <p><strong>Email:</strong> ${input.email}</p>
     ${bioLine}
     <p>Thank you for trusting SoulSafe with your future memories.</p>`,
    "#0f766e"
  );

  await sendEmail({
    to: input.email,
    subject: "Welcome to SoulSafe AI",
    text: `Hi ${input.fullName}, welcome to SoulSafe AI. Your account (${input.email}) is now verified.`,
    html
  });
}

export async function sendPasswordResetOtpEmail(input: {
  email: string;
  fullName: string;
  otp: string;
}): Promise<void> {
  const html = emailLayout(
    "Password reset OTP",
    `<p>Hi ${input.fullName},</p>
     <p>We received a request to reset your password. Use this OTP:</p>
     <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:18px 0;">${input.otp}</p>
     <p>This OTP expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
    "#b45309"
  );

  await sendEmail({
    to: input.email,
    subject: "SoulSafe password reset OTP",
    text: `Hi ${input.fullName}, your SoulSafe password reset OTP is ${input.otp}. It expires in 10 minutes.`,
    html
  });
}

export async function sendPasswordUpdatedEmail(input: {
  email: string;
  fullName: string;
}): Promise<void> {
  const at = new Date().toISOString();
  const html = emailLayout(
    "Your password was updated",
    `<p>Hi ${input.fullName},</p>
     <p>Your SoulSafe account password was updated successfully.</p>
     <p><strong>Email:</strong> ${input.email}</p>
     <p><strong>Updated at:</strong> ${at}</p>
     <p>For security, we never include your password in emails.</p>`,
    "#1d4ed8"
  );

  await sendEmail({
    to: input.email,
    subject: "SoulSafe password updated",
    text: `Hi ${input.fullName}, your SoulSafe password was updated at ${at}. This message does not include your password.`,
    html
  });
}

export async function sendCapsuleCreatedEmail(input: {
  email: string;
  fullName: string;
  title: string;
  unlockAt?: string;
  mediaAttached?: boolean;
}): Promise<void> {
  const unlockLine = input.unlockAt ? `<p><strong>Unlock time:</strong> ${input.unlockAt}</p>` : "<p><strong>Unlock time:</strong> Draft capsule</p>";
  const mediaLine = input.mediaAttached ? "<p><strong>Media:</strong> Attached</p>" : "<p><strong>Media:</strong> None</p>";
  const html = emailLayout(
    "Your capsule was created",
    `<p>Hi ${input.fullName},</p>
     <p>Your capsule has been saved successfully and the AI analysis pipeline has started.</p>
     <p><strong>Title:</strong> ${input.title}</p>
     ${unlockLine}
     ${mediaLine}
     <p>You will get another email when the capsule analysis is ready and again when the capsule opens.</p>`,
    "#7c3aed"
  );

  await sendEmail({
    to: input.email,
    subject: "SoulSafe capsule created",
    text: `Hi ${input.fullName}, your capsule "${input.title}" was created successfully. AI analysis has started.`,
    html
  });
}

export async function sendCapsuleAnalysisEmail(input: {
  email: string;
  fullName: string;
  title: string;
  sentimentScore?: number;
  emotionLabels?: string[];
}): Promise<void> {
  const sentimentLine = typeof input.sentimentScore === "number" ? input.sentimentScore.toFixed(2) : "Pending";
  const emotionLine = input.emotionLabels?.length ? input.emotionLabels.join(", ") : "Pending";
  const html = emailLayout(
    "Capsule analysis is ready",
    `<p>Hi ${input.fullName},</p>
     <p>The AI analysis for your capsule is ready.</p>
     <p><strong>Title:</strong> ${input.title}</p>
     <p><strong>Sentiment score:</strong> ${sentimentLine}</p>
     <p><strong>Emotion labels:</strong> ${emotionLine}</p>
     <p>These signals help improve unlock recommendations and emotional timing.</p>`,
    "#2563eb"
  );

  await sendEmail({
    to: input.email,
    subject: "SoulSafe capsule analysis ready",
    text: `Hi ${input.fullName}, the AI analysis for "${input.title}" is ready. Sentiment: ${sentimentLine}. Emotions: ${emotionLine}.`,
    html
  });
}

export async function sendCapsuleOpenedEmail(input: {
  email: string;
  fullName: string;
  title: string;
  openedAt?: string;
}): Promise<void> {
  const openedAt = input.openedAt || new Date().toISOString();
  const html = emailLayout(
    "Your capsule opened",
    `<p>Hi ${input.fullName},</p>
     <p>Your capsule is now open and available in your dashboard.</p>
     <p><strong>Title:</strong> ${input.title}</p>
     <p><strong>Opened at:</strong> ${openedAt}</p>
     <p>This is the moment your future message was delivered.</p>`,
    "#059669"
  );

  await sendEmail({
    to: input.email,
    subject: "SoulSafe capsule opened",
    text: `Hi ${input.fullName}, your capsule "${input.title}" opened at ${openedAt}.`,
    html
  });
}