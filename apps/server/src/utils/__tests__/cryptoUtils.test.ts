import { beforeAll, describe, expect, it, vi } from "vitest";
import { createCipheriv, randomBytes } from "node:crypto";

let cryptoUtils: typeof import("../cryptoUtils.js");
const TEST_SECRET_HEX = "0123456789abcdef0123456789abcdef";

beforeAll(async () => {
  process.env.ENCRYPTION_SECRET_KEY = TEST_SECRET_HEX;
  vi.resetModules();
  cryptoUtils = await import("../cryptoUtils.js");
});

function createLegacyEncryptedPayload(text: string) {
  const key = Buffer.from(TEST_SECRET_HEX, "hex");
  const iv = randomBytes(16);
  const algorithm = `aes-${key.length * 8}-cbc`;
  const cipher = createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);

  return {
    iv: iv.toString("hex"),
    content: encrypted.toString("base64"),
  };
}

describe("cryptoUtils", () => {
  it("encrypt returns v2 payload fields", () => {
    const result = cryptoUtils.encrypt("Hello, World!");

    expect(result).toHaveProperty("v", 2);
    expect(result).toHaveProperty("alg");
    expect(result).toHaveProperty("tag");
    expect(result).toHaveProperty("iv");
    expect(result).toHaveProperty("content");
    expect(typeof result.iv).toBe("string");
    expect(typeof result.content).toBe("string");
  });

  it("decrypt returns original value", () => {
    const text = "Hello, World!";
    const encrypted = cryptoUtils.encrypt(text);

    expect(cryptoUtils.decrypt(encrypted)).toBe(text);
  });

  it("decrypt supports legacy CBC payload", () => {
    const text = "Legacy format";
    const legacyPayload = createLegacyEncryptedPayload(text);

    expect(cryptoUtils.decrypt(legacyPayload)).toBe(text);
  });
});
