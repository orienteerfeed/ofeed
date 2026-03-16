import { describe, expect, it } from "vitest";

import { meosTestingHelpers } from "../meos.service.js";

const { extractFirstXmlFromZip, isZipBuffer, normalizeMopPayload } = meosTestingHelpers;

function createStoredZip(fileName: string, content: Buffer) {
  const fileNameBuffer = Buffer.from(fileName, "utf8");

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4); // version needed to extract
  localHeader.writeUInt16LE(0, 6); // flags
  localHeader.writeUInt16LE(0, 8); // compression method: store
  localHeader.writeUInt16LE(0, 10); // mod time
  localHeader.writeUInt16LE(0, 12); // mod date
  localHeader.writeUInt32LE(0, 14); // crc32 (unused by parser)
  localHeader.writeUInt32LE(content.length, 18);
  localHeader.writeUInt32LE(content.length, 22);
  localHeader.writeUInt16LE(fileNameBuffer.length, 26);
  localHeader.writeUInt16LE(0, 28); // extra length

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4); // version made by
  centralHeader.writeUInt16LE(20, 6); // version needed
  centralHeader.writeUInt16LE(0, 8); // flags
  centralHeader.writeUInt16LE(0, 10); // compression method: store
  centralHeader.writeUInt16LE(0, 12); // mod time
  centralHeader.writeUInt16LE(0, 14); // mod date
  centralHeader.writeUInt32LE(0, 16); // crc32
  centralHeader.writeUInt32LE(content.length, 20);
  centralHeader.writeUInt32LE(content.length, 24);
  centralHeader.writeUInt16LE(fileNameBuffer.length, 28);
  centralHeader.writeUInt16LE(0, 30); // extra length
  centralHeader.writeUInt16LE(0, 32); // comment length
  centralHeader.writeUInt16LE(0, 34); // disk number start
  centralHeader.writeUInt16LE(0, 36); // internal attrs
  centralHeader.writeUInt32LE(0, 38); // external attrs
  centralHeader.writeUInt32LE(0, 42); // local header offset

  const localPart = Buffer.concat([localHeader, fileNameBuffer, content]);
  const centralPart = Buffer.concat([centralHeader, fileNameBuffer]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // this disk number
  eocd.writeUInt16LE(0, 6); // central directory disk number
  eocd.writeUInt16LE(1, 8); // entries on this disk
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(centralPart.length, 12); // central directory size
  eocd.writeUInt32LE(localPart.length, 16); // central directory offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localPart, centralPart, eocd]);
}

describe("meos zip helpers", () => {
  it("detects ZIP payload by magic bytes", () => {
    const zip = createStoredZip("mop.xml", Buffer.from("<MOPDiff/>", "utf8"));
    expect(isZipBuffer(zip)).toBe(true);
    expect(isZipBuffer(Buffer.from("<MOPDiff/>", "utf8"))).toBe(false);
  });

  it("extracts first XML entry from ZIP payload", () => {
    const xml = "<?xml version=\"1.0\"?><MOPDiff></MOPDiff>";
    const zip = createStoredZip("payload.xml", Buffer.from(xml, "utf8"));
    expect(extractFirstXmlFromZip(zip).trim()).toBe(xml);
  });

  it("normalizes ZIP payload to XML text", () => {
    const xml = "<MOPDiff></MOPDiff>";
    const zip = createStoredZip("payload.xml", Buffer.from(xml, "utf8"));
    expect(normalizeMopPayload(zip).trim()).toBe(xml);
  });
});
