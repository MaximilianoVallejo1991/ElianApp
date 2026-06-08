-- AlterTable
ALTER TABLE "Group" ADD COLUMN "inviteToken" TEXT,
ADD COLUMN "inviteExpires" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Group_inviteToken_key" ON "Group"("inviteToken");
