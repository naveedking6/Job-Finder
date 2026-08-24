import { z } from "zod";
import { AUTOMATION_PERMISSIONS, OPPORTUNITY_STATUSES } from "../enums.js";

/**
 * Every connector must produce data matching this shape before it enters
 * the pipeline, regardless of how different the source platform's raw
 * format is. This is the "Normalization Engine" boundary from the
 * architecture diagram in the brief.
 */
export const normalizedOpportunitySchema = z.object({
  sourcePlatformKey: z.string().min(1),
  sourceConnectorId: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  externalId: z.string().min(1),

  title: z.string().min(1),
  description: z.string().min(1),
  country: z.string().optional(),
  language: z.string().optional(),

  authorName: z.string().optional(),
  authorMetadata: z.record(z.unknown()).optional(),

  budgetMin: z.number().nonnegative().optional(),
  budgetMax: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  projectType: z.string().optional(),

  skillsDetected: z.array(z.string()).optional(),

  sourceCreatedAt: z.coerce.date().optional(),
});

export type NormalizedOpportunity = z.infer<typeof normalizedOpportunitySchema>;

export const opportunityStatusSchema = z.enum(OPPORTUNITY_STATUSES);
export const automationPermissionSchema = z.enum(AUTOMATION_PERMISSIONS);
