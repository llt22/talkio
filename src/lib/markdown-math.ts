function normalizeTextMath(content: string): string {
  return content
    .replace(/(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]/g, (_match, expression: string) => {
      return `\n$$\n${expression.trim()}\n$$\n`;
    })
    .replace(/(?<!\\)\\\(([^\n]*?)(?<!\\)\\\)/g, (_match, expression: string) => `$${expression}$`);
}

function backtickRunLength(content: string, start: number): number {
  let end = start;
  while (content[end] === "`") end++;
  return end - start;
}

function normalizeOutsideInlineCode(content: string): string {
  let result = "";
  let plainStart = 0;
  let index = 0;

  const appendPlain = (end: number) => {
    result += normalizeTextMath(content.slice(plainStart, end));
  };

  while (index < content.length) {
    if (content[index] !== "`") {
      index++;
      continue;
    }

    const runLength = backtickRunLength(content, index);
    const marker = "`".repeat(runLength);
    const closingIndex = content.indexOf(marker, index + runLength);
    if (closingIndex === -1) {
      index += runLength;
      continue;
    }

    appendPlain(index);
    const protectedEnd = closingIndex + runLength;
    result += content.slice(index, protectedEnd);
    index = protectedEnd;
    plainStart = protectedEnd;
  }

  appendPlain(content.length);
  return result;
}

export function normalizeMarkdownMath(content: string): string {
  let result = "";
  let plainStart = 0;
  let lineStart = 0;
  let fence: { marker: string; length: number; start: number } | null = null;

  while (lineStart < content.length) {
    const newlineIndex = content.indexOf("\n", lineStart);
    const lineEnd = newlineIndex === -1 ? content.length : newlineIndex;
    const line = content.slice(lineStart, lineEnd);

    if (!fence) {
      const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (opening) {
        result += normalizeOutsideInlineCode(content.slice(plainStart, lineStart));
        fence = { marker: opening[0], length: opening.length, start: lineStart };
      }
    } else {
      const closingPattern = new RegExp(`^ {0,3}${fence.marker}{${fence.length},}\\s*$`);
      if (closingPattern.test(line)) {
        const protectedEnd = newlineIndex === -1 ? content.length : newlineIndex + 1;
        result += content.slice(fence.start, protectedEnd);
        fence = null;
        plainStart = protectedEnd;
      }
    }

    lineStart = newlineIndex === -1 ? content.length : newlineIndex + 1;
  }

  if (fence) {
    result += content.slice(fence.start);
  } else {
    result += normalizeOutsideInlineCode(content.slice(plainStart));
  }
  return result;
}
