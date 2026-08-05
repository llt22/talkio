import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";

const LANGUAGE_LOADERS = {
  bash: () => import("@shikijs/langs/bash"),
  c: () => import("@shikijs/langs/c"),
  css: () => import("@shikijs/langs/css"),
  dart: () => import("@shikijs/langs/dart"),
  go: () => import("@shikijs/langs/go"),
  html: () => import("@shikijs/langs/html"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  jsx: () => import("@shikijs/langs/jsx"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  markdown: () => import("@shikijs/langs/markdown"),
  python: () => import("@shikijs/langs/python"),
  rust: () => import("@shikijs/langs/rust"),
  shell: () => import("@shikijs/langs/shellscript"),
  sql: () => import("@shikijs/langs/sql"),
  swift: () => import("@shikijs/langs/swift"),
  toml: () => import("@shikijs/langs/toml"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  yaml: () => import("@shikijs/langs/yaml"),
} as const;

type SupportedLanguage = keyof typeof LANGUAGE_LOADERS;
type CodeTheme = "github-dark" | "github-light";

const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
  js: "javascript",
  py: "python",
  sh: "bash",
  ts: "typescript",
  yml: "yaml",
};

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [githubDark, githubLight],
      langs: [],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  }
  return highlighterPromise;
}

function escapeHtml(code: string): string {
  return code.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function renderPlaintext(code: string, theme: CodeTheme): string {
  return `<pre class="shiki ${theme}" style="background-color:transparent;color:inherit" tabindex="0"><code>${escapeHtml(code)}</code></pre>`;
}

export async function highlightCode(
  code: string,
  lang: string,
  theme: CodeTheme = "github-dark",
): Promise<string> {
  const normalized = LANGUAGE_ALIASES[lang] ?? lang;
  if (!(normalized in LANGUAGE_LOADERS)) return renderPlaintext(code, theme);

  const language = normalized as SupportedLanguage;
  const highlighter = await getHighlighter();
  if (!highlighter.getLoadedLanguages().includes(language)) {
    const module = await LANGUAGE_LOADERS[language]();
    await highlighter.loadLanguage(...module.default);
  }
  return highlighter.codeToHtml(code, { lang: language, theme });
}
