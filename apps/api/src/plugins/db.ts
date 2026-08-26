import { prisma } from "@ai-sales-agent/database";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}

async function dbPlugin(app: FastifyInstance): Promise<void> {
  app.decorate("prisma", prisma);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
}

export default fp(dbPlugin, { name: "db" });
