import { z } from "zod";
import type { NormalizedOpportunity } from "@ai-sales-agent/shared";

/**
 * The operator's own website is push-based (a visitor submits a contact
 * form), not poll-based like RemoteOK/We Work Remotely — there's nothing
 * to "fetch" on a schedule. So this doesn't implement the Connector
 * interface; it's a plain normalize function a future
 * POST /intake/contact-form route (Round 5+, once that endpoint exists)
 * will call directly on the submitted form data.
 *
 * This is also the one source seeded with automationAllowed=true (see
 * prisma/seed.ts / docs/ADR.md section 8) — there's no third party's
 * Terms of Service in play here, since it's the operator's own site.
 */
export const contactFormSubmissionSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  projectDescription: z.string().min(1),
  budget: z.string().optional(),
  timeline: z.string().optional(),
  submittedAt: z.coerce.date().optional(),
  // A simple honeypot/anti-spam field convention — a real bot filling
  // this in should be filtered upstream before this function is called,
  // but accepting the field here keeps the schema honest about what a
  // real submission payload looks like.
  website: z.string().optional(),
});

export type ContactFormSubmission = z.infer<typeof contactFormSubmissionSchema>;

let submissionCounter = 0;

export function normalizeContactFormSubmission(
  submission: ContactFormSubmission,
): NormalizedOpportunity {
  // The contact form has no natural "external id" the way a job board
  // listing does (it IS the source, not a reference to one elsewhere) —
  // synthesize one from the submission timestamp plus a counter so
  // rapid-fire submissions in the same millisecond still get distinct
  // ids within a single process. Distinctness across restarts is left to
  // the database's own id generation once this is actually persisted —
  // duplicate detection for contact-form submissions isn't really a
  // meaningful concept the way it is for a scraped job board (a person
  // submitting the form twice is two genuine, separate inquiries, not a
  // "duplicate" to filter out).
  submissionCounter += 1;
  const timestamp = (submission.submittedAt ?? new Date()).getTime();

  return {
    sourcePlatformKey: "own_website",
    externalId: `contact-form-${timestamp}-${submissionCounter}`,
    title: `Contact form inquiry from ${submission.name}`,
    description: submission.projectDescription,
    authorName: submission.name,
    // NormalizedOpportunity has no free-text budget/timeline fields (the
    // structured budgetMin/budgetMax are for numeric ranges scraped job
    // boards sometimes provide) — a contact-form submitter's own words
    // ("around $2000", "ASAP") don't fit that shape, so they're kept
    // here rather than silently dropped. The AI relevance engine
    // (Round 5+) or a human reading the opportunity can still see them.
    authorMetadata: {
      email: submission.email,
      ...(submission.budget ? { statedBudget: submission.budget } : {}),
      ...(submission.timeline ? { statedTimeline: submission.timeline } : {}),
    },
    sourceCreatedAt: submission.submittedAt,
  };
}
