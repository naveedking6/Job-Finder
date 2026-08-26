import { z } from "zod";

export const portfolioItemInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  technologies: z.array(z.string()).default([]),
  serviceCategory: z.string().optional(),
  industry: z.string().optional(),
  projectUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  caseStudy: z.string().optional(),
  tags: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export type PortfolioItemInput = z.infer<typeof portfolioItemInputSchema>;

/** PUT allows partial updates — every field optional except nothing is required. */
export const portfolioItemUpdateSchema = portfolioItemInputSchema.partial();
export type PortfolioItemUpdate = z.infer<typeof portfolioItemUpdateSchema>;

export const platformUpdateSchema = z.object({
  automationAllowed: z.boolean().optional(),
  discoveryAllowed: z.boolean().optional(),
  autoMessageAllowed: z.boolean().optional(),
  autoCommentAllowed: z.boolean().optional(),
  apiAvailable: z.boolean().optional(),
  complianceNotes: z.string().optional(),
  isEnabled: z.boolean().optional(),
});

export type PlatformUpdate = z.infer<typeof platformUpdateSchema>;

export const leadHandoffSchema = z.object({
  reason: z.string().min(1),
});

export type LeadHandoffInput = z.infer<typeof leadHandoffSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
