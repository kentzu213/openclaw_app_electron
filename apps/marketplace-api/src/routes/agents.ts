/**
 * Agent Bundle routes
 * GET  /                    — List + search agent bundles
 * GET  /:id                 — Agent bundle detail
 * POST /                    — Publish new agent bundle (requires auth)
 * PUT  /:id                 — Update agent bundle (owner only)
 * POST /:id/install         — Track agent install
 * GET  /categories          — List agent categories
 * GET  /featured            — Featured / promoted agents
 */
import { Hono } from "hono";
import { isDemoMode, supabase } from "../db/client.js";
import { requireAuth, type DashboardUser } from "../middleware/auth.js";

export const agentRoutes = new Hono<{ Variables: { user: DashboardUser } }>();

// ── Demo data for agent bundles ──

const DEMO_AGENTS = [
  {
    id: "agent-auto-facebook",
    name: "auto-facebook",
    display_name: "Auto Facebook Agent",
    description: "Tự động đăng bài, trả lời comment, lên lịch content, phân tích audience trên Facebook.",
    version: "1.0.0",
    category: "social-media",
    icon: "🤖",
    developer_name: "Izzi Team",
    pricing_model: "paid",
    price_monthly: 19.99,
    price_yearly: 199,
    trial_days: 7,
    install_count: 12500,
    rating_avg: 4.8,
    rating_count: 234,
    status: "approved",
    bundle_type: "agent",
    skills_count: 8,
    automation_count: 3,
    platforms: ["facebook", "messenger"],
    screenshots: [],
    created_at: "2026-03-01T00:00:00Z",
  },
  {
    id: "agent-auto-saler",
    name: "auto-saler",
    display_name: "Auto Saler Agent",
    description: "Chatbot bán hàng thông minh, follow-up khách hàng, báo cáo doanh thu đa kênh.",
    version: "1.0.0",
    category: "sales",
    icon: "💰",
    developer_name: "Izzi Team",
    pricing_model: "paid",
    price_monthly: 29.99,
    price_yearly: 299,
    trial_days: 7,
    install_count: 25000,
    rating_avg: 4.9,
    rating_count: 456,
    status: "approved",
    bundle_type: "agent",
    skills_count: 8,
    automation_count: 4,
    platforms: ["facebook", "telegram", "zalo", "messenger"],
    screenshots: [],
    created_at: "2026-03-01T00:00:00Z",
  },
  {
    id: "agent-auto-secretary",
    name: "auto-secretary",
    display_name: "Auto Secretary Agent",
    description: "Thư ký AI: nhắc lịch, quản lý task, tóm tắt cuộc họp, daily briefing.",
    version: "1.0.0",
    category: "productivity",
    icon: "📋",
    developer_name: "Izzi Team",
    pricing_model: "freemium",
    price_monthly: 9.99,
    price_yearly: 99,
    trial_days: 0,
    install_count: 8900,
    rating_avg: 4.7,
    rating_count: 178,
    status: "approved",
    bundle_type: "agent",
    skills_count: 8,
    automation_count: 5,
    platforms: ["telegram", "email"],
    screenshots: [],
    created_at: "2026-03-01T00:00:00Z",
  },
  {
    id: "agent-auto-content",
    name: "auto-content",
    display_name: "Auto Content Agent",
    description: "Content creator AI: viết blog SEO, social media, email marketing, kịch bản video.",
    version: "1.0.0",
    category: "content",
    icon: "✍️",
    developer_name: "Izzi Team",
    pricing_model: "paid",
    price_monthly: 14.99,
    price_yearly: 149,
    trial_days: 7,
    install_count: 6700,
    rating_avg: 4.6,
    rating_count: 123,
    status: "approved",
    bundle_type: "agent",
    skills_count: 8,
    automation_count: 2,
    platforms: ["webhook"],
    screenshots: [],
    created_at: "2026-03-01T00:00:00Z",
  },
];

const AGENT_CATEGORIES = ["social-media", "sales", "productivity", "content", "customer-support", "analytics"];

// GET / — List and search agent bundles
agentRoutes.get("/", async (c) => {
  const query = c.req.query("q") || c.req.query("search") || "";
  const category = c.req.query("category") || "";
  const sort = c.req.query("sort") || "popular";
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") || "20", 10), 50);
  const offset = (page - 1) * limit;

  if (isDemoMode || !supabase) {
    let filtered = [...DEMO_AGENTS];

    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(a =>
        a.display_name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q)
      );
    }

    if (category && category !== "all") {
      filtered = filtered.filter(a => a.category === category);
    }

    switch (sort) {
      case "newest": filtered.sort((a, b) => b.created_at.localeCompare(a.created_at)); break;
      case "name": filtered.sort((a, b) => a.display_name.localeCompare(b.display_name)); break;
      case "rating": filtered.sort((a, b) => b.rating_avg - a.rating_avg); break;
      default: filtered.sort((a, b) => b.install_count - a.install_count); break;
    }

    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);

    return c.json({
      agents: paged,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }

  // Supabase mode
  let dbQuery = supabase
    .from("marketplace_agents")
    .select("*", { count: "exact" })
    .eq("status", "approved");

  if (query) {
    dbQuery = dbQuery.or(`display_name.ilike.%${query}%,description.ilike.%${query}%,name.ilike.%${query}%`);
  }
  if (category && category !== "all") {
    dbQuery = dbQuery.eq("category", category);
  }

  switch (sort) {
    case "newest": dbQuery = dbQuery.order("created_at", { ascending: false }); break;
    case "name": dbQuery = dbQuery.order("display_name", { ascending: true }); break;
    case "rating": dbQuery = dbQuery.order("rating_avg", { ascending: false }); break;
    default: dbQuery = dbQuery.order("install_count", { ascending: false }); break;
  }

  dbQuery = dbQuery.range(offset, offset + limit - 1);

  const { data: agents, error, count } = await dbQuery;

  if (error) {
    return c.json({ error: { type: "database_error", message: error.message } }, 500);
  }

  return c.json({
    agents: agents || [],
    pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
  });
});

