/**
 * Extension CRUD routes
 * GET  /                    — List + search extensions  
 * GET  /:id                 — Extension detail
 * POST /                    — Publish new extension (requires auth)
 * PUT  /:id                 — Update extension (owner only)
 * POST /:id/install         — Track install
 * GET  /categories          — List categories
 */
import { Hono } from "hono";
import { isDemoMode, supabase } from "../db/client.js";
import { createDemoExtension, getDemoCategories, getDemoExtension, listDemoExtensions, trackDemoInstall } from "../lib/demo-store.js";
import { requireAuth, type DashboardUser } from "../middleware/auth.js";

export const extensionRoutes = new Hono<{ Variables: { user: DashboardUser } }>();

// GET / — List and search extensions
extensionRoutes.get("/", async (c) => {
  const query = c.req.query("q") || c.req.query("search") || "";
  const category = c.req.query("category") || "";
  const sort = c.req.query("sort") || "popular"; // popular | newest | name
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") || "20", 10), 50);
  const offset = (page - 1) * limit;

  if (isDemoMode || !supabase) {
    const demo = listDemoExtensions({ query, category, sort, page, limit });
    return c.json({
      extensions: demo.extensions,
      pagination: {
        page: demo.page,
        limit: demo.limit,
        total: demo.total,
        totalPages: demo.totalPages,
      },
    });
  }

  let dbQuery = supabase
    .from("marketplace_extensions")
    .select("*, profiles!marketplace_extensions_developer_id_fkey(name, email)", { count: "exact" })
    .eq("status", "approved");

  // Text search
  if (query) {
    dbQuery = dbQuery.or(`display_name.ilike.%${query}%,description.ilike.%${query}%,name.ilike.%${query}%`);
  }

  // Category filter
  if (category && category !== "all") {
    dbQuery = dbQuery.eq("category", category);
  }

  // Sorting
  switch (sort) {
    case "newest":
      dbQuery = dbQuery.order("created_at", { ascending: false });
      break;
    case "name":
      dbQuery = dbQuery.order("display_name", { ascending: true });
      break;
    case "rating":
      dbQuery = dbQuery.order("rating_avg", { ascending: false });
      break;
    case "popular":
    default:
      dbQuery = dbQuery.order("install_count", { ascending: false });
      break;
  }

  dbQuery = dbQuery.range(offset, offset + limit - 1);

  const { data: extensions, error, count } = await dbQuery;

  if (error) {
    return c.json({ error: { type: "database_error", message: error.message } }, 500);
  }

  return c.json({
    extensions: extensions || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
  });
});

// GET /categories — List available categories
extensionRoutes.get("/categories", async (c) => {
  if (isDemoMode || !supabase) {
    return c.json({ categories: getDemoCategories() });
  }

  const { data, error } = await supabase
    .from("marketplace_extensions")
    .select("category")
    .eq("status", "approved")
    .not("category", "is", null);

  if (error) {
    return c.json({ error: { type: "database_error", message: error.message } }, 500);
  }

  const categories = [...new Set((data || []).map(e => e.category).filter(Boolean))].sort();
  return c.json({ categories });
});

// GET /:id — Extension detail
extensionRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  if (isDemoMode || !supabase) {
    const ext = getDemoExtension(id);
    if (!ext) {
      return c.json({ error: { type: "not_found", message: "Extension not found" } }, 404);
    }
    return c.json({ extension: ext });
  }

  const { data: ext, error } = await supabase
    .from("marketplace_extensions")
    .select("*, profiles!marketplace_extensions_developer_id_fkey(name, email)")
    .eq("id", id)
    .single();

  if (error || !ext) {
    return c.json({ error: { type: "not_found", message: "Extension not found" } }, 404);
  }

  return c.json({ extension: ext });
});

