/**
 * The brief's exact spec: `https://wa.me/PHONENUMBER` with a contextual
 * message, e.g. "Hi Muhammad Naveed, I was discussing my website project
 * and would like to continue the conversation." This never exposes the
 * operator's number automatically anywhere it shouldn't be — see
 * docs/ADR.md Round 8 section on where this link is actually surfaced
 * (an authenticated handoff-package response, not anything public).
 */

export interface WhatsAppLinkInput {
  /** E.164 phone number, e.g. "+923001234567" — validated by
   *  SETTINGS_SCHEMAS.WHATSAPP_BUSINESS_NUMBER before it ever reaches here. */
  phoneNumber: string;
  operatorName: string;
  /** A short label for what the project is about, e.g. "website
   *  project", "Shopify store" — used to build the contextual message. */
  projectLabel: string;
}

export function buildWhatsAppContextMessage(input: WhatsAppLinkInput): string {
  return `Hi ${input.operatorName}, I was discussing my ${input.projectLabel} and would like to continue the conversation.`;
}

/** wa.me requires digits only (no leading +, spaces, or punctuation) in
 *  the path, per WhatsApp's own link format documentation. */
function toWhatsAppDigits(phoneNumber: string): string {
  return phoneNumber.replace(/\D/g, "");
}

export function buildWhatsAppHandoffLink(input: WhatsAppLinkInput): string {
  const digits = toWhatsAppDigits(input.phoneNumber);
  const message = buildWhatsAppContextMessage(input);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
