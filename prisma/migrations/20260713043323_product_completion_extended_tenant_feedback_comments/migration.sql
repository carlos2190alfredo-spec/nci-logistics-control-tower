-- AlterEnum
ALTER TYPE "TenantPlanCode" ADD VALUE 'DEMO';

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_name" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'PA',
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "internal_notes" TEXT,
ADD COLUMN     "tax_id" TEXT;

-- CreateTable
CREATE TABLE "feedback_comments" (
    "id" UUID NOT NULL,
    "feedback_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_comments_feedback_id_created_at_idx" ON "feedback_comments"("feedback_id", "created_at");

-- AddForeignKey
ALTER TABLE "feedback_comments" ADD CONSTRAINT "feedback_comments_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "tenant_feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_comments" ADD CONSTRAINT "feedback_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
