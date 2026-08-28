-- Adds Automation.matchMode.
--
-- Existing campaigns keep the behaviour they were created with EXCEPT that the
-- old default ("whole word anywhere in the comment") is deliberately narrowed
-- to "standalone": it fired on people merely using the word in a sentence,
-- which sent unwanted DMs and posted public replies under comments that were
-- never requests. Campaigns explicitly set to partial matching
-- (wholeWordMatch = false) keep substring behaviour.
ALTER TABLE "Automation"
  ADD COLUMN IF NOT EXISTS "matchMode" TEXT NOT NULL DEFAULT 'standalone';

UPDATE "Automation"
  SET "matchMode" = 'contains'
  WHERE "wholeWordMatch" = false;
