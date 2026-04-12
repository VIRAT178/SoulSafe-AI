import { randomInt } from "node:crypto";
import { redis } from "./db.js";

const otpTtlSeconds = 10 * 60;

function otpKey(scope: "verify" | "reset", email: string): string {
  return `otp:${scope}:${email.toLowerCase()}`;
}

export function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

export async function storeOtp(scope: "verify" | "reset", email: string, otp: string): Promise<void> {
  await redis().setEx(otpKey(scope, email), otpTtlSeconds, otp);
}

export async function verifyOtp(scope: "verify" | "reset", email: string, otp: string): Promise<boolean> {
  const stored = await redis().get(otpKey(scope, email));
  return Boolean(stored && stored === otp);
}

export async function consumeOtp(scope: "verify" | "reset", email: string): Promise<void> {
  await redis().del(otpKey(scope, email));
}

export function otpExpiresInMinutes(): number {
  return Math.floor(otpTtlSeconds / 60);
}