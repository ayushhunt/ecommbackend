/*
  Warnings:

  - You are about to drop the column `street` on the `Address` table. All the data in the column will be lost.
  - You are about to drop the column `zip` on the `Address` table. All the data in the column will be lost.
  - Added the required column `addressLine1` to the `Address` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('HOME', 'OFFICE', 'FRIEND', 'FAMILY', 'BUSINESS', 'OTHER');

-- AlterTable
ALTER TABLE "Address" DROP COLUMN "street",
DROP COLUMN "zip",
ADD COLUMN     "addressLine1" TEXT NOT NULL,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "addressType" "AddressType" NOT NULL DEFAULT 'HOME',
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'IN',
ADD COLUMN     "deliveryInstructions" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "landmark" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "postalCode" TEXT,
ALTER COLUMN "state" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE INDEX "Address_country_idx" ON "Address"("country");
