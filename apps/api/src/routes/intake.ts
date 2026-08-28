import { contactFormSubmissionSchema, normalizeContactFormSubmission } from "@ai-sales-agent/connectors";
import { evaluatePolicy, type PlatformPolicyInput } from "@ai-sales-agent/policy-engine";
import type { FastifyInstance } from "fastify";
import { deriveAutomationPermission } from "../lib/automation-permission.js";
import { toJsonSafe } from "../lib/json-safe.js";

/**
 * Deliberately public/unauthenticated — this is meant to be called
 * directly from the operator's own website's contact form, by an
 * anonymous visitor. Contrast with routes/connectors.ts, which requires
 * auth because it's an operator-triggered action against third-party
 * platforms, not a public intake point.
 */
export default async function intakeRoutes(app: FastifyInstance): Promise<void> {
  app.post("/intake/contact-form", async (request, reply) => {
    const body = contactFormSubmissionSchema.parse(request.body);

    // Honeypot: a hidden form field real visitors never see or fill in.
    // A bot that fills in every field will trip this. Respond exactly
    // like a genuine success (don't tip off the bot that it was caught),
    // but don't actually create anything.
    if (body.website) {
      return reply.status(200).send({ success: true, data: { received: true } });
    }

    const platform = await app.prisma.platform.findUnique({ where: { key: "own_website" } });
    if (!platform) {
      // This should never happen outside a broken/unseeded database —
      // but a public endpoint should never 500 with an unhelpful crash
      // when a clear, specific error is possible instead.
      app.log.error("own_website platform is missing — was the database seeded?");
      return reply.status(503).send({
        success: false,
        error: { message: "Contact form intake is temporarily unavailable.", code: "NOT_CONFIGURED" },
      });
    }

    const platformInput: PlatformPolicyInput = {
      key: platform.key,
      name: platform.name,
      isEnabled: platform.isEnabled,
      discoveryAllowed: platform.discoveryAllowed,
      automationAllowed: platform.automationAllowed,
      autoMessageAllowed: platform.autoMessageAllowed,
      autoCommentAllowed: platform.autoCommentAllowed,
    };
    const policyDecision = evaluatePolicy(platformInput, "DISCOVER", true);
    if (!policyDecision.allowed) {
      // Configuration error (own_website is seeded permitted) rather
      // than something a genuine visitor should see the internals of.
      app.log.error({ reason: policyDecision.reason }, "own_website discovery unexpectedly denied");
      return reply.status(503).send({
        success: false,
        error: { message: "Contact form intake is temporarily unavailable.", code: "POLICY_DENIED" },
      });
    }

    const normalized = normalizeContactFormSubmission(body);
    const automationPermission = deriveAutomationPermission(platform);

    await app.prisma.$transaction([
      app.prisma.opportunity.create({
        data: {
          sourcePlatformId: platform.id,
          externalId: normalized.externalId,
          title: normalized.title,
          description: normalized.description,
          authorName: normalized.authorName,
          authorMetadata: normalized.authorMetadata
            ? toJsonSafe(normalized.authorMetadata)
            : undefined,
          automationPermission,
          sourceCreatedAt: normalized.sourceCreatedAt,
          status: "DISCOVERED",
        },
      }),
      app.prisma.activityLog.create({
        data: {
          actor: "SYSTEM",
          action: "intake.contact_form_submitted",
          entityType: "Platform",
          entityId: platform.id,
        },
      }),
    ]);

    return reply.status(201).send({ success: true, data: { received: true } });
  });
}
