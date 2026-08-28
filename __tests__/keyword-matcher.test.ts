/**
 * Keyword Matcher — Unit Tests
 *
 * Tests all edge cases for keyword matching logic.
 */

import { describe, it, expect } from "vitest";
import {
  matchKeywords,
  stripSpecialCharacters,
} from "../lib/utils/keyword-matcher";

describe("stripSpecialCharacters", () => {
  it("should remove emojis", () => {
    expect(stripSpecialCharacters("Hello 🔥 World 💪")).toBe("Hello World");
  });

  it("should remove special characters but keep alphanumeric", () => {
    expect(stripSpecialCharacters("price!!??")).toBe("price");
  });

  it("should collapse multiple spaces into one", () => {
    expect(stripSpecialCharacters("hello   world")).toBe("hello world");
  });

  it("should handle empty strings", () => {
    expect(stripSpecialCharacters("")).toBe("");
  });

  it("should handle strings with only emojis", () => {
    expect(stripSpecialCharacters("🔥💪😊")).toBe("");
  });

  it("should preserve numbers", () => {
    expect(stripSpecialCharacters("price123")).toBe("price123");
  });

  it("should preserve non-Latin letters (Cyrillic)", () => {
    expect(stripSpecialCharacters("Клод")).toBe("Клод");
  });

  it("should preserve non-Latin letters within punctuation", () => {
    expect(stripSpecialCharacters("Клод!!")).toBe("Клод");
  });

  it("should preserve other scripts (Greek, CJK)", () => {
    expect(stripSpecialCharacters("λόγος")).toBe("λόγος");
    expect(stripSpecialCharacters("链接")).toBe("链接");
  });
});

describe("matchKeywords — whole word matching", () => {
  it("should match exact keyword (case-insensitive)", () => {
    const result = matchKeywords("I want the LINK", ["link"], true);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("link");
  });

  it("should match keyword regardless of case", () => {
    expect(matchKeywords("give me the Link please", ["LINK"], true).matched).toBe(true);
    expect(matchKeywords("LINK", ["link"], true).matched).toBe(true);
    expect(matchKeywords("liNk", ["LINK"], true).matched).toBe(true);
  });

  it("should NOT match partial words in whole-word mode", () => {
    const result = matchKeywords("I am linking to you", ["link"], true);
    expect(result.matched).toBe(false);
  });

  it("should match when keyword is at the start", () => {
    const result = matchKeywords("LINK please", ["link"], true);
    expect(result.matched).toBe(true);
  });

  it("should match when keyword is at the end", () => {
    const result = matchKeywords("send me the link", ["link"], true);
    expect(result.matched).toBe(true);
  });

  it("should match first keyword in multi-keyword list (OR logic)", () => {
    const result = matchKeywords("I want the price", ["link", "price", "info"], true);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("price");
  });

  it("should return first matching keyword", () => {
    const result = matchKeywords("link and price", ["link", "price"], true);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("link");
  });

  it("should not match if no keywords match", () => {
    const result = matchKeywords("hello world", ["link", "price"], true);
    expect(result.matched).toBe(false);
    expect(result.matchedKeyword).toBeNull();
  });
});

describe("matchKeywords — non-Latin scripts", () => {
  it("should match a Cyrillic keyword in whole-word mode", () => {
    const result = matchKeywords("Клод", ["Клод"], true);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("Клод");
  });

  it("should match a Cyrillic keyword inside a sentence", () => {
    expect(matchKeywords("хочу Клод плиз", ["Клод"], true).matched).toBe(true);
  });

  it("should match a Cyrillic keyword surrounded by punctuation/emoji", () => {
    expect(matchKeywords("🔥 Клод! 🔥", ["Клод"], true).matched).toBe(true);
  });

  it("should be case-insensitive for Cyrillic", () => {
    expect(matchKeywords("клод", ["КЛОД"], true).matched).toBe(true);
  });

  it("should NOT match a different Cyrillic word in whole-word mode", () => {
    // "Клодом" is a different word; whole-word must not fire on the stem.
    expect(matchKeywords("Клодом", ["Клод"], true).matched).toBe(false);
  });

  it("should match a Cyrillic stem in partial mode", () => {
    expect(matchKeywords("Клодом", ["Клод"], false).matched).toBe(true);
  });

  it("should match other scripts (CJK)", () => {
    expect(matchKeywords("发我链接", ["链接"], false).matched).toBe(true);
  });
});

