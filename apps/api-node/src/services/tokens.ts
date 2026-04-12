import jwt from "jsonwebtoken";
import { redis } from "./db.js";

const accessSecret = process.env.JWT_ACCESS_SECRET || "dev-access-secret";
const refreshSecret = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret";
const refreshTtlSeconds = 60 * 60 * 24 * 7;

export function issueAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, accessSecret, { expiresIn: "15m" });
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = jwt.sign({ sub: userId }, refreshSecret, { expiresIn: "7d" });
  await redis().setEx(`refresh:${token}`, refreshTtlSeconds, userId);
  return token;
}

export function verifyAccessToken(token: string): string {
  const payload = jwt.verify(token, accessSecret) as { sub: string };
  return payload.sub;
}

export async function verifyRefreshToken(token: string): Promise<string> {
  const payload = jwt.verify(token, refreshSecret) as { sub: string };
  const exists = await redis().exists(`refresh:${token}`);
  if (!exists) {
    throw new Error("Refresh token revoked");
  }
  return payload.sub;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await redis().del(`refresh:${token}`);
}