// POST / — Publish new extension (authenticated developers)
extensionRoutes.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json();

  const { name, display_name, description, version, category, manifest, pricing_model, price_monthly, price_yearly } = body;

  if (!name || !display_name || !version) {
    return c.json({ error: { type: "validation_error", message: "name, display_name, and version are required" } }, 400);
  }

  if (isDemoMode || !supabase) {
    const result = createDemoExtension({
      name,
      display_name,
      description,
      version,
      category,
      manifest,
      pricing_model,
      price_monthly,
      price_yearly,
    });

    if ("error" in result) {
      return c.json({ error: { type: "conflict", message: result.error } }, 409);
    }

    return c.json({ extension: result.extension, message: `Demo extension submitted by ${user.email}` }, 201);
  }

  // Check name uniqueness
  const { data: existing } = await supabase
    .from("marketplace_extensions")
    .select("id")
    .eq("name", name)
    .single();

  if (existing) {
    return c.json({ error: { type: "conflict", message: "Extension name already taken" } }, 409);
  }

  const { data: ext, error } = await supabase
    .from("marketplace_extensions")
    .insert({
      name,
      display_name,
      description: description || "",
      version,
      developer_id: user.id,
      category: category || "Other",
      manifest: manifest || {},
      pricing_model: pricing_model || "free",
      price_monthly: price_monthly || null,
      price_yearly: price_yearly || null,
      status: "pending", // Hybrid review: auto SAST → manual for first-time
    })
    .select()
    .single();

  if (error) {
    return c.json({ error: { type: "database_error", message: error.message } }, 500);
  }

  return c.json({ extension: ext, message: "Extension submitted for review" }, 201);
});

// PUT /:id — Update extension (owner only)
extensionRoutes.put("/:id", requireAuth, async (c) => {
  if (isDemoMode || !supabase) {
    return c.json({ error: { type: "unsupported_in_demo", message: "Extension updates require Supabase mode" } }, 503);
  }

  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();

  // Verify ownership
  const { data: existing } = await supabase
    .from("marketplace_extensions")
    .select("developer_id")
    .eq("id", id)
    .single();

  if (!existing) {
    return c.json({ error: { type: "not_found", message: "Extension not found" } }, 404);
  }

  if (existing.developer_id !== user.id && user.role !== "admin") {
    return c.json({ error: { type: "authorization_error", message: "Not authorized to update this extension" } }, 403);
  }

  const allowedFields = ["display_name", "description", "version", "category", "manifest", "icon_url", "pricing_model", "price_monthly", "price_yearly"];
  const updates: Record<string, any> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: { type: "validation_error", message: "No valid fields to update" } }, 400);
  }

  // If version changed, re-submit for review
  if (updates.version) {
    updates.status = "pending";
  }

  const { data: ext, error } = await supabase
    .from("marketplace_extensions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return c.json({ error: { type: "database_error", message: error.message } }, 500);
  }

  return c.json({ extension: ext });
});

// POST /:id/install — Track installation
extensionRoutes.post("/:id/install", async (c) => {
  const id = c.req.param("id");

  if (isDemoMode || !supabase) {
    const ext = trackDemoInstall(id);
    if (!ext) {
      return c.json({ error: { type: "not_found", message: "Extension not found" } }, 404);
    }
    return c.json({ success: true, message: "Install tracked (demo mode)", extension: ext });
  }

  // Get auth header optionally (anonymous installs allowed for free extensions)
  const authHeader = c.req.header("authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data: { user } } = await supabase.auth.getUser(token);
    userId = user?.id || null;
  }

  // Verify extension exists and is approved
  const { data: ext } = await supabase
    .from("marketplace_extensions")
    .select("id, pricing_model")
    .eq("id", id)
    .eq("status", "approved")
    .single();

  if (!ext) {
    return c.json({ error: { type: "not_found", message: "Extension not found" } }, 404);
  }

  // Paid extensions require auth
  if (ext.pricing_model !== "free" && !userId) {
    return c.json({ error: { type: "authentication_error", message: "Login required for paid extensions" } }, 401);
  }

  // Record install
  if (userId) {
    await supabase.from("marketplace_installs").upsert({
      extension_id: id,
      user_id: userId,
      installed_at: new Date().toISOString(),
    }, { onConflict: "extension_id,user_id" });
  }

  // Increment install count
  await supabase.rpc("increment_install_count", { ext_id: id });

  return c.json({ success: true, message: "Install tracked" });
});
