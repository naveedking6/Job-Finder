import type { FastifyInstance } from "fastify";

export default async function serviceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/services", async () => {
    const services = await app.prisma.service.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    return { success: true, data: services };
  });
}
