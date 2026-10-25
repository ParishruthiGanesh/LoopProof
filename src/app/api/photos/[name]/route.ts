import { readStoredPhoto } from "@/lib/uploads";

/** Serves an uploaded photograph. Filenames are validated against a strict
 *  pattern inside readStoredPhoto, so no path can escape the upload root. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const file = readStoredPhoto(`upload:${name}`);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "content-type": file.mimeType,
      "cache-control": "private, max-age=3600",
      "content-length": String(file.buffer.byteLength),
    },
  });
}
