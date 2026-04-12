import { Router } from "express";
import {
  createUser,
  findUserByEmail,
  markUserEmailVerified,
  updateUserPassword,
  updateUserProfile
} from "../services/repository.js";
import { hashPassword, verifyPassword } from "../services/security.js";
import { consumeOtp, generateOtp, otpExpiresInMinutes, storeOtp, verifyOtp } from "../services/otp.js";
import {
  sendPasswordResetOtpEmail,
  sendPasswordUpdatedEmail,
  sendVerificationOtpEmail,
  sendWelcomeEmail
} from "../services/mailer.js";
import {
  issueAccessToken,
  issueRefreshToken,
  revokeRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
} from "../services/tokens.js";

const router = Router();

router.post("/register", async (req, res) => {
  const { fullName, email, password, profilePicUrl, bio } = req.body;
  if (!fullName || !email || !password) {
    return res.status(400).json({ error: "fullName, email and password are required" });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await findUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: "User with this email already exists" });
    }

    const user = await createUser({
      fullName: String(fullName).trim(),
      email: normalizedEmail,
      passwordHash: hashPassword(String(password)),
      profilePicUrl: profilePicUrl ? String(profilePicUrl).trim() : undefined,
      bio: bio ? String(bio).trim() : undefined
    });

    const otp = generateOtp();
    await storeOtp("verify", user.email, otp);
    await sendVerificationOtpEmail({ email: user.email, fullName: user.fullName, otp });

    return res.status(201).json({
      message: "Registration started. Verify email with OTP.",
      email: user.email,
      otpExpiresInMinutes: otpExpiresInMinutes()
    });
  } catch (error) {
    return res.status(409).json({ error: (error as Error).message });
  }
});

router.post("/verify-email-otp", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: "email and otp are required" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const validOtp = await verifyOtp("verify", normalizedEmail, String(otp));
  if (!validOtp) {
    return res.status(400).json({ error: "Invalid or expired OTP" });
  }

  await consumeOtp("verify", normalizedEmail);
  const verifiedUser = user.isEmailVerified ? user : await markUserEmailVerified(user.id);
  const refreshToken = await issueRefreshToken(user.id);

  if (verifiedUser) {
    await sendWelcomeEmail({
      email: verifiedUser.email,
      fullName: verifiedUser.fullName,
      bio: verifiedUser.bio
    });
  }

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: verifiedUser?.fullName || user.fullName,
      profilePicUrl: verifiedUser?.profilePicUrl,
      bio: verifiedUser?.bio
    },
    accessToken: issueAccessToken(user.id),
    refreshToken
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  if (!user.isEmailVerified) {
    return res.status(403).json({ error: "Please verify your email before login" });
  }

  const refreshToken = await issueRefreshToken(user.id);

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      profilePicUrl: user.profilePicUrl,
      bio: user.bio
    },
    accessToken: issueAccessToken(user.id),
    refreshToken
  });
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);

  if (user) {
    const otp = generateOtp();
    await storeOtp("reset", normalizedEmail, otp);
    await sendPasswordResetOtpEmail({ email: user.email, fullName: user.fullName, otp });
  }

  return res.json({
    message: "If the account exists, a reset OTP has been sent",
    otpExpiresInMinutes: otpExpiresInMinutes()
  });
});

router.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: "email, otp and newPassword are required" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const validOtp = await verifyOtp("reset", normalizedEmail, String(otp));
  if (!validOtp) {
    return res.status(400).json({ error: "Invalid or expired OTP" });
  }

  await consumeOtp("reset", normalizedEmail);
  const updated = await updateUserPassword(user.id, hashPassword(String(newPassword)));
  if (!updated) {
    return res.status(500).json({ error: "Failed to update password" });
  }

  await sendPasswordUpdatedEmail({ email: updated.email, fullName: updated.fullName });

  const refreshToken = await issueRefreshToken(updated.id);
  return res.json({
    user: {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      profilePicUrl: updated.profilePicUrl,
      bio: updated.bio
    },
    accessToken: issueAccessToken(updated.id),
    refreshToken
  });
});

router.put("/profile", async (req, res) => {
  try {
    const { authorization } = req.headers;
    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "missing authorization token" });
    }

    const userId = verifyAccessToken(authorization.replace("Bearer ", ""));
    const { fullName, profilePicUrl, bio } = req.body;

    const updated = await updateUserProfile(userId, {
      fullName: typeof fullName === "string" ? fullName.trim() : undefined,
      profilePicUrl: typeof profilePicUrl === "string" ? profilePicUrl.trim() : undefined,
      bio: typeof bio === "string" ? bio.trim() : undefined
    });

    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      message: "Profile updated",
      user: {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        profilePicUrl: updated.profilePicUrl,
        bio: updated.bio
      }
    });
  } catch {
    return res.status(401).json({ error: "invalid access token" });
  }
});

router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: "refreshToken is required" });
  }

  try {
    const userId = await verifyRefreshToken(refreshToken);
    return res.json({ accessToken: issueAccessToken(userId) });
  } catch {
    return res.status(401).json({ error: "invalid refresh token" });
  }
});

router.post("/logout", async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }

  return res.status(204).send();
});

export default router;
