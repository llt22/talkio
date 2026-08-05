export interface MentionMatch {
  participantId: string;
  startIndex: number;
  endIndex: number;
  displayName: string;
}

// Stops at whitespace or common trailing punctuation so that "@Alice," and
// "@Alice!" resolve to "@Alice" — punctuation stays in the text and the
// mention is still recognized.
const MENTION_REGEX = /@(\S+?)(?=[\s,.;:!?，。！？；：]|$)/g;

export function parseMentions(text: string, participantNames: Map<string, string>): MentionMatch[] {
  const matches: MentionMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = MENTION_REGEX.exec(text)) !== null) {
    const rawName = match[1];
    for (const [participantId, displayName] of participantNames) {
      const normalized = displayName.replace(/\s+/g, "");
      if (rawName.toLowerCase() === normalized.toLowerCase()) {
        matches.push({
          participantId,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          displayName,
        });
        break;
      }
    }
  }

  return matches;
}

export function stripMentions(text: string): string {
  return text.replace(MENTION_REGEX, "").trim();
}

export function extractMentionedParticipantIds(
  text: string,
  participantNames: Map<string, string>,
): string[] {
  return parseMentions(text, participantNames).map((m) => m.participantId);
}