describe("matchKeywords — partial matching", () => {
  it("should match partial words in partial mode", () => {
    const result = matchKeywords("I am linking to you", ["link"], false);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("link");
  });

  it("should match substring anywhere in text", () => {
    const result = matchKeywords("unbreakable bond", ["break"], false);
    expect(result.matched).toBe(true);
  });

  it("should be case-insensitive in partial mode", () => {
    const result = matchKeywords("LINKING", ["link"], false);
    expect(result.matched).toBe(true);
  });
});

describe("matchKeywords — edge cases", () => {
  it("should return false for empty comment text", () => {
    const result = matchKeywords("", ["link"], true);
    expect(result.matched).toBe(false);
  });

  it("should return false for empty keywords array", () => {
    const result = matchKeywords("give me the link", [], true);
    expect(result.matched).toBe(false);
  });

  it("should handle comments with only emojis", () => {
    const result = matchKeywords("🔥🔥🔥", ["link"], true);
    expect(result.matched).toBe(false);
  });

  it("should match keyword even with surrounding emojis", () => {
    const result = matchKeywords("🔥 LINK 🔥", ["link"], true);
    expect(result.matched).toBe(true);
  });

  it("should handle keywords with special characters", () => {
    const result = matchKeywords("send info", ["info!"], true);
    expect(result.matched).toBe(true);
  });

  it("should handle multi-word keywords", () => {
    const result = matchKeywords("I want more info please", ["more info"], true);
    expect(result.matched).toBe(true);
  });
});

/**
 * Standalone mode — the default, and the fix for the spam incident of
 * 2026-08-28. Every "must not fire" case below is a REAL comment pulled from
 * the production Facebook Pages; three of them were actually DM'd under the
 * old "whole word anywhere" rule.
 */

// Verbatim production comments. Do not tidy the typos — they are the point.
const REAL_REQUESTS = ["Bill", "BILL", "bill", "Qualify", "PREMIUM", "Premium"];

const REAL_NOT_REQUESTS: [string, string[]][] = [
  ["Iv been denied", ["DENIED"]],
  [
    "If you make more than $1100 on SSDI, you do not qualify for SSI. Be careful what you're telling people.",
    ["QUALIFY"],
  ],
  [
    "Nick Varano she's not giving out the wrong information she's correct I'm on both but if you are making $1,100 and you are making the amount that you don't qualify for the SSI that's why she's saying if you qualify to check not everyone is going to qualify no you won't qualify $1,100 is the max",
    ["QUALIFY"],
  ],
  [
    "I have nothing my husband passed July 25th at 69 years old they took his SS and can't get an appointment with SS till Sept 22, so I am overdrawn in both accounts, no gas for car no food nothing at all.",
    ["FOOD"],
  ],
  [
    "I live in Henderson Ky and all my Drs are associated with Deaconess Hospital in Evansville In. I'm on thier financial assistance. You need a bank statement for the previous month and fill out the application for it.",
    ["PLAN", "BILL", "COVERAGE"],
  ],
];

