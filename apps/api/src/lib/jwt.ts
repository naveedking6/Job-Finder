import jwt from "jsonwebtoken";

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Refusing to sign/verify tokens with no secret configured.",
    );
  }
  return secret;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  const expiresIn = process.env.JWT_EXPIRES_IN ?? "7d";
  return jwt.sign(payload, getJwtSecret(), { expiresIn } as jwt.SignOptions);
}

export class InvalidTokenError extends Error {
  constructor(message = "Invalid or expired token") {
    super(message);
    this.name = "InvalidTokenError";
  }
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  // Fetch the secret OUTSIDE the try block — a missing JWT_SECRET is a
  // configuration error and should fail loudly as such, not be
  // misreported as "invalid token" (which would send someone debugging
  // the wrong problem).
  const secret = getJwtSecret();
  try {
    const decoded = jwt.verify(token, secret);
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      "userId" in decoded &&
      "email" in decoded &&
      "role" in decoded
    ) {
      return decoded as unknown as AuthTokenPayload;
    }
    throw new InvalidTokenError("Token payload missing required fields");
  } catch (err) {
    if (err instanceof InvalidTokenError) throw err;
    throw new InvalidTokenError();
  }
}
