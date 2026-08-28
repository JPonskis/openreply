/**
 * Replays a corpus of real comments through the REAL matcher (not a copy) and
 * prints what each match mode would do. Used to size the 2026-08-28 spam fix
 * against production text before shipping it.
 *
 *   npx tsx scripts/replay-corpus.ts <corpus.json> [...more.json]
 *
 * Corpus files are arrays of { text }.
 */
import { readFileSync } from "node:fs";
import { matchKeywords, type MatchMode } from "../lib/utils/keyword-matcher";

const KEYWORDS = [
  "QUALIFY", "BENEFITS", "DENIED", "ESTIMATE", "PREMIUM", "PARTB", "PLAN",
  "MEDBILL", "DAYCARE", "MEDICAID", "FOOD", "ENROLL", "COVERAGE", "BILL",
];

// Our own public replies come back from the Graph API alongside the audience's
// comments; the worker skips them by author id, so drop them here too.
const OURS =
  /^(sent|just sent|done|in your DMs|it's in your DMs|you've got mail|check your DMs|on its way|sent it your way|I got you|Here you go|Wendy Zinsmaster|Charlotte Ledbetter|Suzyq Sc)/i;

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: tsx scripts/replay-corpus.ts <corpus.json> ...");
  process.exit(1);
}

const comments: string[] = files
  .flatMap((f) => JSON.parse(readFileSync(f, "utf8")) as { text?: string }[])
  .map((c) => c.text ?? "")
  .filter((t) => t.trim() && !OURS.test(t));

const fire = (text: string, mode: MatchMode) =>
  KEYWORDS.filter((k) => matchKeywords(text, [k], mode).matched);

console.log(`${comments.length} real audience comments\n`);

for (const mode of ["anywhere", "standalone"] as MatchMode[]) {
  const hits = comments.filter((t) => fire(t, mode).length > 0);
  console.log(`--- ${mode}: fires on ${hits.length}/${comments.length} ---`);
}

console.log("\n--- comments where the two modes DISAGREE ---");
let disagreements = 0;
for (const text of comments) {
  const before = fire(text, "anywhere");
  const after = fire(text, "standalone");
  if (before.join() === after.join()) continue;
  disagreements++;
  console.log(
    `[${before.join(",") || "-"} -> ${after.join(",") || "-"}] ${JSON.stringify(
      text.slice(0, 150)
    )}`
  );
}
if (disagreements === 0) console.log("(none)");
