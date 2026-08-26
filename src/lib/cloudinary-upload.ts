/**
 * Client-side signed direct-to-Cloudinary upload. The file bytes go straight
 * from the browser to Cloudinary — never through a Vercel Function — so the
 * Hobby-tier body-size ceiling is irrelevant.
 */

/** The raw Cloudinary upload response fields anything here might want. */
type CloudinaryResponse = {
  secure_url: string;
  public_id: string;
  resource_type: string;
  bytes: number;
  width?: number;
  height?: number;
  format?: string;
  original_filename?: string;
};

/**
 * Sign, then POST the file. One place, because the signature and the form must
 * agree exactly: `/api/uploads/sign` may sign extra params (review uploads pin
 * `allowed_formats`), and every one of them has to be posted back verbatim or
 * Cloudinary answers "Invalid Signature".
 */
async function signedUpload(file: File, folder: string): Promise<CloudinaryResponse> {
  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });
  if (!signRes.ok) {
    // 429 is the rate limiter, and it sends a sentence worth showing.
    const message = signRes.status === 429 ? await signRes.text() : null;
    throw new Error(message || "Could not get an upload signature.");
  }
  const {
    timestamp,
    signature,
    folder: signedFolder,
    params,
    apiKey,
    cloudName,
  } = (await signRes.json()) as {
    timestamp: number;
    signature: string;
    folder: string;
    params?: Record<string, string>;
    apiKey: string;
    cloudName: string;
  };

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", signedFolder);
  for (const [key, value] of Object.entries(params ?? {})) form.append(key, value);

  const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: "POST",
    body: form,
  });
  const data = await uploadRes.json();
  if (!uploadRes.ok) {
    throw new Error(data?.error?.message ?? "Upload failed.");
  }
  return data as CloudinaryResponse;
}

export async function uploadToCloudinary(
  file: File,
  folder = "mysilvers/products"
): Promise<string> {
  const data = await signedUpload(file, folder);
  return data.secure_url;
}

export type CloudinaryUploadResult = {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  bytes: number;
  format?: string;
  resourceType: string;
  originalFilename: string;
};

/** Same signed upload, but returns full metadata (for MediaAsset records). */
export async function uploadToCloudinaryDetailed(
  file: File,
  folder = "mysilvers/cms"
): Promise<CloudinaryUploadResult> {
  const data = await signedUpload(file, folder);
  return {
    url: data.secure_url,
    publicId: data.public_id,
    width: data.width,
    height: data.height,
    bytes: data.bytes,
    format: data.format,
    resourceType: data.resource_type,
    originalFilename: data.original_filename ?? file.name,
  };
}
