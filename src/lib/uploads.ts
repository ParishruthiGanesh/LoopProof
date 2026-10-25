import "server-only";
import fs from "node:fs";
import path from "node:path";
import { serverEnv } from "./env";
import { sha256Hex } from "./evidence-manifest";
import { uuid } from "./ids";

export const MAX_PHOTOS = 3;
export const MAX_BYTES = 6 * 1024 * 1024; // 6 MB per photograph
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

export type ValidatedPhoto = {
  buffer: Buffer;
  mimeType: AllowedMime;
  sha256: string;
  byteSize: number;
  originalName: string;
};

export class UploadError extends Error {
  status = 400;
}

/** Magic-byte sniff, so a renamed .exe cannot pass as a photograph. */
function sniffMime(buffer: Buffer): AllowedMime | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function validateUploads(files: File[]): Promise<ValidatedPhoto[]> {
  if (files.length === 0) throw new UploadError("Attach at least one photograph.");
  if (files.length > MAX_PHOTOS) throw new UploadError(`Attach at most ${MAX_PHOTOS} photographs.`);

  const out: ValidatedPhoto[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      throw new UploadError(
        `"${file.name}" is ${(file.size / 1_048_576).toFixed(1)} MB. The limit is ${MAX_BYTES / 1_048_576} MB per photograph.`,
      );
    }
    if (file.size === 0) throw new UploadError(`"${file.name}" is empty.`);

    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffMime(buffer);
    if (!sniffed) {
      throw new UploadError(
        `"${file.name}" is not a JPEG, PNG or WebP image. Only those three formats are accepted.`,
      );
    }
    if (!ALLOWED_MIME.includes(sniffed)) throw new UploadError(`"${file.name}" has an unsupported image type.`);

    out.push({
      buffer,
      mimeType: sniffed,
      sha256: sha256Hex(buffer),
      byteSize: buffer.byteLength,
      originalName: file.name.slice(0, 120),
    });
  }
  return out;
}

const EXTENSION: Record<AllowedMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Writes under the configured upload root. Filenames are generated, never
 *  taken from the client, so a crafted name cannot escape the directory. */
export function storePhoto(photo: ValidatedPhoto): { storedPath: string } {
  const root = path.isAbsolute(serverEnv.uploadDir)
    ? serverEnv.uploadDir
    : path.join(process.cwd(), serverEnv.uploadDir);
  fs.mkdirSync(root, { recursive: true });
  const name = `${uuid()}.${EXTENSION[photo.mimeType]}`;
  fs.writeFileSync(path.join(root, name), photo.buffer);
  return { storedPath: `upload:${name}` };
}

export function readStoredPhoto(storedPath: string): { buffer: Buffer; mimeType: string } | null {
  if (!storedPath.startsWith("upload:")) return null;
  const name = storedPath.slice("upload:".length);
  // Reject anything that is not a bare generated filename.
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(name)) return null;
  const root = path.isAbsolute(serverEnv.uploadDir)
    ? serverEnv.uploadDir
    : path.join(process.cwd(), serverEnv.uploadDir);
  const file = path.join(root, name);
  if (!fs.existsSync(file)) return null;
  const extension = name.split(".").pop()!;
  const mimeType = extension === "jpg" ? "image/jpeg" : extension === "png" ? "image/png" : "image/webp";
  return { buffer: fs.readFileSync(file), mimeType };
}

/** Public URL for a stored photo or a seeded illustration. */
export function photoUrl(storedPath: string): string {
  if (storedPath.startsWith("upload:")) return `/api/photos/${storedPath.slice("upload:".length)}`;
  return storedPath;
}
