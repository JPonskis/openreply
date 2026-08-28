/**
 * Keyword Matcher
 *
 * Decides whether a comment (or DM) is someone ASKING for the link.
 *
 * Match modes, strictest first:
 *   "exact"      — the comment is the keyword and nothing else.
 *   "standalone" — the keyword plus only politeness/decoration ("BILL please",
 *                  "bill 🙏", "yes bill"). This is the default.
 *   "anywhere"   — the keyword appears as a whole word anywhere in the text,
 *                  including in the middle of a sentence.
 *   "contains"   — plain substring; "linking" matches "link".
 *
 * Why "standalone" is the default: "anywhere" cannot tell a request from a
 * mention. Trigger words like BILL, PLAN, FOOD and COVERAGE are ordinary
 * English, so "anywhere" fires on people who are arguing, correcting us, or
 * describing their situation — e.g. a comment reading "no gas for car no food
 * nothing at all" is a person in crisis, not a request for the SNAP
 * calculator. Firing there sends an unwanted DM AND posts a public reply under
 * their comment, which reads as spam to everyone else on the post.
 *
 * The asymmetry drives the default: a false negative costs one auto-DM that a
 * human can still send by hand, while a false positive is a public reply under
 * someone's grief. When in doubt, do not fire.
 *
 * Unicode note: the original implementation used ASCII `\w` and `\b`, which
 * treat every Cyrillic / CJK / accented letter as a "special character" and a
 * non-word char. That silently deleted all non-Latin comment text before
 * matching, so a Russian keyword like "Клод" could never match. Everything
 * here uses Unicode property escapes (`\p{L}` letters, `\p{N}` numbers) with the
 * `u` flag so non-Latin scripts work.
 */

export interface KeywordMatchResult {
  matched: boolean;
  matchedKeyword: string | null;
}

export type MatchMode = "exact" | "standalone" | "anywhere" | "contains";

export const MATCH_MODES: MatchMode[] = [
  "exact",
  "standalone",
  "anywhere",
  "contains",
];

export const DEFAULT_MATCH_MODE: MatchMode = "standalone";

export function isMatchMode(value: string): value is MatchMode {
  return (MATCH_MODES as string[]).includes(value);
}

/**
 * Politeness phrases collapsed before tokenizing, so that the words inside
 * them never have to be trusted on their own. "thank you" is filler; a bare
 * "you" is not, because "you qualify" is a sentence, not a request.
 */
const FILLER_PHRASES: RegExp[] = [
  /\bthank (?:you|u)(?: (?:so|very) much)?\b/g,
  /\bthanks (?:so|very) much\b/g,
  /\bma am\b/g, // "ma'am" after punctuation stripping
];

/**
 * Words allowed to sit beside the keyword in "standalone" mode.
 *
 * Deliberately tiny and closed: politeness, greeting, and agreement only. It
 * holds no word that carries a request of its own ("need", "want", "help",
 * "my", "for"), because those are what turn a token into a sentence — "I need
 * food for my kids" must not fire FOOD. Every word added here widens what
 * counts as a request, so add one only with a real comment that justifies it.
 */
const FILLER_WORDS = new Set([
  "please",
  "pls",
  "plz",
  "plss",
  "plese",
  "thanks",
  "thank",
  "thankyou",
  "thanx",
  "thx",
  "ty",
  "tyvm",
  "yes",
  "yess",
  "yep",
  "yup",
  "yeah",
  "yea",
  "ya",
  "ok",
  "okay",
  "okk",
  "sure",
  "hi",
  "hii",
  "hey",
  "hello",
  "sir",
  "maam",
]);

/**
 * Strip emojis and special characters from text, keeping only
 * letters (any script), numbers, and whitespace.
 */
export function stripSpecialCharacters(text: string): string {
  return text
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu,
      ""
    )
    // Keep letters (any script) and numbers; turn everything else into a space.
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Coerce whatever the caller has into a mode.
 *
 * Accepts a bare `string` because `Automation.matchMode` is a text column and
 * can hold anything; an unrecognised value falls back to the default rather
 * than silently matching nothing or matching everything.
 */
