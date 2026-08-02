import { NextRequest } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { auth } from "@/server/auth/auth";

/**
 * Cloudinary signed-upload signatures. The browser uploads file bytes
 * DIRECTLY to Cloudinary with this signature — they never pass through a
 * Vercel Function, which sidesteps the Hobby-tier request-body ceiling
 * entirely (the deciding constraint from planning).
 */
const ALLOWED_FOLDERS = new Set(["mysilvers/products", "mysilvers/categories", "mysilvers/cms"]);

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "admin" && role !== "editor") {
    return new Response("Forbidden", { status: 403 });
  }

  let folder = "mysilvers/products";
  try {
    const body = await req.json();
    if (typeof body?.folder === "string" && ALLOWED_FOLDERS.has(body.folder)) {
      folder = body.folder;
    }
  } catch {
    // No body — default folder.
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    process.env.CLOUDINARY_API_SECRET!
  );

  return Response.json({
    timestamp,
    signature,
    folder,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
  });
}
