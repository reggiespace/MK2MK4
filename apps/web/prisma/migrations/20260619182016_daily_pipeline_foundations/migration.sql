-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('running', 'complete', 'failed');

-- AlterEnum
ALTER TYPE "PieceStatus" ADD VALUE 'blocked';

-- AlterTable
ALTER TABLE "ContentPiece" ADD COLUMN     "claims" JSONB,
ADD COLUMN     "firstComment" TEXT,
ADD COLUMN     "runId" TEXT;

-- AlterTable
ALTER TABLE "Idea" ADD COLUMN     "storyBrief" JSONB;

-- CreateTable
CREATE TABLE "ContentRun" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "runDate" DATE NOT NULL,
    "pillar" TEXT NOT NULL,
    "format" "Format" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'running',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cadence" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "pillar" TEXT NOT NULL,
    "format" "Format" NOT NULL,
    "networks" TEXT[],

    CONSTRAINT "Cadence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentRun_brandId_runDate_pillar_key" ON "ContentRun"("brandId", "runDate", "pillar");

-- CreateIndex
CREATE UNIQUE INDEX "Cadence_brandId_weekday_key" ON "Cadence"("brandId", "weekday");

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ContentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRun" ADD CONSTRAINT "ContentRun_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cadence" ADD CONSTRAINT "Cadence_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
