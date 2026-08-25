-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "ConnectorType" AS ENUM ('API', 'RSS', 'WEBHOOK', 'MANUAL');

-- CreateEnum
CREATE TYPE "AutomationPermission" AS ENUM ('ALLOWED', 'DISCOVERY_ONLY', 'DISABLED');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('DISCOVERED', 'ANALYZED', 'DUPLICATE', 'IGNORED_LOW_RELEVANCE', 'IGNORED_POLICY', 'CONVERTED_TO_LEAD', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ConversationStage" AS ENUM ('DISCOVERED', 'ANALYZED', 'QUALIFIED_FOR_OUTREACH', 'OUTREACH_SENT', 'CLIENT_RESPONDED', 'REQUIREMENTS_GATHERING', 'SOLUTION_DISCUSSION', 'PORTFOLIO_SHARED', 'BUDGET_DISCUSSION', 'TIMELINE_DISCUSSION', 'QUALIFIED', 'HOT_LEAD', 'HUMAN_HANDOFF', 'CONVERTED', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'HUMAN_TAKEOVER', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageSender" AS ENUM ('CLIENT', 'AI', 'HUMAN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "KnowledgeBaseCategory" AS ENUM ('SERVICE', 'FAQ', 'POLICY', 'PRICING', 'PROCESS', 'COMMUNICATION');

-- CreateEnum
CREATE TYPE "AutomationRuleType" AS ENUM ('RATE_LIMIT', 'DAILY_LIMIT', 'COOLDOWN', 'WORKING_HOURS', 'DUPLICATE_CONTACT_BLOCK');

-- CreateEnum
CREATE TYPE "ActivityActor" AS ENUM ('SYSTEM', 'AI', 'HUMAN');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platforms" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "automationAllowed" BOOLEAN NOT NULL DEFAULT false,
    "discoveryAllowed" BOOLEAN NOT NULL DEFAULT false,
    "autoMessageAllowed" BOOLEAN NOT NULL DEFAULT false,
    "autoCommentAllowed" BOOLEAN NOT NULL DEFAULT false,
    "apiAvailable" BOOLEAN NOT NULL DEFAULT false,
    "complianceNotes" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_connectors" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ConnectorType" NOT NULL,
    "config" JSONB NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "sourcePlatformId" TEXT NOT NULL,
    "sourceConnectorId" TEXT,
    "sourceUrl" TEXT,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "country" TEXT,
    "language" TEXT,
    "authorName" TEXT,
    "authorMetadata" JSONB,
    "budgetMin" DECIMAL(12,2),
    "budgetMax" DECIMAL(12,2),
    "currency" TEXT,
    "projectType" TEXT,
    "skillsDetected" JSONB,
    "automationPermission" "AutomationPermission" NOT NULL DEFAULT 'DISABLED',
    "relevanceScore" INTEGER,
    "riskScore" INTEGER,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'DISCOVERED',
    "duplicateOfId" TEXT,
    "sourceCreatedAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "platformUsername" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "clientId" TEXT,
    "stage" "ConversationStage" NOT NULL DEFAULT 'DISCOVERED',
    "leadScore" INTEGER NOT NULL DEFAULT 0,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "projectSummary" TEXT,
    "requirements" JSONB,
    "budget" TEXT,
    "timeline" TEXT,
    "assignedServiceId" TEXT,
    "handoffAt" TIMESTAMP(3),
    "handoffReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3),
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_memory" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "clientName" TEXT,
    "business" TEXT,
    "requirements" JSONB,
    "featuresDiscussed" JSONB,
    "budgetDiscussed" TEXT,
    "timelineDiscussed" TEXT,
    "questionsAnswered" JSONB,
    "recommendedSolution" TEXT,
    "portfolioSharedIds" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "technologies" JSONB NOT NULL,
    "serviceCategory" TEXT,
    "industry" TEXT,
    "projectUrl" TEXT,
    "imageUrl" TEXT,
    "caseStudy" TEXT,
    "tags" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_base" (
    "id" TEXT NOT NULL,
    "category" "KnowledgeBaseCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_base_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT,
    "name" TEXT NOT NULL,
    "minBudget" DECIMAL(12,2),
    "maxBudget" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AutomationRuleType" NOT NULL,
    "platformId" TEXT,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_providers" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_scores" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reason" TEXT,
    "signals" JSONB,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "signals" JSONB,
    "notes" TEXT,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "actor" "ActivityActor" NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "platforms_key_key" ON "platforms"("key");

-- CreateIndex
CREATE INDEX "source_connectors_platformId_idx" ON "source_connectors"("platformId");

-- CreateIndex
CREATE INDEX "opportunities_status_idx" ON "opportunities"("status");

-- CreateIndex
CREATE INDEX "opportunities_relevanceScore_idx" ON "opportunities"("relevanceScore");

-- CreateIndex
CREATE INDEX "opportunities_discoveredAt_idx" ON "opportunities"("discoveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_sourcePlatformId_externalId_key" ON "opportunities"("sourcePlatformId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_opportunityId_key" ON "leads"("opportunityId");

-- CreateIndex
CREATE INDEX "leads_stage_idx" ON "leads"("stage");

-- CreateIndex
CREATE INDEX "leads_leadScore_idx" ON "leads"("leadScore");

-- CreateIndex
CREATE INDEX "conversations_leadId_idx" ON "conversations"("leadId");

-- CreateIndex
CREATE INDEX "conversations_status_idx" ON "conversations"("status");

-- CreateIndex
CREATE INDEX "messages_conversationId_idx" ON "messages"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_memory_conversationId_key" ON "conversation_memory"("conversationId");

-- CreateIndex
CREATE INDEX "portfolio_items_serviceCategory_idx" ON "portfolio_items"("serviceCategory");

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "services"("slug");

-- CreateIndex
CREATE INDEX "knowledge_base_category_idx" ON "knowledge_base"("category");

-- CreateIndex
CREATE UNIQUE INDEX "ai_providers_key_key" ON "ai_providers"("key");

-- CreateIndex
CREATE INDEX "lead_scores_leadId_idx" ON "lead_scores"("leadId");

-- CreateIndex
CREATE INDEX "risk_assessments_leadId_idx" ON "risk_assessments"("leadId");

-- CreateIndex
CREATE INDEX "activity_logs_entityType_entityId_idx" ON "activity_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- AddForeignKey
ALTER TABLE "source_connectors" ADD CONSTRAINT "source_connectors_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_sourcePlatformId_fkey" FOREIGN KEY ("sourcePlatformId") REFERENCES "platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_sourceConnectorId_fkey" FOREIGN KEY ("sourceConnectorId") REFERENCES "source_connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedServiceId_fkey" FOREIGN KEY ("assignedServiceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_memory" ADD CONSTRAINT "conversation_memory_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
