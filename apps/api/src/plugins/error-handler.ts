import { Prisma } from "@ai-sales-agent/database";
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} with id "${id}" was not found`);
    this.name = "NotFoundError";
  }
}

function sendError(
  reply: FastifyReply,
  statusCode: number,
  message: string,
  code: string,
  details?: unknown,
): void {
  reply.status(statusCode).send({
    success: false,
    error: { message, code, details },
  });
}

async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error, _request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      sendError(reply, 400, "Request validation failed", "VALIDATION_ERROR", error.flatten());
      return;
    }

    if (error instanceof NotFoundError) {
      sendError(reply, 404, error.message, "NOT_FOUND");
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        sendError(reply, 404, "The requested resource was not found", "NOT_FOUND");
        return;
      }
      if (error.code === "P2002") {
        sendError(
          reply,
          409,
          "A record with this value already exists",
          "CONFLICT",
          error.meta,
        );
        return;
      }
      // Other known Prisma errors: don't leak internal details, but do
      // log server-side for debugging.
      app.log.error({ err: error }, "Unhandled Prisma error");
      sendError(reply, 500, "Database error", "INTERNAL_ERROR");
      return;
    }

    // Fastify's own schema-validation errors carry a statusCode already.
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    if (statusCode < 500) {
      sendError(reply, statusCode, error.message, "BAD_REQUEST");
      return;
    }

    app.log.error({ err: error }, "Unhandled error");
    sendError(reply, 500, "Internal server error", "INTERNAL_ERROR");
  });

  app.setNotFoundHandler((_request, reply) => {
    sendError(reply, 404, "Route not found", "NOT_FOUND");
  });
}

export default fp(errorHandlerPlugin, { name: "error-handler" });
