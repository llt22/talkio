import { describe, it, expect } from "vitest";
import { parseMentions, stripMentions, extractMentionedParticipantIds } from "../mention-parser";

function makeNames(entries: [string, string][]): Map<string, string> {
  return new Map(entries);
}

// ── parseMentions ──

describe("parseMentions", () => {
  it("returns empty array for text with no @ mentions", () => {
    const names = makeNames([["p1", "Alice"]]);
    expect(parseMentions("Hello world", names)).toEqual([]);
  });

  it("matches a single @ mention by display name", () => {
    const names = makeNames([["p1", "Alice"]]);
    const result = parseMentions("Hey @Alice, how are you?", names);
    expect(result).toEqual([
      { participantId: "p1", startIndex: 4, endIndex: 10, displayName: "Alice" },
    ]);
  });

  it("matches display name case-insensitively", () => {
    const names = makeNames([["p1", "Alice"]]);
    const result = parseMentions("Hey @alice, how are you?", names);
    expect(result).toHaveLength(1);
    expect(result[0].participantId).toBe("p1");
  });

  it("matches display name with spaces by normalizing", () => {
    const names = makeNames([["p1", "Alice Wang"]]);
    const result = parseMentions("Hey @AliceWang, how are you?", names);
    expect(result).toHaveLength(1);
    expect(result[0].participantId).toBe("p1");
  });

  it("matches display name with multiple spaces normalized", () => {
    const names = makeNames([["p1", "Alice  Bob"]]);
    const result = parseMentions("Hey @AliceBob, how are you?", names);
    expect(result).toHaveLength(1);
    expect(result[0].participantId).toBe("p1");
  });

  it("returns multiple matches for the same participant", () => {
    const names = makeNames([["p1", "Alice"]]);
    const result = parseMentions("@Alice and @Alice again", names);
    expect(result).toHaveLength(2);
    expect(result[0].participantId).toBe("p1");
    expect(result[1].participantId).toBe("p1");
  });

  it("returns distinct matches for different participants", () => {
    const names = makeNames([
      ["p1", "Alice"],
      ["p2", "Bob"],
    ]);
    const result = parseMentions("@Alice meet @Bob", names);
    expect(result).toHaveLength(2);
    expect(result[0].participantId).toBe("p1");
    expect(result[1].participantId).toBe("p2");
  });

  it("does not match when @ mention has no matching participant", () => {
    const names = makeNames([["p1", "Alice"]]);
    const result = parseMentions("Hey @Bob, how are you?", names);
    expect(result).toEqual([]);
  });

  it("does not match partial name prefix", () => {
    const names = makeNames([["p1", "Alice"]]);
    // "Ali" is not a full name match
    const result = parseMentions("Hey @Ali, how are you?", names);
    expect(result).toEqual([]);
  });

  it("handles empty text", () => {
    const names = makeNames([["p1", "Alice"]]);
    expect(parseMentions("", names)).toEqual([]);
  });

  it("handles empty participant map", () => {
    const names = makeNames([]);
    expect(parseMentions("@Alice @Bob", names)).toEqual([]);
  });

  it("picks first matching participant when two have same normalized name", () => {
    // Both normalize to "Alice" — first match wins per iteration break
    const names = makeNames([
      ["p1", "Alice"],
      ["p2", "Alice"],
    ]);
    const result = parseMentions("@Alice", names);
    expect(result).toHaveLength(1);
    expect(result[0].participantId).toBe("p1");
  });

  it("records correct start and end indices for a match at text start", () => {
    const names = makeNames([["p1", "Alice"]]);
    const result = parseMentions("@Alice says hi", names);
    expect(result).toHaveLength(1);
    expect(result[0].startIndex).toBe(0);
    expect(result[0].endIndex).toBe(6);
  });

  it("records correct indices for a match at text end", () => {
    const names = makeNames([["p1", "Alice"]]);
    const result = parseMentions("Hi @Alice", names);
    expect(result).toHaveLength(1);
    expect(result[0].startIndex).toBe(3);
    expect(result[0].endIndex).toBe(9);
  });

  it("includes the original displayName from the map in result", () => {
    const names = makeNames([["p1", "Alice Wang"]]);
    const result = parseMentions("@AliceWang", names);
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("Alice Wang");
  });

  it("matches @ mention immediately followed by punctuation (new regex)", () => {
    // New regex: /@(\S+?)(?=[\s,.;:!?，。！？；：]|$)/g
    // Trailing punctuation is a delimiter, so @Alice! matches Alice.
    const names = makeNames([["p1", "Alice"]]);
    const result = parseMentions("@Alice! How are you?", names);
    expect(result).toHaveLength(1);
    expect(result[0].participantId).toBe("p1");
    expect(result[0].endIndex).toBe(6); // "Alice" ends at index 6 (before "!")
  });

  it("matches @ mention separated by whitespace from punctuation", () => {
    const names = makeNames([["p1", "Alice"]]);
    const result = parseMentions("@Alice ! How are you?", names);
    expect(result).toHaveLength(1);
    expect(result[0].participantId).toBe("p1");
  });
  it("matches multiple @ mentions with trailing commas and punctuation", () => {
    const names = makeNames([
      ["p1", "Alice"],
      ["p2", "Bob"],
    ]);
    const result = parseMentions("@Alice, @Bob! Hi there.", names);
    expect(result).toHaveLength(2);
    expect(result[0].participantId).toBe("p1");
    expect(result[1].participantId).toBe("p2");
  });
});

