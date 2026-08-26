import { DEFAULT_SETTINGS, isKnownSettingKey, SETTING_KEYS, validateSettingValue } from "@ai-sales-agent/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Setting } from "@ai-sales-agent/database";
import { toJsonSafe } from "../lib/json-safe.js";

const settingsUpdateSchema = z.record(z.string(), z.unknown());

export default async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/settings", { preHandler: [app.authenticate] }, async () => {
    const stored = await app.prisma.setting.findMany();
    const storedMap = new Map(stored.map((s: Setting) => [s.key, s.value]));

    // Merge stored values over defaults — any setting never explicitly
    // written still returns its safe default rather than null/undefined.
    const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const key of SETTING_KEYS) {
      if (storedMap.has(key)) {
        merged[key] = storedMap.get(key);
      }
    }

    return { success: true, data: merged };
  });

  app.put("/settings", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = settingsUpdateSchema.parse(request.body);

    const unknownKeys = Object.keys(body).filter((k) => !isKnownSettingKey(k));
    if (unknownKeys.length > 0) {
      return reply.status(400).send({
        success: false,
        error: {
          message: `Unknown setting key(s): ${unknownKeys.join(", ")}`,
          code: "VALIDATION_ERROR",
        },
      });
    }

    // Validate every value BEFORE writing any of them — a batch update
    // should be all-or-nothing, not leave settings half-applied because
    // the third key in the payload failed validation.
    const validated: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      validated[key] = validateSettingValue(key as never, value);
    }

    const updates = Object.entries(validated).map(([key, value]) =>
      app.prisma.setting.upsert({
        where: { key },
        create: { key, value: value as never },
        update: { value: value as never },
      }),
    );
    await app.prisma.$transaction([
      ...updates,
      app.prisma.activityLog.create({
        data: {
          actor: "HUMAN",
          action: "settings.updated",
          entityType: "Setting",
          details: { changes: toJsonSafe(validated) },
        },
      }),
    ]);

    return { success: true, data: validated };
  });
}
