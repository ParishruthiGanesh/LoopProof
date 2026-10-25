import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { serverEnv } from "@/lib/env";

/** QR code pointing at the item's public passport. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const rows = await db.select({ id: schema.items.id }).from(schema.items).where(eq(schema.items.id, id)).limit(1);
  if (!rows[0]) return new Response("Not found", { status: 404 });

  const target = `${serverEnv.publicBaseUrl.replace(/\/$/, "")}/passport/${id}`;
  const svg = await QRCode.toString(target, {
    type: "svg",
    margin: 1,
    width: 220,
    color: { dark: "#163d29", light: "#fffefb" },
    errorCorrectionLevel: "M",
  });

  return new Response(svg, {
    headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" },
  });
}
