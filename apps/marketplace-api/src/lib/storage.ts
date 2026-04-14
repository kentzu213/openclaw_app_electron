/**
 * Supabase Storage helper for .ocx binary uploads
 *
 * Bucket: "extensions"
 * Path:   {developer_id}/{extension_name}/{version}.ocx
 *
 * Supabase Storage setup (run once in dashboard):
 *   1. Create bucket "extensions" (public: false)
 *   2. Set max file size: 50MB
 *   3. Allowed MIME types: application/gzip, application/x-tar, application/octet-stream
 */
import { supabase, isDemoMode } from "../db/client.js";

const BUCKET = "extensions";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export interface UploadResult {
  success: boolean;
  path?: string;
  size?: number;
  sha256?: string;
  error?: string;
}

export interface DownloadResult {
  success: boolean;
  data?: Blob;
  contentType?: string;
  size?: number;
  error?: string;
}

/**
 * Upload .ocx binary to Supabase Storage
 */
export async function uploadOcxBinary(
  developerId: string,
  extensionName: string,
  version: string,
  fileBuffer: ArrayBuffer,
): Promise<UploadResult> {
  if (isDemoMode || !supabase) {
    return { success: false, error: "Storage unavailable in demo mode" };
  }

  // Validate size
  if (fileBuffer.byteLength > MAX_FILE_SIZE) {
    return { success: false, error: `File too large. Max: ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }

  if (fileBuffer.byteLength < 100) {
    return { success: false, error: "File too small — invalid .ocx package" };
  }

  // Compute SHA-256 hash
  const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sha256 = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  // Path: {developer_id}/{extension_name}/{version}.ocx
  const storagePath = `${developerId}/${extensionName}/${version}.ocx`;

  // Upload (upsert: overwrite if same version re-uploaded)
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: "application/gzip",
      upsert: true,
      cacheControl: "3600",
    });

  if (error) {
    console.error("[Storage] Upload failed:", error.message);
    return { success: false, error: `Upload failed: ${error.message}` };
  }

  console.log(`[Storage] Uploaded ${storagePath} (${(fileBuffer.byteLength / 1024).toFixed(1)} KB, sha256: ${sha256.slice(0, 12)}...)`);

  return {
    success: true,
    path: storagePath,
    size: fileBuffer.byteLength,
    sha256,
  };
}

/**
 * Download .ocx binary from Supabase Storage
 */
export async function downloadOcxBinary(
  storagePath: string,
): Promise<DownloadResult> {
  if (isDemoMode || !supabase) {
    return { success: false, error: "Storage unavailable in demo mode" };
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath);

  if (error || !data) {
    return { success: false, error: `Download failed: ${error?.message || "File not found"}` };
  }

  return {
    success: true,
    data,
    contentType: "application/gzip",
    size: data.size,
  };
}

/**
 * Generate a signed URL for direct download (1 hour expiry)
 */
export async function getSignedDownloadUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<{ url?: string; error?: string }> {
  if (isDemoMode || !supabase) {
    return { error: "Storage unavailable in demo mode" };
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return { error: `Signed URL failed: ${error?.message || "Unknown error"}` };
  }

  return { url: data.signedUrl };
}

/**
 * Delete .ocx binary from storage
 */
export async function deleteOcxBinary(storagePath: string): Promise<boolean> {
  if (isDemoMode || !supabase) return false;

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([storagePath]);

  if (error) {
    console.error("[Storage] Delete failed:", error.message);
    return false;
  }

  return true;
}

/**
 * List all versions for an extension
 */
export async function listExtensionVersions(
  developerId: string,
  extensionName: string,
): Promise<string[]> {
  if (isDemoMode || !supabase) return [];

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(`${developerId}/${extensionName}`);

  if (error || !data) return [];

  return data
    .filter(f => f.name.endsWith(".ocx"))
    .map(f => f.name.replace(".ocx", ""))
    .sort();
}
