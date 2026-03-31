/**
 * Developer routes
 * POST /register            — Register as developer
 * GET  /me                  — Developer dashboard
 * GET  /me/extensions       — My published extensions
 * GET  /me/earnings         — Earnings summary
 */
import { Hono } from "hono";
import { isDemoMode, supabase } from "../db/client.js";
import { requireAuth, type DashboardUser } from "../middleware/auth.js";

export const developerRoutes = new Hono<{ Variables: { user: DashboardUser } }>();

const COMMISSION_RATE = parseFloat(process.env.COMMISSION_RATE || "0.15"); // 15%

// POST /register — Register as extension developer
developerRoutes.post("/register", requireAuth, async (c) => {
  if (isDemoMode || !supabase) {
    return c.json({ error: { type: "unsupported_in_demo", message: "Developer registration requires Supabase mode" } }, 503);
  }

  const user = c.get("user");
  const body = await c.req.json();

  const { developer_name, website, bio } = body;

  if (!developer_name) {
    return c.json({ error: { type: "validation_error", message: "developer_name is required" } }, 400);
  }

  // Check if already registered
  const { data: existing } = await supabase
    .from("marketplace_developers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (existing) {
    return c.json({ error: { type: "conflict", message: "Already registered as developer" } }, 409);
  }

  const { data: dev, error } = await supabase
    .from("marketplace_developers")
    .insert({
      user_id: user.id,
      developer_name,
      website: website || null,
      bio: bio || null,
      status: "active",
      commission_rate: COMMISSION_RATE,
    })
    .select()
    .single();

  if (error) {
    return c.json({ error: { type: "database_error", message: error.message } }, 500);
  }

  return c.json({ developer: dev, message: "Developer account created" }, 201);
});

// GET /me — Developer dashboard
developerRoutes.get("/me", requireAuth, async (c) => {
  if (isDemoMode || !supabase) {
    return c.json({ error: { type: "unsupported_in_demo", message: "Developer dashboard requires Supabase mode" } }, 503);
  }

  const user = c.get("user");

  const { data: dev } = await supabase
    .from("marketplace_developers")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!dev) {
    return c.json({ error: { type: "not_found", message: "Developer account not found. Register first." } }, 404);
  }

  // Count published extensions
  const { count: extensionCount } = await supabase
    .from("marketplace_extensions")
    .select("*", { count: "exact", head: true })
    .eq("developer_id", user.id);

  // Count total installs
  const { data: installData } = await supabase
    .from("marketplace_extensions")
    .select("install_count")
    .eq("developer_id", user.id);

  const totalInstalls = (installData || []).reduce((sum, e) => sum + (e.install_count || 0), 0);

  return c.json({
    developer: dev,
    stats: {
      totalExtensions: extensionCount || 0,
      totalInstalls,
      commissionRate: dev.commission_rate,
      totalEarnings: dev.total_earnings || 0,
      pendingPayout: dev.pending_payout || 0,
    },
  });
});

// GET /me/extensions — My published extensions
developerRoutes.get("/me/extensions", requireAuth, async (c) => {
  if (isDemoMode || !supabase) {
    return c.json({ error: { type: "unsupported_in_demo", message: "Developer extensions require Supabase mode" } }, 503);
  }

  const user = c.get("user");

  const { data: extensions, error } = await supabase
    .from("marketplace_extensions")
    .select("*")
    .eq("developer_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: { type: "database_error", message: error.message } }, 500);

  return c.json({ extensions: extensions || [] });
});

// GET /me/earnings — Earnings summary
developerRoutes.get("/me/earnings", requireAuth, async (c) => {
  if (isDemoMode || !supabase) {
    return c.json({ error: { type: "unsupported_in_demo", message: "Developer earnings require Supabase mode" } }, 503);
  }

  const user = c.get("user");

  const { data: dev } = await supabase
    .from("marketplace_developers")
    .select("total_earnings, pending_payout, commission_rate")
    .eq("user_id", user.id)
    .single();

  if (!dev) {
    return c.json({ error: { type: "not_found", message: "Developer account not found" } }, 404);
  }

  return c.json({
    totalEarnings: dev.total_earnings || 0,
    pendingPayout: dev.pending_payout || 0,
    commissionRate: dev.commission_rate,
    netCommission: 1 - dev.commission_rate,
  });
});
