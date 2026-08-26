import { loginSchema } from "@ai-sales-agent/shared";
import type { FastifyInstance } from "fastify";
import { verifyPassword } from "../lib/password.js";
import { signAuthToken } from "../lib/jwt.js";

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const user = await app.prisma.user.findUnique({ where: { email: body.email } });

    // Deliberately identical error for "no such user" and "wrong password"
    // — don't leak which one it was to an unauthenticated caller.
    if (!user || !user.isActive) {
      return reply.status(401).send({
        success: false,
        error: { message: "Invalid email or password", code: "INVALID_CREDENTIALS" },
      });
    }

    const passwordMatches = await verifyPassword(body.password, user.passwordHash);
    if (!passwordMatches) {
      return reply.status(401).send({
        success: false,
        error: { message: "Invalid email or password", code: "INVALID_CREDENTIALS" },
      });
    }

    const token = signAuthToken({ userId: user.id, email: user.email, role: user.role });

    return reply.send({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
    });
  });
}
