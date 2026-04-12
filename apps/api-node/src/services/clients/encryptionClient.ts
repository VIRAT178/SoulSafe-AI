import { resilientJsonRequest } from "../httpClient.js";

type EncryptionResponse = { ciphertext: string; algorithm: string };
type DecryptionResponse = { plaintext: string };

const encryptionUrl = process.env.ENCRYPTION_URL || "http://localhost:8082";

export async function encryptCapsulePayload(plaintext: string): Promise<{ encryptedPayload: string; method: string }> {
  try {
    const response = await resilientJsonRequest<EncryptionResponse>({
      serviceName: "encryption-service",
      url: `${encryptionUrl}/encryption/encrypt`,
      method: "POST",
      body: { plaintext }
    });

    return { encryptedPayload: response.ciphertext, method: response.algorithm };
  } catch {
    const fallbackCipher = Buffer.from(plaintext, "utf8").toString("base64");
    return { encryptedPayload: fallbackCipher, method: "base64-local-fallback" };
  }
}

export async function decryptCapsulePayload(ciphertext: string): Promise<string> {
  try {
    const response = await resilientJsonRequest<DecryptionResponse>({
      serviceName: "encryption-service",
      url: `${encryptionUrl}/encryption/decrypt`,
      method: "POST",
      body: { ciphertext }
    });
    return response.plaintext;
  } catch {
    return Buffer.from(ciphertext, "base64").toString("utf8");
  }
}