export function toMatchMode(
  mode: MatchMode | boolean | string | null | undefined
): MatchMode {
  if (mode === true) return "anywhere";
  if (mode === false) return "contains";
  if (typeof mode === "string" && isMatchMode(mode)) return mode;
  return DEFAULT_MATCH_MODE;
}

/** A regex that finds `keyword` only when it is not glued to another letter/number. */
function wholeWordRegex(cleanedKeyword: string, flags: string): RegExp {
  const escaped = cleanedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Unicode-aware "whole word": the keyword must not be flanked by another
  // letter or number. Lookarounds replace ASCII `\b`, which never fires
  // between two non-Latin characters.
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    flags
  );
}

/**
 * Everything left over once every keyword this campaign watches is removed.
 *
 * All of the campaign's keywords are stripped, not just the one that matched,
 * so "FOOD BILL" on a campaign watching both still reads as a bare request.
 */
function residualTokens(cleanedText: string, cleanedKeywords: string[]): string[] {
  let rest = cleanedText;
  // Longest first, so a campaign watching both "bill" and "medical bill" does
  // not strip the short one and leave "medical" behind as a stray token.
  for (const k of [...cleanedKeywords].sort((a, b) => b.length - a.length)) {
    rest = rest.replace(wholeWordRegex(k, "giu"), " ");
  }
  for (const phrase of FILLER_PHRASES) {
    rest = rest.replace(phrase, " ");
  }
  return rest.split(/\s+/).filter(Boolean);
}

/**
 * Check if a comment text matches any of the given keywords.
 *
 * @param commentText - The raw comment text to check
 * @param keywords - Array of keywords to match against
 * @param mode - Match mode (see MatchMode). Accepts the legacy boolean:
 *               `true` => "anywhere", `false` => "contains".
 * @returns Match result with the first matched keyword (if any)
 */
export function matchKeywords(
  commentText: string,
  keywords: string[],
  mode: MatchMode | boolean | string | null | undefined = DEFAULT_MATCH_MODE
): KeywordMatchResult {
  const noMatch: KeywordMatchResult = { matched: false, matchedKeyword: null };

  if (!commentText || keywords.length === 0) return noMatch;

  const resolvedMode = toMatchMode(mode);
  const cleanedText = stripSpecialCharacters(commentText).toLowerCase();

  if (!cleanedText) return noMatch;

  const cleanedKeywords = keywords.map((k) =>
    stripSpecialCharacters(k).toLowerCase()
  );

  // Computed once, not per keyword: the leftovers are the same either way and
  // this keeps a campaign with many keywords from re-scanning the text N times.
  const residual =
    resolvedMode === "standalone"
      ? residualTokens(cleanedText, cleanedKeywords.filter(Boolean))
      : [];
  const residualIsFiller =
    resolvedMode === "standalone" &&
    residual.every((word) => FILLER_WORDS.has(word));

  for (let i = 0; i < keywords.length; i++) {
    const cleanedKeyword = cleanedKeywords[i];
    if (!cleanedKeyword) continue;

    const hit = (): KeywordMatchResult => ({
      matched: true,
      matchedKeyword: keywords[i],
    });

    switch (resolvedMode) {
      case "exact":
        if (cleanedText === cleanedKeyword) return hit();
        break;

      case "standalone":
        // The keyword must be present AND be the entire point of the comment.
        if (
          residualIsFiller &&
          wholeWordRegex(cleanedKeyword, "iu").test(cleanedText)
        ) {
          return hit();
        }
        break;

      case "anywhere":
        if (wholeWordRegex(cleanedKeyword, "iu").test(cleanedText)) return hit();
        break;

      case "contains":
        if (cleanedText.includes(cleanedKeyword)) return hit();
        break;
    }
  }

  return noMatch;
}
