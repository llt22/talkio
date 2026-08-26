/**
 * AboutPage — app name, version, and a link to the GitHub project.
 * Shown as a settings sub-page on desktop and a stackflow activity on mobile.
 */
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Github, ChevronRight } from "lucide-react";

const GITHUB_URL = "https://github.com/llt22/talkio";

export function AboutPage() {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        setVersion(await getVersion());
      } catch {
        // Not running inside Tauri (browser dev): leave the version blank.
      }
    })();
  }, []);

  const openGithub = async () => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(GITHUB_URL);
    } catch {
      window.open(GITHUB_URL, "_blank", "noopener");
    }
  };

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: "var(--secondary)" }}>
      <div className="mx-auto max-w-lg px-4 pt-10 pb-10">
        <div className="flex flex-col items-center gap-2 py-6">
          <div className="text-foreground text-[24px] font-bold tracking-tight">Talkio</div>
          {version && <div className="text-muted-foreground text-[14px]">v{version}</div>}
          <p className="text-muted-foreground mt-2 px-6 text-center text-[13px] leading-relaxed">
            {t("settings.aboutDescription")}
          </p>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl" style={{ backgroundColor: "var(--card)" }}>
          <button
            onClick={openGithub}
            className="flex w-full items-center px-4 py-3.5 transition-colors active:bg-black/5"
          >
            <Github size={18} color="var(--muted-foreground)" className="mr-3 flex-shrink-0" />
            <span className="text-foreground flex-1 text-left text-[16px]">
              {t("settings.aboutGithub")}
            </span>
            <ChevronRight size={18} color="var(--muted-foreground)" />
          </button>
        </div>
      </div>
    </div>
  );
}
