import { randomUUID } from "node:crypto";

export interface DemoExtension {
  id: string;
  name: string;
  display_name: string;
  description: string;
  version: string;
  category: string;
  icon_url: string | null;
  manifest: Record<string, unknown>;
  pricing_model: "free" | "paid" | "freemium";
  price_monthly: number | null;
  price_yearly: number | null;
  install_count: number;
  rating_avg: number;
  rating_count: number;
  status: "approved" | "pending";
  developer_id: string | null;
  profiles: { name: string; email: string };
  created_at: string;
}

const now = new Date().toISOString();

const demoExtensions: DemoExtension[] = [
  {
    id: "ext-seo-scanner",
    name: "smart-seo-scanner",
    display_name: "Smart SEO Scanner",
    description: "Quét và phân tích SEO tự động cho website. Tìm lỗi meta tags, broken links, và tối ưu on-page.",
    version: "1.2.0",
    category: "SEO",
    icon_url: null,
    manifest: { icon: "🔍" },
    pricing_model: "free",
    price_monthly: null,
    price_yearly: null,
    install_count: 12500,
    rating_avg: 4.8,
    rating_count: 194,
    status: "approved",
    developer_id: null,
    profiles: { name: "SEO Tools Inc.", email: "team@seotools.test" },
    created_at: now,
  },
  {
    id: "ext-social-auto",
    name: "social-auto-poster",
    display_name: "Social Auto Poster",
    description: "Tự động đăng bài lên Facebook, Instagram, Twitter. Lên lịch và quản lý nội dung đa nền tảng.",
    version: "2.0.1",
    category: "Marketing",
    icon_url: null,
    manifest: { icon: "📱" },
    pricing_model: "paid",
    price_monthly: 9.99,
    price_yearly: 99.99,
    install_count: 8900,
    rating_avg: 4.5,
    rating_count: 103,
    status: "approved",
    developer_id: null,
    profiles: { name: "MarketBot Team", email: "hello@marketbot.test" },
    created_at: now,
  },
  {
    id: "ext-ai-content",
    name: "ai-content-writer",
    display_name: "AI Content Writer",
    description: "Viết nội dung marketing, blog, email bằng AI. Hỗ trợ tiếng Việt và 30+ ngôn ngữ.",
    version: "3.1.0",
    category: "Content",
    icon_url: null,
    manifest: { icon: "✨" },
    pricing_model: "paid",
    price_monthly: 19.99,
    price_yearly: 199.99,
    install_count: 25000,
    rating_avg: 4.9,
    rating_count: 412,
    status: "approved",
    developer_id: null,
    profiles: { name: "ContentAI Co.", email: "support@contentai.test" },
    created_at: now,
  },
];

export function listDemoExtensions(params: {
  query?: string;
  category?: string;
  sort?: string;
  page?: number;
  limit?: number;
}) {
  const query = (params.query || "").trim().toLowerCase();
  const category = params.category || "";
  const sort = params.sort || "popular";
  const page = Math.max(params.page || 1, 1);
  const limit = Math.min(Math.max(params.limit || 20, 1), 50);

  let results = demoExtensions.filter((ext) => ext.status === "approved");

  if (query) {
    results = results.filter((ext) =>
      [ext.display_name, ext.description, ext.name, ext.profiles.name]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }

  if (category && category !== "all") {
    results = results.filter((ext) => ext.category === category);
  }

  switch (sort) {
    case "newest":
      results = [...results].sort((a, b) => b.created_at.localeCompare(a.created_at));
      break;
    case "name":
      results = [...results].sort((a, b) => a.display_name.localeCompare(b.display_name));
      break;
    case "rating":
      results = [...results].sort((a, b) => b.rating_avg - a.rating_avg);
      break;
    case "popular":
    default:
      results = [...results].sort((a, b) => b.install_count - a.install_count);
      break;
  }

  const total = results.length;
  const offset = (page - 1) * limit;

  return {
    extensions: results.slice(offset, offset + limit),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export function getDemoExtension(id: string) {
  return demoExtensions.find((ext) => ext.id === id) || null;
}

export function getDemoCategories() {
  return [...new Set(demoExtensions.filter((ext) => ext.status === "approved").map((ext) => ext.category))].sort();
}

export function trackDemoInstall(id: string) {
  const ext = getDemoExtension(id);
  if (!ext || ext.status !== "approved") return null;
  ext.install_count += 1;
  return ext;
}

export function createDemoExtension(input: {
  name: string;
  display_name: string;
  description?: string;
  version: string;
  category?: string;
  manifest?: Record<string, unknown>;
  pricing_model?: "free" | "paid" | "freemium";
  price_monthly?: number | null;
  price_yearly?: number | null;
}) {
  const existing = demoExtensions.find((ext) => ext.name === input.name);
  if (existing) return { error: "Extension name already taken" } as const;

  const ext: DemoExtension = {
    id: randomUUID(),
    name: input.name,
    display_name: input.display_name,
    description: input.description || "",
    version: input.version,
    category: input.category || "Other",
    icon_url: null,
    manifest: input.manifest || {},
    pricing_model: input.pricing_model || "free",
    price_monthly: input.price_monthly || null,
    price_yearly: input.price_yearly || null,
    install_count: 0,
    rating_avg: 0,
    rating_count: 0,
    status: "pending",
    developer_id: null,
    profiles: { name: "Demo Developer", email: "demo@starizzi.test" },
    created_at: new Date().toISOString(),
  };

  demoExtensions.unshift(ext);
  return { extension: ext } as const;
}
