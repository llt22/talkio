import { memo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  IoEyeOutline,
  IoCodeSlashOutline,
  IoCopyOutline,
  IoExpandOutline,
  IoCloseOutline,
} from "../../icons";

interface HtmlPreviewProps {
  code: string;
  language?: string;
}

export const HtmlPreview = memo(function HtmlPreview({
  code,
  language = "html",
}: HtmlPreviewProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const handleTabSwitch = useCallback((tab: "preview" | "code") => {
    setActiveTab(tab);
    if (tab === "preview") setPreviewEnabled(true);
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
  }, [code]);

  const wrappedHtml = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><style>html,body{overflow-x:hidden;max-width:100vw}body{background:#fff;color:#121212;margin:0;padding:12px;font-family:system-ui,sans-serif;box-sizing:border-box;word-break:break-word}</style></head><body>${code}</body></html>`;

  return (
    <>
      <div
        className="mt-1 w-full max-w-full min-w-0 overflow-hidden rounded-xl"
        style={{ border: "0.5px solid var(--border)", backgroundColor: "var(--card)" }}
      >
        {/* Tab bar — 1:1 RN */}
        <div
          className="flex w-full max-w-full min-w-0"
          style={{ borderBottom: "0.5px solid var(--border)" }}
        >
          <button
            onClick={() => handleTabSwitch("preview")}
            className="flex flex-1 items-center justify-center gap-1.5 py-2.5 active:opacity-70"
            style={{
              backgroundColor:
                activeTab === "preview"
                  ? "color-mix(in srgb, var(--primary) 8%, transparent)"
                  : "var(--secondary)",
            }}
          >
            <IoEyeOutline
              size={15}
              color={activeTab === "preview" ? "var(--primary)" : "var(--muted-foreground)"}
            />
            <span
              className="text-xs font-bold"
              style={{
                color: activeTab === "preview" ? "var(--primary)" : "var(--muted-foreground)",
              }}
            >
              {t("htmlPreview.preview", { defaultValue: "Preview" })}
            </span>
          </button>
          <div style={{ width: "0.5px", backgroundColor: "var(--border)" }} />
          <button
            onClick={() => handleTabSwitch("code")}
            className="flex flex-1 items-center justify-center gap-1.5 py-2.5 active:opacity-70"
            style={{
              backgroundColor:
                activeTab === "code"
                  ? "color-mix(in srgb, var(--primary) 8%, transparent)"
                  : "var(--secondary)",
            }}
          >
            <IoCodeSlashOutline
              size={15}
              color={activeTab === "code" ? "var(--primary)" : "var(--muted-foreground)"}
            />
            <span
              className="text-xs font-bold"
              style={{ color: activeTab === "code" ? "var(--primary)" : "var(--muted-foreground)" }}
            >
              {language.toUpperCase()}
            </span>
          </button>
          <div style={{ width: "0.5px", backgroundColor: "var(--border)" }} />
          <button
            onClick={handleCopy}
            className="flex items-center justify-center px-3 active:opacity-70"
            style={{ backgroundColor: "var(--secondary)" }}
          >
            <IoCopyOutline size={14} color="var(--muted-foreground)" />
          </button>
          <div style={{ width: "0.5px", backgroundColor: "var(--border)" }} />
          <button
            onClick={() => setFullscreen(true)}
            className="flex items-center justify-center px-3 active:opacity-70"
            style={{ backgroundColor: "var(--secondary)" }}
          >
            <IoExpandOutline size={14} color="var(--muted-foreground)" />
          </button>
        </div>

        {/* Preview pane */}
        {activeTab === "preview" &&
          (previewEnabled ? (
            <iframe
              srcDoc={wrappedHtml}
              sandbox="allow-scripts allow-same-origin"
              className="w-full border-0 bg-white"
              style={{ height: 320 }}
              title="HTML Preview"
            />
          ) : (
            <button
              onClick={() => setPreviewEnabled(true)}
              className="flex w-full flex-col items-center justify-center px-4 py-6 active:opacity-70"
            >
              <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                {t("htmlPreview.tapToRender", { defaultValue: "Tap to render preview" })}
              </span>
              <span className="mt-1 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                {t("htmlPreview.lazyLoaded", { defaultValue: "Lazy-loaded for performance" })}
              </span>
            </button>
          ))}

        {/* Code pane */}
        {activeTab === "code" && (
          <div
            className="max-h-60 w-full max-w-full min-w-0 overflow-x-auto"
            style={{ scrollbarWidth: "thin" }}
          >
            <pre
              className="m-0 px-3 py-2 font-mono text-[13px] leading-relaxed"
              style={{ color: "var(--foreground)" }}
            >
              <code>{code}</code>
            </pre>
          </div>
        )}
      </div>

      {/* Fullscreen modal */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{
            backgroundColor: "var(--background)",
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "0.5px solid var(--border)" }}
          >
            <span className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
              {t("htmlPreview.fullscreen", { defaultValue: "HTML Preview" })}
            </span>
            <button onClick={() => setFullscreen(false)} className="p-1 active:opacity-60">
              <IoCloseOutline size={22} color="var(--muted-foreground)" />
            </button>
          </div>
          <iframe
            srcDoc={wrappedHtml}
            sandbox="allow-scripts allow-same-origin"
            className="w-full flex-1 border-0"
            style={{ backgroundColor: "var(--background)" }}
            title="HTML Preview Fullscreen"
          />
        </div>
      )}
    </>
  );
});
