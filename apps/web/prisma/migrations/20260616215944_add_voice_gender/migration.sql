-- CreateEnum
CREATE TYPE "VoiceGender" AS ENUM ('male', 'female');

-- AlterTable
ALTER TABLE "ContentPiece" ADD COLUMN     "voiceGender" "VoiceGender";
