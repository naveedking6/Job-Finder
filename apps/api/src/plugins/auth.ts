import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { InvalidTokenError, verifyAuthToken, type AuthTokenPayload } from "../lib/jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthTokenPayload;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Attach as a preHandler on any route that requires a logged-in user:
 *   app.get("/leads", { preHandler: [app.authenticate] }, handler)
 *
 * On success, populates request.user. On failure, sends a 401 and short-
 * circuits the request — the route handler never runs.
 */
async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      await reply.status(401).send({
        success: false,
        error: { message: "Missing or malformed Authorization header", code: "UNAUTHORIZED" },
      });
      return;
    }

    const token = authHeader.slice("Bearer ".length);
    try {
      request.user = verifyAuthToken(token);
    } catch (err) {
      const message = err instanceof InvalidTokenError ? err.message : "Authentication failed";
      await reply.status(401).send({
        success: false,
        error: { message, code: "UNAUTHORIZED" },
      });
    }
  });
}

export default fp(authPlugin, { name: "auth" });
