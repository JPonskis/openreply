/**
 * Read-only proof that the deployed schema and the reconciler's query shape
 * agree, and that every live campaign is on a strict match mode.
 *
 *   DATABASE_URL=... npx tsx scripts/verify-match-mode.ts
 *
 * Runs the EXACT select the Facebook reconciler runs. If the column were
 * missing or misnamed this throws, which is the point: a sweep that cannot
 * read its own campaigns logs a warning nobody reads and reports nothing.
 */
import { prisma } from "../lib/db/client";
import { matchKeywords, toMatchMode } from "../lib/utils/keyword-matcher";

async function main() {
  const campaigns = await prisma.automation.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      keywords: true,
      matchAnyWord: true,
      matchMode: true,
      publicReplyEnabled: true,
    },
  });

  console.log(`${campaigns.length} active campaigns\n`);

  let loose = 0;
  for (const c of campaigns) {
    const mode = toMatchMode(c.matchMode);
    if (mode !== "standalone" && mode !== "exact") loose++;
    const kw = c.keywords[0] ?? "";
    // Prove the behaviour rather than just printing the setting.
    const bare = kw ? matchKeywords(kw, c.keywords, c.matchMode).matched : null;
    const inSentence = kw
      ? matchKeywords(
          `honestly my ${kw.toLowerCase()} situation is a mess right now`,
          c.keywords,
          c.matchMode
        ).matched
      : null;
    console.log(
      `${mode.padEnd(11)} | ${String(c.name).padEnd(22)} | ` +
        `bare "${kw}" -> ${bare} | in a sentence -> ${inSentence}`
    );
  }

  console.log(`\nloose-mode campaigns: ${loose}`);
  if (loose > 0) {
    console.error("FAIL: a live campaign still fires mid-sentence");
    process.exit(1);
  }
  console.log("OK: every live campaign fires only on a standalone request");
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