// ── stripMentions ──

describe("stripMentions", () => {
  it("removes all @ mentions from text", () => {
    expect(stripMentions("@Alice @Bob hello")).toBe("hello");
  });

  it("returns empty string when text is only @ mentions", () => {
    expect(stripMentions("@Alice")).toBe("");
  });

  it("returns text unchanged when there are no @ mentions", () => {
    expect(stripMentions("Hello world")).toBe("Hello world");
  });

  it("handles empty string", () => {
    expect(stripMentions("")).toBe("");
  });

  it("strips @ mentions but keeps other text and punctuation", () => {
    expect(stripMentions("Hey @Alice, meet @Bob!")).toBe("Hey , meet !");
  });

  it("strips mentions when followed by punctuation", () => {
    // New regex: @Alice, → only "Alice" is matched (comma is delimiter)
    // @Bob! → only "Bob" is matched (exclamation is delimiter)
    // Result: comma and exclamation remain
    expect(stripMentions("@Alice, @Bob!")).toBe(", !");
  });

  it("handles email-like patterns with new regex", () => {
    // @example.com — the regex matches @\S+? until a delimiter.
    // "." is a delimiter, so "@example" is stripped and ".com" survives.
    expect(stripMentions("Contact user@example.com")).toBe("Contact user.com");
  });
});

// ── extractMentionedParticipantIds ──

describe("extractMentionedParticipantIds", () => {
  it("extracts participant IDs from @ mentions", () => {
    const names = makeNames([
      ["p1", "Alice"],
      ["p2", "Bob"],
    ]);
    const result = extractMentionedParticipantIds("@Alice and @Bob", names);
    expect(result).toEqual(["p1", "p2"]);
  });

  it("returns empty array when no matching participants", () => {
    const names = makeNames([["p1", "Alice"]]);
    expect(extractMentionedParticipantIds("Hello @Charlie", names)).toEqual([]);
  });

  it("deduplicates by using the same participant multiple times", () => {
    // Note: extractMentionedParticipantIds does NOT deduplicate — it maps 1:1 over results
    const names = makeNames([["p1", "Alice"]]);
    const result = extractMentionedParticipantIds("@Alice and @Alice", names);
    expect(result).toEqual(["p1", "p1"]);
  });
});
