export interface MentionMatch {
  modelId: string;
  startIndex: number;
  endIndex: number;
  displayName: string;
}

const MENTION_REGEX = /@(\S+)/g;

export function parseMentions(
  text: string,
  modelNames: Map<string, string>,
): MentionMatch[] {
  const matches: MentionMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = MENTION_REGEX.exec(text)) !== null) {
    const rawName = match[1];
    for (const [modelId, displayName] of modelNames) {
      const normalized = displayName.replace(/\s+/g, "");
      if (rawName.toLowerCase() === normalized.toLowerCase()) {
        matches.push({
          modelId,
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

export function extractMentionedModelIds(
  text: string,
  modelNames: Map<string, string>,
): string[] {
  return parseMentions(text, modelNames).map((m) => m.modelId);
}
