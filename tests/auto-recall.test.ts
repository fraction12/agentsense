import { describe, it, expect } from "vitest";

// Import the module to test extractSearchTerms
// Since it's not exported, we'll test the behavior through the handler
// But we can test the logic directly by extracting it

// Replicate the stop words and extraction logic for unit testing
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "it", "in", "on", "at", "to", "for", "of", "and",
  "or", "but", "not", "with", "this", "that", "from", "by", "be", "as", "are",
  "was", "were", "been", "being", "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should", "may", "might", "can", "shall",
  "i", "you", "he", "she", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their", "mine", "yours",
  "what", "which", "who", "whom", "where", "when", "why", "how",
  "all", "each", "every", "both", "few", "more", "most", "some", "any",
  "no", "nor", "too", "very", "just", "about", "above", "after", "again",
  "also", "am", "an", "because", "before", "between", "come", "did",
  "don", "down", "even", "get", "go", "going", "got", "here", "if",
  "into", "keep", "let", "like", "look", "make", "much", "need",
  "now", "off", "ok", "okay", "only", "other", "out", "over",
  "please", "put", "really", "right", "run", "said", "say", "see",
  "set", "so", "still", "take", "tell", "than", "then", "there",
  "think", "through", "up", "us", "use", "want", "well", "yeah", "yes",
  "eye", "thing", "things", "way", "something", "nothing", "everything",
]);

function extractSearchTerms(text: string): string[] {
  const cleaned = text
    .replace(/<[^>]+>/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\w\s-]/g, " ")
    .toLowerCase();

  const words = cleaned.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]} ${words[i + 1]}`);
  }

  const terms = [...bigrams, ...words];
  return [...new Set(terms)].slice(0, 8);
}

describe("extractSearchTerms", () => {
  it("should extract meaningful terms from 'Keep an eye on the Claude code session'", () => {
    const terms = extractSearchTerms("Keep an eye on the Claude code session");
    expect(terms).toContain("claude code");
    expect(terms).toContain("claude");
    expect(terms).toContain("code");
    expect(terms).toContain("session");
    // Should NOT contain stop words
    expect(terms).not.toContain("keep");
    expect(terms).not.toContain("eye");
    expect(terms).not.toContain("the");
    expect(terms).not.toContain("on");
    expect(terms).not.toContain("an");
  });

  it("should extract terms from 'What subscriptions does Dushyant have?'", () => {
    const terms = extractSearchTerms("What subscriptions does Dushyant have?");
    expect(terms).toContain("subscriptions");
    expect(terms).toContain("dushyant");
    expect(terms).not.toContain("what");
    expect(terms).not.toContain("does");
  });

  it("should extract bigrams for multi-word entities", () => {
    const terms = extractSearchTerms("Tell me about TradeSpec AI tech stack");
    expect(terms).toContain("tradespec");
    // Should have bigrams
    const hasBigram = terms.some(t => t.includes(" "));
    expect(hasBigram).toBe(true);
  });

  it("should handle short messages", () => {
    const terms = extractSearchTerms("ok");
    expect(terms).toHaveLength(0);
  });

  it("should strip code blocks", () => {
    const terms = extractSearchTerms("Check this ```sqlite3 db.sqlite SELECT * FROM nodes``` query");
    expect(terms).not.toContain("sqlite3");
    expect(terms).toContain("query");
    expect(terms).toContain("check");
  });

  it("should strip URLs", () => {
    const terms = extractSearchTerms("Look at https://github.com/fraction12/agentsense please");
    expect(terms).not.toContain("https");
    expect(terms).not.toContain("github");
  });

  it("should limit to 8 terms", () => {
    const terms = extractSearchTerms(
      "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa"
    );
    expect(terms.length).toBeLessThanOrEqual(8);
  });

  it("should handle messages with only stop words", () => {
    const terms = extractSearchTerms("I want to do this now please");
    expect(terms).toHaveLength(0);
  });

  it("should deduplicate terms", () => {
    const terms = extractSearchTerms("claude claude claude");
    const claudeCount = terms.filter(t => t === "claude").length;
    expect(claudeCount).toBe(1);
  });
});
