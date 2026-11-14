import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "nordic-salmon-gravlax-rosette.jpg";
const EXPECTED_DIGEST = "ebddd2e5efb6036c32be5d6fe07881caf9bbf88b531b3f374548c836c171197c";
const MAX_PAYLOAD_BYTES = 1048576;
const MAX_PIXEL_DIM = 1024;

interface ImageMetrics {
  width: number;
  height: number;
  bytes: number;
  digest: string;
}

function scanJpegDimensions(buf: Buffer): { width: number; height: number } {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error("Invalid JPEG header: missing SOI marker");
  }
  if (buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) {
    throw new Error("Invalid JPEG trailer: missing EOI marker");
  }
  let pos = 2;
  while (pos + 3 < buf.length) {
    if (buf[pos] !== 0xff) {
      throw new Error(`Unexpected byte at offset ${pos}`);
    }
    const code = buf[pos + 1];
    if (code === 0xd9 || code === 0xda) {
      break;
    }
    if (code === 0x00 || code === 0x01 || (code >= 0xd0 && code <= 0xd7)) {
      pos += 2;
      continue;
    }
    const segLen = buf.readUInt16BE(pos + 2);
    if (segLen < 2 || pos + 2 + segLen > buf.length) {
      throw new Error("Malformed JPEG segment length");
    }
    const isSof =
      (code >= 0xc0 && code <= 0xc3) ||
      (code >= 0xc5 && code <= 0xc7) ||
      (code >= 0xc9 && code <= 0xcb) ||
      (code >= 0xcd && code <= 0xcf);
    if (isSof && segLen >= 7) {
      const height = buf.readUInt16BE(pos + 5);
      const width = buf.readUInt16BE(pos + 7);
      return { width, height };
    }
    pos += 2 + segLen;
  }
  throw new Error("No JPEG SOF frame header discovered");
}

function verifyDishAsset(assetPath: string): { payload: Buffer; metrics: ImageMetrics } {
  const payload = readFileSync(assetPath);
  if (payload.length === 0 || payload.length > MAX_PAYLOAD_BYTES) {
    throw new Error(`Asset byte size ${payload.length} out of bounds`);
  }
  const digest = createHash("sha256").update(payload).digest("hex");
  if (digest !== EXPECTED_DIGEST) {
    throw new Error(`Digest mismatch: expected ${EXPECTED_DIGEST}, got $ebddd2e5efb6036c32be5d6fe07881caf9bbf88b531b3f374548c836c171197c`);
  }
  const { width, height } = scanJpegDimensions(payload);
  if (width < 1 || height < 1 || width > MAX_PIXEL_DIM || height > MAX_PIXEL_DIM) {
    throw new Error(`Dimensions ${width}x${height} exceed ${MAX_PIXEL_DIM}px cap`);
  }
  return { payload, metrics: { width, height, bytes: payload.length, digest } };
}

function emitCompetitionEntry(): void {
  const assetPath = resolve(HERE, SOURCE_NAME);
  const { payload, metrics } = verifyDishAsset(assetPath);
  const outRoot = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(outRoot, { recursive: true });
  const targetFile = join(outRoot, "entry.png");
  writeFileSync(targetFile, payload);
  console.log(JSON.stringify({ status: "ok", output: targetFile, ...metrics }));
}

emitCompetitionEntry();
