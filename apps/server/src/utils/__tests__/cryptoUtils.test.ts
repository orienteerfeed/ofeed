import { beforeAll, describe, expect, it, vi } from "vitest";

let cryptoUtils: typeof import("../cryptoUtils.js");

beforeAll(async () => {
  process.env.ENCRYPTION_SECRET_KEY = "0123456789abcdef0123456789abcdef";
  vi.resetModules();
  cryptoUtils = await import("../cryptoUtils.js");
});

describe("cryptoUtils", () => {
  it("encrypt returns iv and content", () => {
    const result = cryptoUtils.encrypt("Hello, World!");

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
});
