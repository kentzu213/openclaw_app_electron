/**
 * Upload / Download routes for .ocx binaries
 *
 * POST /:id/upload     — Upload .ocx binary (developer only)
 * GET  /:id/download   — Download .ocx binary (track install)
 * GET  /:id/versions   — List all available versions
 */
import { Hono } from "hono";
import { isDemoMode, supabase } from "../db/client.js";
import { requireAuth, getUserFromToken, type DashboardUser } from "../middleware/auth.js";
import {
  uploadOcxBinary,
  downloadOcxBinary,
  getSignedDownloadUrl,
  listExtensionVersions,
} from "../lib/storage.js";

export const uploadRoutes = new Hono<{ Variables: { user: DashboardUser } }>();

// POST /:id/upload — Upload .ocx binary
uploadRoutes.post("/:id/upload", requireAuth, async (c) => {
  if (isDemoMode || !supabase) {
    return c.json({ error: { type: "unsupported_in_demo", message: "Uploads require Supabase mode" } }, 503);
  }

  const user = c.get("user");
  const id = c.req.param("id");

  // Verify extension exists and user is owner
  const { data: ext } = await supabase
    .from("marketplace_extensions")
    .select("id, name, version, developer_id, status")
    .eq("id", id)
    .single();

  if (!ext) {
    return c.json({ error: { type: "not_found", message: "Extension not found" } }, 404);
  }

  if (ext.developer_id !== user.id && user.role !== "admin") {
    return c.json({ error: { type: "authorization_error", message: "Only the extension owner can upload binaries" } }, 403);
  }

  // Parse multipart form data
  const contentType = c.req.header("content-type") || "";

  let fileBuffer: ArrayBuffer;
  let uploadVersion = ext.version;

  if (contentType.includes("multipart/form-data")) {
    // Multipart upload
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    const versionOverride = formData.get("version") as string | null;

    if (!file) {
      return c.json({ error: { type: "validation_error", message: "No file provided. Use form field 'file'" } }, 400);
    }

    // Validate file extension
    if (!file.name.endsWith(".ocx") && !file.name.endsWith(".tar.gz")) {
      return c.json({ error: { type: "validation_error", message: "File must be .ocx or .tar.gz" } }, 400);
    }

    fileBuffer = await file.arrayBuffer();
    if (versionOverride) uploadVersion = versionOverride;
  } else {
    // Raw binary upload
    fileBuffer = await c.req.arrayBuffer();
    const versionHeader = c.req.header("x-ocx-version");
    if (versionHeader) uploadVersion = versionHeader;
  }

  // Upload to Supabase Storage
  const result = await uploadOcxBinary(user.id, ext.name, uploadVersion, fileBuffer);

  if (!result.success) {
    return c.json({ error: { type: "upload_error", message: result.error } }, 500);
  }

  // Update extension record with binary metadata
  await supabase
    .from("marketplace_extensions")
    .update({
      binary_path: result.path,
      binary_size: result.size,
      binary_sha256: result.sha256,
      version: uploadVersion,
      has_binary: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  console.log(`[Upload] Extension ${ext.name}@${uploadVersion} uploaded by ${user.email} (${result.size} bytes)`);

  return c.json({
    success: true,
    message: `Binary uploaded: ${ext.name}@${uploadVersion}`,
    binary: {
      path: result.path,
      size: result.size,
      sha256: result.sha256,
      version: uploadVersion,
    },
  });
});

// GET /:id/download — Download .ocx binary
uploadRoutes.get("/:id/download", async (c) => {
  if (isDemoMode || !supabase) {
    return c.json({ error: { type: "unsupported_in_demo", message: "Downloads require Supabase mode" } }, 503);
  }

  const id = c.req.param("id");
  const format = c.req.query("format") || "binary"; // binary | url

  // Get extension with binary info
  const { data: ext } = await supabase
    .from("marketplace_extensions")
    .select("id, name, version, binary_path, binary_sha256, pricing_model, status, has_binary")
    .eq("id", id)
    .single();

  if (!ext) {
    return c.json({ error: { type: "not_found", message: "Extension not found" } }, 404);
  }

  if (ext.status !== "approved") {
    return c.json({ error: { type: "access_denied", message: "Extension not yet approved" } }, 403);
  }

  if (!ext.has_binary || !ext.binary_path) {
    return c.json({ error: { type: "not_found", message: "No binary available for this extension" } }, 404);
  }

  // Paid extensions require auth
  if (ext.pricing_model !== "free") {
    const authUser = await getUserFromToken(c.req.header("authorization"));
    if (!authUser) {
      return c.json({ error: { type: "authentication_error", message: "Login required for paid extensions" } }, 401);
    }

    // TODO: Check if user has purchased this extension
  }

  // Return signed URL (for Electron to download directly)
  if (format === "url") {
    const { url, error } = await getSignedDownloadUrl(ext.binary_path);
    if (error) {
      return c.json({ error: { type: "storage_error", message: error } }, 500);
    }

    return c.json({
      downloadUrl: url,
      filename: `${ext.name}-${ext.version}.ocx`,
      sha256: ext.binary_sha256,
      version: ext.version,
    });
  }

  // Stream binary directly
  const result = await downloadOcxBinary(ext.binary_path);
  if (!result.success || !result.data) {
    return c.json({ error: { type: "storage_error", message: result.error } }, 500);
  }

  // Track install
  const authHeader = c.req.header("authorization");
  const authUser = await getUserFromToken(authHeader);
  if (authUser) {
    await supabase.from("marketplace_installs").upsert(
      { extension_id: id, user_id: authUser.id, installed_at: new Date().toISOString() },
      { onConflict: "extension_id,user_id" },
    );
  }
  try { await supabase.rpc("increment_install_count", { ext_id: id }); } catch { /* ignore */ }

  return new Response(result.data, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${ext.name}-${ext.version}.ocx"`,
      "X-Ocx-SHA256": ext.binary_sha256 || "",
      "X-Ocx-Version": ext.version,
    },
  });
});

// GET /:id/versions — List available versions
uploadRoutes.get("/:id/versions", async (c) => {
  if (isDemoMode || !supabase) {
    return c.json({ versions: [] });
  }

  const id = c.req.param("id");

  const { data: ext } = await supabase
    .from("marketplace_extensions")
    .select("name, developer_id, version")
    .eq("id", id)
    .single();

  if (!ext) {
    return c.json({ error: { type: "not_found", message: "Extension not found" } }, 404);
  }

  const versions = await listExtensionVersions(ext.developer_id, ext.name);

  return c.json({
    currentVersion: ext.version,
    versions,
  });
});
