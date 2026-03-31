/**
 * Review routes
 * POST /:extensionId/reviews  — Submit review
 * GET  /:extensionId/reviews  — List reviews
 */
import { Hono } from "hono";
import { isDemoMode, supabase } from "../db/client.js";
import { requireAuth, type DashboardUser } from "../middleware/auth.js";

export const reviewRoutes = new Hono<{ Variables: { user: DashboardUser } }>();

// POST /:extensionId/reviews — Submit review
reviewRoutes.post("/:extensionId/reviews", requireAuth, async (c) => {
  if (isDemoMode || !supabase) {
    return c.json({ error: { type: "unsupported_in_demo", message: "Review submission requires Supabase mode" } }, 503);
  }

  const user = c.get("user");
  const extensionId = c.req.param("extensionId");
  const { rating, comment } = await c.req.json();

  if (!rating || rating < 1 || rating > 5) {
    return c.json({ error: { type: "validation_error", message: "Rating must be 1-5" } }, 400);
  }

  // Verify extension exists
  const { data: ext } = await supabase
    .from("marketplace_extensions")
    .select("id")
    .eq("id", extensionId)
    .single();

  if (!ext) {
    return c.json({ error: { type: "not_found", message: "Extension not found" } }, 404);
  }

  // Check for existing review (one per user per extension)
  const { data: existing } = await supabase
    .from("marketplace_reviews")
    .select("id")
    .eq("extension_id", extensionId)
    .eq("user_id", user.id)
    .single();

  if (existing) {
    // Update existing review
    const { data: review, error } = await supabase
      .from("marketplace_reviews")
      .update({ rating, comment: comment || "", updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) return c.json({ error: { type: "database_error", message: error.message } }, 500);

    await updateExtensionRating(extensionId);
    return c.json({ review, message: "Review updated" });
  }

  // Insert new review
  const { data: review, error } = await supabase
    .from("marketplace_reviews")
    .insert({
      extension_id: extensionId,
      user_id: user.id,
      user_name: user.name || user.email.split("@")[0],
      rating,
      comment: comment || "",
    })
    .select()
    .single();

  if (error) return c.json({ error: { type: "database_error", message: error.message } }, 500);

  await updateExtensionRating(extensionId);
  return c.json({ review, message: "Review submitted" }, 201);
});

// GET /:extensionId/reviews — List reviews
reviewRoutes.get("/:extensionId/reviews", async (c) => {
  const extensionId = c.req.param("extensionId");
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") || "10", 10), 50);
  const offset = (page - 1) * limit;

  if (isDemoMode || !supabase) {
    return c.json({ reviews: [], pagination: { page, limit, total: 0 }, extensionId, mode: "demo" });
  }

  const { data: reviews, error, count } = await supabase
    .from("marketplace_reviews")
    .select("*", { count: "exact" })
    .eq("extension_id", extensionId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return c.json({ error: { type: "database_error", message: error.message } }, 500);

  return c.json({
    reviews: reviews || [],
    pagination: { page, limit, total: count || 0 },
  });
});

// Helper: recalculate extension rating
async function updateExtensionRating(extensionId: string) {
  if (isDemoMode || !supabase) return;

  const { data: reviews } = await supabase
    .from("marketplace_reviews")
    .select("rating")
    .eq("extension_id", extensionId);

  if (reviews && reviews.length > 0) {
    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    await supabase
      .from("marketplace_extensions")
      .update({ rating_avg: Math.round(avg * 100) / 100, rating_count: reviews.length })
      .eq("id", extensionId);
  }
}
