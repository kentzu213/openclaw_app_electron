/**
 * Auth middleware for Marketplace API
 * Validates Supabase JWT tokens — same pattern as izzi-backend/middleware/auth.ts
 */
import { createMiddleware } from "hono/factory";
import { isDemoMode, supabase } from "../db/client.js";

export interface DashboardUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  plan: string;
  balance: number;
}

/**
 * Get user from Supabase JWT token
 * Forked from: izzi-backend/middleware/auth.ts → getUserFromToken()
 */
export async function getUserFromToken(authHeader: string | undefined): Promise<DashboardUser | null> {
  if (isDemoMode || !supabase) return null;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  // Get profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    email: user.email || "",
    name: profile.name,
    role: profile.role || "user",
    plan: profile.plan || "free",
    balance: profile.balance ?? 0,
  };
}

/**
 * Require authenticated user (any role)
 */
export const requireAuth = createMiddleware<{ Variables: { user: DashboardUser } }>(async (c, next) => {
  const user = await getUserFromToken(c.req.header("authorization"));
  if (!user) {
    return c.json({ error: { type: "authentication_error", message: "Unauthorized" } }, 401);
  }
  c.set("user", user);
  await next();
});

/**
 * Require admin role
 */
export const requireAdmin = createMiddleware<{ Variables: { user: DashboardUser } }>(async (c, next) => {
  const user = await getUserFromToken(c.req.header("authorization"));
  if (!user) {
    return c.json({ error: { type: "authentication_error", message: "Unauthorized" } }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: { type: "authorization_error", message: "Admin access required" } }, 403);
  }
  c.set("user", user);
  await next();
});
