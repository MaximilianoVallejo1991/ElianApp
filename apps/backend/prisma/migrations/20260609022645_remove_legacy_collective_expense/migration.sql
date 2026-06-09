/*
  Warnings:

  - You are about to drop the `CollectiveExpense` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IndividualItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CollectiveExpense" DROP CONSTRAINT "CollectiveExpense_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "CollectiveExpense" DROP CONSTRAINT "CollectiveExpense_groupId_fkey";

-- DropForeignKey
ALTER TABLE "IndividualItem" DROP CONSTRAINT "IndividualItem_collectiveExpenseId_fkey";

-- DropForeignKey
ALTER TABLE "IndividualItem" DROP CONSTRAINT "IndividualItem_userId_fkey";

-- DropTable
DROP TABLE "CollectiveExpense";

-- DropTable
DROP TABLE "IndividualItem";

-- DropEnum
DROP TYPE "CollectiveExpenseStatus";
