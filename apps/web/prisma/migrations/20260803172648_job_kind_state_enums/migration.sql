/*
  Warnings:

  - The `state` column on the `Job` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `kind` on the `Job` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "AgentJobKind" AS ENUM ('media', 'render');

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "kind",
ADD COLUMN     "kind" "AgentJobKind" NOT NULL,
DROP COLUMN "state",
ADD COLUMN     "state" "JobStatus" NOT NULL DEFAULT 'queued';

-- CreateIndex
CREATE INDEX "Job_postId_kind_idx" ON "Job"("postId", "kind");
