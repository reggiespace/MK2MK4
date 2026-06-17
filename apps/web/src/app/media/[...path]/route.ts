import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  // Prevent path traversal.
  const relative = segments.join("/").replace(/\.\./g, "");
  const filePath = path.join(env.storageDir(), relative);
  const ext = path.extname(filePath).toLowerCase();

  try {
    const data = await readFile(filePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