// GET /categories — List agent categories
agentRoutes.get("/categories", async (c) => {
  if (isDemoMode || !supabase) {
    return c.json({ categories: AGENT_CATEGORIES });
  }

  const { data, error } = await supabase
    .from("marketplace_agents")
    .select("category")
    .eq("status", "approved")
    .not("category", "is", null);

  if (error) {
    return c.json({ error: { type: "database_error", message: error.message } }, 500);
  }

  const categories = [...new Set((data || []).map(e => e.category).filter(Boolean))].sort();
  return c.json({ categories });
});

// GET /featured — Featured agents (for homepage / promotional banners)
agentRoutes.get("/featured", async (c) => {
  if (isDemoMode || !supabase) {
    // Return top 3 by install count
    const featured = [...DEMO_AGENTS].sort((a, b) => b.install_count - a.install_count).slice(0, 3);
    return c.json({ agents: featured, bundle_deal: { name: "All-in-One Bundle", price_monthly: 49.99, price_yearly: 499, discount_percent: 35 } });
  }

  const { data: agents, error } = await supabase
    .from("marketplace_agents")
    .select("*")
    .eq("status", "approved")
    .order("install_count", { ascending: false })
    .limit(6);

  if (error) {
    return c.json({ error: { type: "database_error", message: error.message } }, 500);
  }

  return c.json({
    agents: agents || [],
    bundle_deal: { name: "All-in-One Bundle", price_monthly: 49.99, price_yearly: 499, discount_percent: 35 },
  });
});

// GET /:id — Agent bundle detail
agentRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  if (isDemoMode || !supabase) {
    const agent = DEMO_AGENTS.find(a => a.id === id || a.name === id);
    if (!agent) {
      return c.json({ error: { type: "not_found", message: "Agent bundle not found" } }, 404);
    }
    return c.json({ agent });
  }

  const { data: agent, error } = await supabase
    .from("marketplace_agents")
    .select("*")
    .or(`id.eq.${id},name.eq.${id}`)
    .single();

  if (error || !agent) {
    return c.json({ error: { type: "not_found", message: "Agent bundle not found" } }, 404);
  }

  return c.json({ agent });
});

// POST / — Publish new agent bundle (authenticated developers)
agentRoutes.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json();

  const { name, display_name, description, version, category, manifest, pricing_model, price_monthly, price_yearly, skills_count, automation_count, platforms } = body;

  if (!name || !display_name || !version) {
    return c.json({ error: { type: "validation_error", message: "name, display_name, and version are required" } }, 400);
  }

  if (isDemoMode || !supabase) {
    return c.json({
      agent: { id: `agent-${name}`, name, display_name, version, status: "pending" },
      message: `Agent bundle submitted by ${user.email} (demo mode)`,
    }, 201);
  }

  // Check name uniqueness
  const { data: existing } = await supabase
    .from("marketplace_agents")
    .select("id")
    .eq("name", name)
    .single();

  if (existing) {
    return c.json({ error: { type: "conflict", message: "Agent bundle name already taken" } }, 409);
  }

  const { data: agent, error } = await supabase
    .from("marketplace_agents")
    .insert({
      name,
      display_name,
      description: description || "",
      version,
      developer_id: user.id,
      category: category || "other",
      manifest: manifest || {},
      pricing_model: pricing_model || "free",
      price_monthly: price_monthly || null,
      price_yearly: price_yearly || null,
      skills_count: skills_count || 0,
      automation_count: automation_count || 0,
      platforms: platforms || [],
      bundle_type: "agent",
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return c.json({ error: { type: "database_error", message: error.message } }, 500);
  }

  return c.json({ agent, message: "Agent bundle submitted for review" }, 201);
});

// POST /:id/install — Track agent installation
agentRoutes.post("/:id/install", async (c) => {
  const id = c.req.param("id");

  if (isDemoMode || !supabase) {
    const agent = DEMO_AGENTS.find(a => a.id === id || a.name === id);
    if (!agent) {
      return c.json({ error: { type: "not_found", message: "Agent bundle not found" } }, 404);
    }
    return c.json({ success: true, message: "Install tracked (demo mode)" });
  }

  const authHeader = c.req.header("authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data: { user } } = await supabase.auth.getUser(token);
    userId = user?.id || null;
  }

  const { data: agent } = await supabase
    .from("marketplace_agents")
    .select("id, pricing_model")
    .or(`id.eq.${id},name.eq.${id}`)
    .eq("status", "approved")
    .single();

  if (!agent) {
    return c.json({ error: { type: "not_found", message: "Agent bundle not found" } }, 404);
  }

  // Paid agents require auth
  if (agent.pricing_model !== "free" && agent.pricing_model !== "freemium" && !userId) {
    return c.json({ error: { type: "authentication_error", message: "Login required for paid agents" } }, 401);
  }

  if (userId) {
    await supabase.from("marketplace_agent_installs").upsert({
      agent_id: agent.id,
      user_id: userId,
      installed_at: new Date().toISOString(),
    }, { onConflict: "agent_id,user_id" });
  }

  // Increment install count
  await supabase.rpc("increment_agent_install_count", { agent_id: agent.id });

  return c.json({ success: true, message: "Agent install tracked" });
});
