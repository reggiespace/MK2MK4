-- CreateEnum
CREATE TYPE "ArtDirection" AS ENUM ('warm_lifestyle', 'editorial_illustration', 'cinematic');

-- AlterTable
ALTER TABLE "BrandKit" ADD COLUMN     "artDirection" "ArtDirection" NOT NULL DEFAULT 'warm_lifestyle';

-- AlterTable
ALTER TABLE "ContentPiece" ADD COLUMN     "motion" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Slide" ADD COLUMN     "imagePrompt" TEXT;
