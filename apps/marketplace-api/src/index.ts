/**
 * Starizzi Marketplace API
 * Forked from izzi-backend pattern — same Hono + Supabase stack
 * Runs on port 8788 (izzi-backend: 8787)
 */
import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { extensionRoutes } from "./routes/extensions.js";
import { reviewRoutes } from "./routes/reviews.js";
import { developerRoutes } from "./routes/developers.js";

const app = new Hono();

// --- Global middleware ---
app.use("*", logger());
app.use("*", cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "https://izziapi.com",
    "https://www.izziapi.com",
    "app://.",  // Electron app
  ],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// --- Health check ---
app.get("/", (c) => c.json({
  service: "Starizzi Marketplace API",
  version: "0.1.0",
  status: "ok",
  mode: process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY ? "supabase" : "demo",
  endpoints: [
    "GET  /api/extensions",
    "GET  /api/extensions/:id",
    "POST /api/extensions",
    "PUT  /api/extensions/:id",
    "POST /api/extensions/:id/install",
    "GET  /api/extensions/categories",
    "GET  /api/extensions/:id/reviews",
    "POST /api/extensions/:id/reviews",
    "POST /api/developers/register",
    "GET  /api/developers/me",
  ],
}));

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// --- Routes ---
app.route("/api/extensions", extensionRoutes);
app.route("/api/extensions", reviewRoutes);    // Nested under /api/extensions/:id/reviews
app.route("/api/developers", developerRoutes);

// --- 404 ---
app.notFound((c) => c.json({
  error: { type: "not_found", message: "Endpoint not found. See / for available routes." },
}, 404));

// --- Error handler ---
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ error: { type: "server_error", message: "Internal server error" } }, 500);
});

// --- Start server ---
const port = Number(process.env.PORT) || 8788;
console.log(`\n🛒 Starizzi Marketplace API v0.1 running on http://localhost:${port}`);
console.log(`   GET  /api/extensions         (Browse marketplace)`);
console.log(`   POST /api/extensions          (Publish extension)`);
console.log(`   POST /api/developers/register (Become a developer)`);
console.log(`   GET  /api/developers/me       (Developer dashboard)\n`);

serve({ fetch: app.fetch, port });
