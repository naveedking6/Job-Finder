import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { DEFAULT_SETTINGS } from "@ai-sales-agent/shared";

const prisma = new PrismaClient();

/**
 * Platforms seeded with their policy flags already set per the ADR's
 * compliance stance (section 8). Automation-prohibiting platforms are
 * seeded DISABLED — this is a starting default, editable later via
 * PUT /platforms/:id, but it never defaults to "on".
 */
const PLATFORM_SEEDS = [
  {
    key: "upwork",
    name: "Upwork",
    automationAllowed: false,
    discoveryAllowed: false,
    autoMessageAllowed: false,
    autoCommentAllowed: false,
    apiAvailable: false,
    isEnabled: false,
    complianceNotes:
      "Upwork's Terms of Service prohibit third-party automation of browsing, bidding, or messaging, and Upwork does not offer a public API for opportunity search. Disabled by default.",
  },
  {
    key: "fiverr",
    name: "Fiverr",
    automationAllowed: false,
    discoveryAllowed: false,
    autoMessageAllowed: false,
    autoCommentAllowed: false,
    apiAvailable: false,
    isEnabled: false,
    complianceNotes:
      "Fiverr's Terms of Service prohibit scraping and automated interaction; no public API for buyer request discovery. Disabled by default.",
  },
  {
    key: "freelancer",
    name: "Freelancer.com",
    automationAllowed: false,
    discoveryAllowed: false,
    autoMessageAllowed: false,
    autoCommentAllowed: false,
    apiAvailable: false,
    isEnabled: false,
    complianceNotes:
      "Freelancer.com's Terms of Service prohibit automated bidding/messaging by third-party tools. Disabled by default.",
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    automationAllowed: false,
    discoveryAllowed: false,
    autoMessageAllowed: false,
    autoCommentAllowed: false,
    apiAvailable: false,
    isEnabled: false,
    complianceNotes:
      "LinkedIn's Terms of Service prohibit automated scraping and messaging outside their official (heavily restricted) Partner APIs, which this project does not have access to. Disabled by default.",
  },
  {
    key: "remoteok",
    name: "RemoteOK",
    automationAllowed: false,
    discoveryAllowed: true,
    autoMessageAllowed: false,
    autoCommentAllowed: false,
    apiAvailable: true,
    isEnabled: true,
    complianceNotes:
      "RemoteOK publishes a public JSON job feed intended for programmatic consumption. Discovery only — RemoteOK is a job board, not a messaging channel, so outreach still has to happen elsewhere (e.g. the employer's own application link).",
  },
  {
    key: "we_work_remotely",
    name: "We Work Remotely",
    automationAllowed: false,
    discoveryAllowed: true,
    autoMessageAllowed: false,
    autoCommentAllowed: false,
    apiAvailable: true,
    isEnabled: true,
    complianceNotes:
      "We Work Remotely publishes a public RSS feed intended for programmatic consumption. Discovery only, same reasoning as RemoteOK.",
  },
  {
    key: "own_website",
    name: "Own Website / Contact Form",
    automationAllowed: true,
    discoveryAllowed: true,
    autoMessageAllowed: true,
    autoCommentAllowed: false,
    apiAvailable: true,
    isEnabled: true,
    complianceNotes:
      "This is the operator's own website — full automation is inherently permitted since there's no third party's terms of service being crossed. This is the primary legitimate outreach channel.",
  },
] as const;

/**
 * The operator's professional profile as configurable seed data, per the
 * brief's instruction that this must not be permanently hard-coded.
 */
const SERVICE_SEEDS = [
  { name: "WordPress Development", slug: "wordpress-development", category: "cms" },
  { name: "WooCommerce Development", slug: "woocommerce-development", category: "ecommerce" },
  { name: "Shopify Development", slug: "shopify-development", category: "ecommerce" },
  { name: "Website Design", slug: "website-design", category: "design" },
  { name: "Website Development", slug: "website-development", category: "development" },
  { name: "eCommerce Development", slug: "ecommerce-development", category: "ecommerce" },
  { name: "Elementor", slug: "elementor", category: "cms" },
  { name: "Webflow", slug: "webflow", category: "development" },
  { name: "Wix", slug: "wix", category: "cms" },
  { name: "Odoo Website / eCommerce", slug: "odoo", category: "ecommerce" },
  { name: "API Integration", slug: "api-integration", category: "development" },
  { name: "Website Customization", slug: "website-customization", category: "development" },
  { name: "Website Bug Fixing", slug: "website-bug-fixing", category: "maintenance" },
  {
    name: "Responsive Website Development",
    slug: "responsive-website-development",
    category: "development",
  },
] as const;

async function main(): Promise<void> {
  // --- Admin user ---
  // Password is intentionally NOT seeded here — that would mean a known
  // default credential sitting in version control. Instead, the seed
  // creates the user with a random unusable placeholder hash, and the
  // real password must be set via a one-time script/console command
  // using a real secret, documented in docs/DEPLOYMENT.md (written when
  // that doc is created in a later round).
  const placeholderHash = await bcrypt.hash(randomUUID(), 10);
  await prisma.user.upsert({
    where: { email: "naveed@example.com" },
    create: {
      email: "naveed@example.com",
      name: "Muhammad Naveed",
      passwordHash: placeholderHash,
      role: "ADMIN",
    },
    update: {},
  });
  console.log("Seeded admin user (password NOT set — see docs/DEPLOYMENT.md).");

  // --- Default settings ---
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: {},
    });
  }
  console.log(`Seeded ${Object.keys(DEFAULT_SETTINGS).length} default settings.`);

  // --- Platforms ---
  for (const platform of PLATFORM_SEEDS) {
    await prisma.platform.upsert({
      where: { key: platform.key },
      create: platform,
      update: {},
    });
  }
  console.log(`Seeded ${PLATFORM_SEEDS.length} platforms.`);

  // --- Services (operator's profile) ---
  for (const service of SERVICE_SEEDS) {
    await prisma.service.upsert({
      where: { slug: service.slug },
      create: service,
      update: {},
    });
  }
  console.log(`Seeded ${SERVICE_SEEDS.length} services.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