describe("matchKeywords — standalone mode (default)", () => {
  it("fires on every bare trigger word seen in production", () => {
    for (const text of REAL_REQUESTS) {
      expect(matchKeywords(text, [text.toUpperCase()]).matched, text).toBe(true);
    }
  });

  it("does NOT fire on real comments that only used the word in a sentence", () => {
    for (const [text, keywords] of REAL_NOT_REQUESTS) {
      expect(matchKeywords(text, keywords).matched, text).toBe(false);
    }
  });

  it("allows punctuation, emoji and politeness around the keyword", () => {
    const shouldFire = [
      "BILL",
      "bill!!!",
      "Bill?",
      "  Bill  ",
      "bill 🙏",
      "🔥 BILL 🔥",
      "Bill please",
      "BILL PLEASE",
      "bill pls",
      "yes bill",
      "ok bill",
      "hey bill",
      "bill thank you",
      "bill thanks so much",
      "Bill, thank you!",
      "bill bill",
      "bill 🙏🙏 please thanks",
    ];
    for (const text of shouldFire) {
      expect(matchKeywords(text, ["BILL"]).matched, text).toBe(true);
    }
  });

  it("does NOT fire when the keyword is a word inside a sentence", () => {
    const shouldNotFire: [string, string][] = [
      ["my medical bill is huge", "BILL"],
      ["I need help with my bill", "BILL"],
      ["can someone help me pay this bill", "BILL"],
      ["the bill came yesterday", "BILL"],
      ["what plan should I get", "PLAN"],
      ["I'm on a Medicare plan", "PLAN"],
      ["I need food for my kids", "FOOD"],
      ["does my coverage include this", "COVERAGE"],
      ["they denied me twice", "DENIED"],
      ["you qualify", "QUALIFY"],
      ["do you qualify", "QUALIFY"],
      ["how do I enroll in this", "ENROLL"],
      ["my premium went up again", "PREMIUM"],
    ];
    for (const [text, keyword] of shouldNotFire) {
      expect(matchKeywords(text, [keyword]).matched, text).toBe(false);
    }
  });

  it("reports which keyword matched", () => {
    expect(matchKeywords("bill please", ["FOOD", "BILL"]).matchedKeyword).toBe(
      "BILL"
    );
  });

  it("treats the campaign's own other keywords as part of the request", () => {
    // Someone asking for two of this campaign's tools at once is still asking.
    expect(matchKeywords("FOOD BILL", ["FOOD", "BILL"]).matched).toBe(true);
  });

  it("does not leave a stray token when one keyword contains another", () => {
    expect(matchKeywords("medical bill", ["BILL", "MEDICAL BILL"]).matched).toBe(
      true
    );
  });

  it("works for non-Latin scripts", () => {
    expect(matchKeywords("Клод", ["Клод"]).matched).toBe(true);
    expect(matchKeywords("хочу Клод плиз", ["Клод"]).matched).toBe(false);
  });

  it("is the mode used when nothing is passed", () => {
    expect(matchKeywords("my bill is huge", ["BILL"]).matched).toBe(false);
  });
});

describe("matchKeywords — mode selection", () => {
  it("exact accepts only the bare keyword", () => {
    expect(matchKeywords("BILL", ["bill"], "exact").matched).toBe(true);
    expect(matchKeywords("bill!!", ["bill"], "exact").matched).toBe(true);
    expect(matchKeywords("bill please", ["bill"], "exact").matched).toBe(false);
  });

  it("anywhere restores the old whole-word-in-a-sentence behaviour", () => {
    expect(matchKeywords("my bill is huge", ["bill"], "anywhere").matched).toBe(
      true
    );
    expect(matchKeywords("billing dept", ["bill"], "anywhere").matched).toBe(
      false
    );
  });

  it("contains matches substrings", () => {
    expect(matchKeywords("billing dept", ["bill"], "contains").matched).toBe(
      true
    );
  });

  it("maps the legacy boolean so old callers keep their behaviour", () => {
    expect(matchKeywords("my bill is huge", ["bill"], true).matched).toBe(true);
    expect(matchKeywords("billing", ["bill"], false).matched).toBe(true);
  });

  it("falls back to standalone for null, undefined or a junk mode string", () => {
    for (const mode of [null, undefined, "", "nonsense", "STANDALONE"]) {
      expect(matchKeywords("my bill is huge", ["bill"], mode).matched, `${mode}`).toBe(false);
      expect(matchKeywords("bill", ["bill"], mode).matched, `${mode}`).toBe(true);
    }
  });
});
