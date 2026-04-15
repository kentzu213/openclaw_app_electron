/**
 * Seed script — populate marketplace with sample extensions
 * Run: pnpm seed
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const SAMPLE_EXTENSIONS = [
  {
    name: "smart-seo-scanner",
    display_name: "Smart SEO Scanner",
    description: "Quét và phân tích SEO tự động cho website. Tìm lỗi meta tags, broken links, và tối ưu on-page.",
    version: "1.2.0",
    category: "SEO",
    pricing_model: "free",
    install_count: 12500,
    rating_avg: 4.8,
    rating_count: 340,
    status: "approved",
    manifest: { icon: "🔍", permissions: ["network", "dom"] },
  },
  {
    name: "social-auto-poster",
    display_name: "Social Auto Poster",
    description: "Tự động đăng bài lên Facebook, Instagram, Twitter. Lên lịch và quản lý nội dung đa nền tảng.",
    version: "2.0.1",
    category: "Marketing",
    pricing_model: "paid",
    price_monthly: 9.99,
    price_yearly: 99.99,
    install_count: 8900,
    rating_avg: 4.5,
    rating_count: 210,
    status: "approved",
    manifest: { icon: "📱", permissions: ["network", "storage"] },
  },
  {
    name: "ai-content-writer",
    display_name: "AI Content Writer",
    description: "Viết nội dung marketing, blog, email bằng AI. Hỗ trợ tiếng Việt và 30+ ngôn ngữ.",
    version: "3.1.0",
    category: "Content",
    pricing_model: "paid",
    price_monthly: 19.99,
    price_yearly: 199.99,
    install_count: 25000,
    rating_avg: 4.9,
    rating_count: 890,
    status: "approved",
    manifest: { icon: "✨", permissions: ["network", "clipboard"] },
  },
  {
    name: "deep-analytics",
    display_name: "Deep Analytics Dashboard",
    description: "Dashboard phân tích traffic, conversion, user behavior. Tích hợp Google Analytics và Facebook Pixel.",
    version: "1.5.0",
    category: "Analytics",
    pricing_model: "free",
    install_count: 15200,
    rating_avg: 4.7,
    rating_count: 520,
    status: "approved",
    manifest: { icon: "📊", permissions: ["network"] },
  },
  {
    name: "email-campaign-pro",
    display_name: "Email Campaign Pro",
    description: "Tạo và gửi email marketing chuyên nghiệp. A/B testing, automation workflows, và analytics.",
    version: "2.3.0",
    category: "Email",
    pricing_model: "paid",
    price_monthly: 14.99,
    price_yearly: 149.99,
    install_count: 6700,
    rating_avg: 4.6,
    rating_count: 180,
    status: "approved",
    manifest: { icon: "📧", permissions: ["network", "storage"] },
  },
  {
    name: "smart-chatbot",
    display_name: "Smart Chatbot Builder",
    description: "Xây dựng chatbot AI cho website và Messenger. Tự động trả lời khách hàng 24/7.",
    version: "1.0.0",
    category: "Customer Support",
    pricing_model: "paid",
    price_monthly: 24.99,
    price_yearly: 249.99,
    install_count: 3200,
    rating_avg: 4.4,
    rating_count: 95,
    status: "approved",
    manifest: { icon: "🤖", permissions: ["network", "dom", "storage"] },
  },
  {
    name: "form-builder-pro",
    display_name: "Form Builder Pro",
    description: "Tạo form liên hệ, khảo sát, đăng ký với drag-and-drop. Tích hợp webhook và email notifications.",
    version: "1.8.0",
    category: "Tools",
    pricing_model: "freemium",
    price_monthly: 7.99,
    price_yearly: 79.99,
    install_count: 9800,
    rating_avg: 4.6,
    rating_count: 280,
    status: "approved",
    manifest: { icon: "📝", permissions: ["dom", "storage"] },
  },
  {
    name: "image-optimizer",
    display_name: "Image Optimizer",
    description: "Nén và tối ưu hình ảnh tự động. WebP conversion, lazy loading, và responsive images.",
    version: "2.1.0",
    category: "Performance",
    pricing_model: "free",
    install_count: 18500,
    rating_avg: 4.8,
    rating_count: 640,
    status: "approved",
    manifest: { icon: "🖼️", permissions: ["filesystem"] },
  },
];

const SAMPLE_AGENTS = [
  {
    name: "auto-facebook",
    display_name: "Auto Facebook Agent",
    description: "Tự động đăng bài, trả lời comment, lên lịch content, phân tích audience trên Facebook. 8 skills + 3 cron jobs.",
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
  },
  {
    name: "auto-saler",
    display_name: "Auto Saler Agent",
    description: "Chatbot bán hàng thông minh, follow-up khách hàng, báo cáo doanh thu. 8 skills + 4 cron jobs đa kênh.",
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
  },
  {
    name: "auto-secretary",
    display_name: "Auto Secretary Agent",
    description: "Thư ký AI: nhắc lịch, quản lý task, tóm tắt cuộc họp, daily briefing. 8 skills + 5 cron jobs.",
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
  },
  {
    name: "auto-content",
    display_name: "Auto Content Agent",
    description: "Content creator AI: viết blog SEO, social media, email marketing, kịch bản video. 8 skills + 2 cron jobs.",
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
  },
];

async function seed() {
  console.log("🌱 Seeding marketplace extensions...\n");

  for (const ext of SAMPLE_EXTENSIONS) {
    const { data, error } = await supabase
      .from("marketplace_extensions")
      .upsert(ext, { onConflict: "name" })
      .select()
      .single();

    if (error) {
      console.error(`  ❌ ${ext.display_name}: ${error.message}`);
    } else {
      console.log(`  ✅ ${ext.display_name} v${ext.version} (${ext.pricing_model})`);
    }
  }

  console.log(`\n✨ Seeded ${SAMPLE_EXTENSIONS.length} extensions`);

  console.log("\n🤖 Seeding agent bundles...\n");

  for (const agent of SAMPLE_AGENTS) {
    const { data, error } = await supabase
      .from("marketplace_agents")
      .upsert(agent, { onConflict: "name" })
      .select()
      .single();

    if (error) {
      console.error(`  ❌ ${agent.display_name}: ${error.message}`);
    } else {
      console.log(`  ✅ ${agent.display_name} v${agent.version} (${agent.pricing_model}) — ${agent.skills_count} skills`);
    }
  }

  console.log(`\n✨ Seeded ${SAMPLE_AGENTS.length} agent bundles`);
  console.log(`\n🎉 Total: ${SAMPLE_EXTENSIONS.length} extensions + ${SAMPLE_AGENTS.length} agents`);
}

seed().catch(console.error);
