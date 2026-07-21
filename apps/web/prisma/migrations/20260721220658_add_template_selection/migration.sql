-- CreateEnum
CREATE TYPE "Template" AS ENUM ('classic', 'editorial_bold', 'bold_highlight', 'minimal_card', 'photo_overlay');

-- AlterTable
ALTER TABLE "BrandKit" ADD COLUMN     "defaultTemplate" "Template" NOT NULL DEFAULT 'bold_highlight';

-- AlterTable
ALTER TABLE "ContentPiece" ADD COLUMN     "template" "Template";
