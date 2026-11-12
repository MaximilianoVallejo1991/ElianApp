-- CreateIndex
CREATE UNIQUE INDEX "Period_groupId_key" ON "Period"("groupId") WHERE ("isCurrent" = true);
