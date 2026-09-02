import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownRenderer } from "../MarkdownRenderer";

function countRenderedFormulas(markdown: string): number {
  const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content: markdown }));
  return html.match(/class="katex"/g)?.length ?? 0;
}

describe("MarkdownRenderer math", () => {
  it.each(["$x$", "$$x$$", String.raw`\(x\)`, String.raw`\[x\]`])(
    "renders %s exactly once",
    (markdown) => {
      expect(countRenderedFormulas(markdown)).toBe(1);
    },
  );
});
