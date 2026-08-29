/**
 * The brief lists selectPortfolio() as an AI provider capability, but
 * this is deliberately NOT part of the AiProvider interface (provider.ts).
 * Once analyzeOpportunity has already determined which service slugs an
 * opportunity matches, picking relevant portfolio items is a plain
 * category filter — spending an LLM call (and the real money that costs,
 * see docs/ADR.md section 7) on a task a database WHERE clause already
 * solves would be waste, not sophistication. See docs/ADR.md Round 5
 * section for the full reasoning.
 */

export interface PortfolioItemRef {
  id: string;
  serviceCategory: string | null;
  createdAt: Date;
}

/**
 * Picks portfolio items whose serviceCategory matches one of the given
 * service slugs, most recent first, capped at maxItems — matching the
 * brief's explicit instruction not to spam a client with every portfolio
 * item, just the relevant ones.
 */
export function selectRelevantPortfolioItems<T extends PortfolioItemRef>(
  matchedServiceSlugs: string[],
  portfolioItems: T[],
  maxItems = 3,
): T[] {
  if (matchedServiceSlugs.length === 0) return [];

  const matchedSet = new Set(matchedServiceSlugs);
  return portfolioItems
    .filter((item) => item.serviceCategory !== null && matchedSet.has(item.serviceCategory))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, maxItems);
}
