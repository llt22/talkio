/**
 * AboutPage — app name, version, and a link to the GitHub project.
 * Shown as a settings sub-page on desktop and a stackflow activity on mobile.
 */
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Github, ChevronRight, RefreshCw } from "lucide-react";

const GITHUB_URL = "https://github.com/llt22/talkio";
const RELEASES_API_URL = "https://api.github.com/repos/llt22/talkio/releases/latest";

function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.replace(/^v/i, "").split(".").map((part) => Number(part) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return 0;
}

export function AboutPage() {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");
  const [checking, setChecking] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");

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

  const checkForUpdates = async () => {
    if (checking) return;
    setChecking(true);
    setUpdateMessage("");
    try {
      const response = await fetch(RELEASES_API_URL, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) throw new Error(`GitHub responded with ${response.status}`);
      const release = (await response.json()) as { tag_name?: string; html_url?: string };
      const latest = release.tag_name?.trim();
      if (!latest || !version) throw new Error("Latest release did not include a version");
      setUpdateMessage(
        compareVersions(latest, version) > 0
          ? t("settings.updateAvailable", { version: latest })
          : t("settings.upToDate"),
      );
    } catch {
      setUpdateMessage(t("settings.updateCheckFailed"));
    } finally {
      setChecking(false);
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
            onClick={checkForUpdates}
            disabled={checking || !version}
            className="flex w-full items-center px-4 py-3.5 transition-colors active:bg-black/5 disabled:opacity-50"
          >
            <RefreshCw size={18} color="var(--muted-foreground)" className={`mr-3 flex-shrink-0 ${checking ? "animate-spin" : ""}`} />
            <span className="text-foreground flex-1 text-left text-[16px]">
              {checking ? t("settings.checkingForUpdates") : t("settings.checkForUpdates")}
            </span>
            <span className="text-muted-foreground text-[13px]">{updateMessage}</span>
          </button>
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
