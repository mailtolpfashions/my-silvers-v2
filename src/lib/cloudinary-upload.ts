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

/**
 * Uploads product photos named `<SKU>_1`, `<SKU>_2`… into the category's
 * folder (see server/media/product-image-names.ts). One signing request for
 * the whole batch, so the numbers come out consecutive.
 *
 * Returns the URLs in the order the files were given. A failure partway still
 * returns the ones that made it, with the error beside them: those files are
 * already in Cloudinary under their names, and dropping them from the form
 * would leave the next upload numbered past photos the product doesn't have.
 */
export async function uploadProductImages(
  files: File[],
  naming: { sku: string; categoryId: string }
): Promise<{ urls: string[]; error?: string }> {
  const urls: string[] = [];
  try {
    await uploadEach(files, naming, urls);
    return { urls };
  } catch (err) {
    return { urls, error: err instanceof Error ? err.message : "Upload failed." };
  }
}

async function uploadEach(
  files: File[],
  naming: { sku: string; categoryId: string },
  urls: string[]
): Promise<void> {
  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "product", ...naming, count: files.length }),
  });
  if (!signRes.ok) {
    throw new Error((await signRes.text()) || "Could not get an upload signature.");
  }
  const { slots, apiKey, cloudName } = (await signRes.json()) as {
    slots: Array<{ timestamp: number; signature: string; params: Record<string, string> }>;
    apiKey: string;
    cloudName: string;
  };

  for (const [i, file] of files.entries()) {
    const slot = slots[i];
    if (!slot) break;
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", apiKey);
    form.append("timestamp", String(slot.timestamp));
    form.append("signature", slot.signature);
    for (const [key, value] of Object.entries(slot.params)) form.append(key, value);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? "Upload failed.");
    // With overwrite off, a name that already exists comes back as the OLD
    // file rather than an error. Only possible if two people upload for the
    // same SKU at the same moment — but attaching someone else's photo
    // silently would be worse than asking for a retry.
    if (data.existing) {
      throw new Error(`${slot.params.public_id} was just taken. Please add the photo again.`);
    }
    urls.push(data.secure_url as string);
  }
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
