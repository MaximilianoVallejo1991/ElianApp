-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'MISMATCH', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CollectiveExpenseStatus" AS ENUM ('PENDING', 'MATCH', 'MISMATCH', 'COMPLETED');

-- AlterEnum
ALTER TYPE "ExpenseSplitType" ADD VALUE 'COLLECTIVE';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "participantIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sharedCosts" DECIMAL(65,30) DEFAULT 0,
ADD COLUMN     "status" "ExpenseStatus" NOT NULL DEFAULT 'COMPLETED';

-- CreateTable
CREATE TABLE "ExpenseItem" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "description" TEXT DEFAULT 'mi gasto',
    "dateReported" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectiveExpense" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "description" TEXT,
    "total" DECIMAL(65,30) NOT NULL,
    "sharedCosts" DECIMAL(65,30) NOT NULL,
    "status" "CollectiveExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "participantIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectiveExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualItem" (
    "id" TEXT NOT NULL,
    "collectiveExpenseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndividualItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseItem_expenseId_idx" ON "ExpenseItem"("expenseId");

-- CreateIndex
CREATE INDEX "ExpenseItem_userId_idx" ON "ExpenseItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseItem_expenseId_userId_key" ON "ExpenseItem"("expenseId", "userId");

-- CreateIndex
CREATE INDEX "CollectiveExpense_groupId_idx" ON "CollectiveExpense"("groupId");

-- CreateIndex
CREATE INDEX "CollectiveExpense_creatorId_idx" ON "CollectiveExpense"("creatorId");

-- CreateIndex
CREATE INDEX "IndividualItem_collectiveExpenseId_idx" ON "IndividualItem"("collectiveExpenseId");

-- CreateIndex
CREATE INDEX "IndividualItem_userId_idx" ON "IndividualItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "IndividualItem_collectiveExpenseId_userId_key" ON "IndividualItem"("collectiveExpenseId", "userId");

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectiveExpense" ADD CONSTRAINT "CollectiveExpense_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectiveExpense" ADD CONSTRAINT "CollectiveExpense_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualItem" ADD CONSTRAINT "IndividualItem_collectiveExpenseId_fkey" FOREIGN KEY ("collectiveExpenseId") REFERENCES "CollectiveExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualItem" ADD CONSTRAINT "IndividualItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
