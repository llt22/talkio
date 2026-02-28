import { createHighlighter, type Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

const PRELOADED_LANGS = [
  "javascript", "typescript", "jsx", "tsx",
  "python", "rust", "go", "java", "c", "cpp",
  "html", "css", "json", "yaml", "toml",
  "bash", "shell", "sql", "markdown",
  "swift", "kotlin", "dart",
];

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-dark", "github-light"],
      langs: PRELOADED_LANGS,
    });
  }
  return highlighterPromise;
}

export async function highlightCode(
  code: string,
  lang: string,
  theme: "github-dark" | "github-light" = "github-dark",
): Promise<string> {
  const highlighter = await getHighlighter();
  const loadedLangs = highlighter.getLoadedLanguages();
  if (!loadedLangs.includes(lang as any)) {
    try {
      await highlighter.loadLanguage(lang as any);
    } catch {
      // Language not supported, fall back to plaintext
      return highlighter.codeToHtml(code, { lang: "text", theme });
    }
  }
  return highlighter.codeToHtml(code, { lang, theme });
}
