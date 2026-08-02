/**
 * Client-side signed direct-to-Cloudinary upload. The file bytes go straight
 * from the browser to Cloudinary — never through a Vercel Function — so the
 * Hobby-tier body-size ceiling is irrelevant.
 */
export async function uploadToCloudinary(
  file: File,
  folder = "mysilvers/products"
): Promise<string> {
  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });
  if (!signRes.ok) throw new Error("Could not get an upload signature.");
  const { timestamp, signature, folder: signedFolder, apiKey, cloudName } =
    (await signRes.json()) as {
      timestamp: number;
      signature: string;
      folder: string;
      apiKey: string;
      cloudName: string;
    };

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", signedFolder);

  const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: "POST",
    body: form,
  });
  const data = await uploadRes.json();
  if (!uploadRes.ok) {
    throw new Error(data?.error?.message ?? "Upload failed.");
  }
  return data.secure_url as string;
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
  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });
  if (!signRes.ok) throw new Error("Could not get an upload signature.");
  const { timestamp, signature, folder: signedFolder, apiKey, cloudName } =
    await signRes.json();

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", signedFolder);

  const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: "POST",
    body: form,
  });
  const data = await uploadRes.json();
  if (!uploadRes.ok) {
    throw new Error(data?.error?.message ?? "Upload failed.");
  }
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
