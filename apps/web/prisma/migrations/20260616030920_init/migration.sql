-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('en', 'pt_BR');

-- CreateEnum
CREATE TYPE "Publisher" AS ENUM ('buffer', 'zernio');

-- CreateEnum
CREATE TYPE "Format" AS ENUM ('single', 'carousel', 'reel');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('suggested', 'selected', 'used', 'dismissed');

-- CreateEnum
CREATE TYPE "Skin" AS ENUM ('light', 'dark', 'mark_forward');

-- CreateEnum
CREATE TYPE "PieceStatus" AS ENUM ('draft', 'rendering', 'review', 'scheduled', 'published', 'failed');

-- CreateEnum
CREATE TYPE "SlideRole" AS ENUM ('cover', 'body', 'cta');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('image', 'video', 'audio');

-- CreateEnum
CREATE TYPE "Engine" AS ENUM ('template', 'fal', 'elevenlabs');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('image', 'carousel', 'reel');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('pending', 'scheduled', 'published', 'failed');

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "publisher" "Publisher" NOT NULL,
    "channels" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandKit" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "logoPath" TEXT NOT NULL,
    "tokens" JSONB NOT NULL,
    "fonts" JSONB NOT NULL,
    "defaultSkin" "Skin" NOT NULL DEFAULT 'mark_forward',
    "toneGuide" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,

    CONSTRAINT "BrandKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pillar" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Pillar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "pillarId" TEXT,
    "title" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "recommendedFormat" "Format" NOT NULL,
    "insightsContext" TEXT,
    "status" "IdeaStatus" NOT NULL DEFAULT 'suggested',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPiece" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "ideaId" TEXT,
    "format" "Format" NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PieceStatus" NOT NULL DEFAULT 'draft',
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "formatRationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Slide" (
    "id" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "role" "SlideRole" NOT NULL,
    "skin" "Skin" NOT NULL,
    "eyebrow" TEXT,
    "headline" TEXT,
    "body" TEXT,
    "mediaAssetId" TEXT,

    CONSTRAINT "Slide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "url" TEXT NOT NULL,
    "engine" "Engine" NOT NULL,
    "prompt" TEXT,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenderJob" (
    "id" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "kind" "JobKind" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "workerJobId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledPost" (
    "id" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "provider" "Publisher" NOT NULL,
    "providerPostId" TEXT,
    "status" "PostStatus" NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Operator_email_key" ON "Operator"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_key_key" ON "Brand"("key");

-- CreateIndex
CREATE UNIQUE INDEX "BrandKit_brandId_key" ON "BrandKit"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Pillar_brandId_name_key" ON "Pillar"("brandId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Slide_pieceId_index_key" ON "Slide"("pieceId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledPost_idempotencyKey_key" ON "ScheduledPost"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pillar" ADD CONSTRAINT "Pillar_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "Pillar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slide" ADD CONSTRAINT "Slide_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slide" ADD CONSTRAINT "Slide_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;
