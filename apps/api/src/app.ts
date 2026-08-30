import Fastify, { type FastifyInstance } from "fastify";
import dbPlugin from "./plugins/db.js";
import authPlugin from "./plugins/auth.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import authRoutes from "./routes/auth.js";
import opportunityRoutes from "./routes/opportunities.js";
import leadRoutes from "./routes/leads.js";
import conversationRoutes from "./routes/conversations.js";
import portfolioRoutes from "./routes/portfolio.js";
import serviceRoutes from "./routes/services.js";
import platformRoutes from "./routes/platforms.js";
import policyRoutes from "./routes/policy.js";
import connectorRoutes from "./routes/connectors.js";
import intakeRoutes from "./routes/intake.js";
import analysisRoutes from "./routes/analysis.js";
import conversationMessageRoutes from "./routes/conversation-messages.js";
import settingsRoutes from "./routes/settings.js";
import automationRoutes from "./routes/automation.js";
import analyticsRoutes from "./routes/analytics.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  app.register(errorHandlerPlugin);
  app.register(dbPlugin);
  app.register(authPlugin);

  app.get("/health", async () => {
    return {
      status: "ok",
      service: "ai-sales-agent-api",
      timestamp: new Date().toISOString(),
    };
  });

  app.register(authRoutes);
  app.register(opportunityRoutes);
  app.register(leadRoutes);
  app.register(conversationRoutes);
  app.register(portfolioRoutes);
  app.register(serviceRoutes);
  app.register(platformRoutes);
  app.register(policyRoutes);
  app.register(connectorRoutes);
  app.register(intakeRoutes);
  app.register(analysisRoutes);
  app.register(conversationMessageRoutes);
  app.register(settingsRoutes);
  app.register(automationRoutes);
  app.register(analyticsRoutes);

  return app;
}
