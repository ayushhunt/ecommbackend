/*
  Warnings:

  - Added the required column `type` to the `Verification` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Verification" ADD COLUMN     "type" TEXT NOT NULL;
