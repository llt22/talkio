import { describe, expect, it } from "vitest";
import { normalizeMarkdownMath } from "../markdown-math";

describe("normalizeMarkdownMath", () => {
  it("normalizes parenthesis and bracket math delimiters", () => {
    expect(normalizeMarkdownMath(String.raw`Inline \(x + 1\).`)).toBe("Inline $x + 1$.");
    expect(normalizeMarkdownMath(String.raw`Before \[x^2\] after`)).toBe(
      "Before \n$$\nx^2\n$$\n after",
    );
  });

  it("leaves dollar math delimiters unchanged", () => {
    expect(normalizeMarkdownMath("$x$ and $$y$$")).toBe("$x$ and $$y$$");
  });

  it("does not rewrite delimiters inside inline or fenced code", () => {
    const markdown = [
      "Use \\(x\\), but keep `\\(code\\)` unchanged.",
      "```tex",
      String.raw`\[code\]`,
      "```",
    ].join("\n");

    expect(normalizeMarkdownMath(markdown)).toBe(
      ["Use $x$, but keep `\\(code\\)` unchanged.", "```tex", String.raw`\[code\]`, "```"].join(
        "\n",
      ),
    );
  });

  it("protects tilde fences and escaped literal delimiters", () => {
    const markdown = [
      String.raw`Keep \\(literal\\) unchanged.`,
      "~~~tex",
      String.raw`\[code\]`,
      "~~~",
    ].join("\n");

    expect(normalizeMarkdownMath(markdown)).toBe(markdown);
  });
});
