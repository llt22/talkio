/**
 * WebDavSettingsPage — configure a WebDAV endpoint and manually push/pull the backup.
 *
 * Upload includes API keys so the backup is a complete migration snapshot; the
 * WebDAV backup lives on the user's own server. Restore overwrites local data and
 * is gated by a confirmation.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2, User, Lock, Eye, EyeOff, UploadCloud, DownloadCloud, Plug } from "lucide-react";
import { useSettingsStore } from "../../stores/settings-store";
import { useProviderStore } from "../../stores/provider-store";
import { useConfirm, appAlert } from "../../components/shared/ConfirmDialogProvider";
import { createBackup, importBackupFromString } from "../../services/backup";
import { webdavTest, webdavUpload, webdavDownload, type WebDavConfig } from "../../services/webdav";

type Busy = null | "test" | "upload" | "download";

export function WebDavSettingsPage() {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [url, setUrl] = useState(settings.webdavUrl);
  const [username, setUsername] = useState(settings.webdavUsername);
  const [password, setPassword] = useState(settings.webdavPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);

  const configured = !!(url.trim() && username.trim() && password);

  const persist = () =>
    updateSettings({
      webdavUrl: url.trim(),
      webdavUsername: username.trim(),
      webdavPassword: password,
    });

  const config = (): WebDavConfig => ({ url: url.trim(), username: username.trim(), password });

  const mapError = (e: unknown): string => {
    const m = e instanceof Error ? e.message : "";
    if (m === "auth") return t("settings.webdavErrorAuth");
    if (m === "notfound") return t("settings.webdavErrorNotFound");
    return m || t("settings.webdavErrorNetwork");
  };

  const handleTest = async () => {
    if (!configured || busy) return;
    persist();
    setBusy("test");
    try {
      await webdavTest(config());
      await appAlert(t("settings.webdavTestSuccess"));
    } catch (e) {
      await appAlert(`${t("settings.webdavTestFailed")}: ${mapError(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleUpload = async () => {
    if (!configured || busy) return;
    persist();
    setBusy("upload");
    try {
      const data = await createBackup(true);
      await webdavUpload(config(), JSON.stringify(data, null, 2));
      await appAlert(t("settings.webdavUploadSuccess"));
    } catch (e) {
      await appAlert(`${t("settings.webdavUploadFailed")}: ${mapError(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    if (!configured || busy) return;
    const approved = await confirm({
      title: t("settings.webdavRestore"),
      description: t("settings.restoreConfirm"),
      confirmText: t("settings.webdavRestore"),
      destructive: true,
    });
    if (!approved) return;
    persist();
    setBusy("download");
    try {
      const text = await webdavDownload(config());
      const result = await importBackupFromString(text);
      if (result.success) {
        useProviderStore.getState().loadFromStorage();
        useSettingsStore.getState().loadFromStorage();
        await appAlert(t("settings.importSuccess", result.counts!));
        window.location.reload();
      } else {
        const msg =
          result.errorCode === "UNSUPPORTED_VERSION"
            ? t("settings.importUnsupportedVersion", { version: result.errorDetail })
            : t("settings.importParseError");
        await appAlert(`${t("settings.importFailed")}: ${msg}`);
      }
    } catch (e) {
      await appAlert(`${t("settings.webdavDownloadFailed")}: ${mapError(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const inputRow = (
    icon: React.ReactNode,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    trailing?: React.ReactNode,
    type: "text" | "password" = "text",
  ) => (
    <div className="overflow-hidden rounded-xl" style={{ backgroundColor: "var(--card)" }}>
      <div className="flex items-center px-4 py-3.5">
        <span className="mr-3 flex-shrink-0">{icon}</span>
        <input
          type={type}
          className="text-foreground flex-1 bg-transparent text-[16px] outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={persist}
          placeholder={placeholder}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        {trailing}
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: "var(--secondary)" }}>
      <div className="mx-auto max-w-lg space-y-3 px-4 pt-4 pb-10">
        <p className="text-muted-foreground px-1 text-[13px] leading-relaxed">
          {t("settings.webdavHint")}
        </p>

        {inputRow(
          <Link2 size={18} color="var(--muted-foreground)" />,
          url,
          setUrl,
          "https://dav.jianguoyun.com/dav/talkio/",
        )}
        {inputRow(
          <User size={18} color="var(--muted-foreground)" />,
          username,
          setUsername,
          t("settings.webdavUsername"),
        )}
        {inputRow(
          <Lock size={18} color="var(--muted-foreground)" />,
          password,
          setPassword,
          t("settings.webdavPassword"),
          <button
            onClick={() => setShowPassword(!showPassword)}
            className="ml-2 p-1 active:opacity-60"
          >
            {showPassword ? (
              <EyeOff size={20} color="var(--muted-foreground)" />
            ) : (
              <Eye size={20} color="var(--muted-foreground)" />
            )}
          </button>,
          showPassword ? "text" : "password",
        )}

        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-medium active:opacity-70 disabled:opacity-50"
          style={{ backgroundColor: "var(--card)", color: "var(--foreground)" }}
          disabled={!configured || !!busy}
          onClick={handleTest}
        >
          <Plug size={16} color="var(--muted-foreground)" />
          {busy === "test" ? t("settings.webdavTesting") : t("settings.webdavTest")}
        </button>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            className="flex flex-col items-center gap-1.5 rounded-xl py-4 text-[14px] font-semibold text-white active:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)" }}
            disabled={!configured || !!busy}
            onClick={handleUpload}
          >
            <UploadCloud size={22} color="#fff" />
            {busy === "upload" ? t("settings.webdavUploading") : t("settings.webdavUpload")}
          </button>
          <button
            className="flex flex-col items-center gap-1.5 rounded-xl py-4 text-[14px] font-semibold active:opacity-80 disabled:opacity-50"
            style={{
              backgroundColor: "color-mix(in srgb, var(--destructive) 10%, var(--card))",
              color: "var(--destructive)",
              border: "1px solid color-mix(in srgb, var(--destructive) 30%, transparent)",
            }}
            disabled={!configured || !!busy}
            onClick={handleDownload}
          >
            <DownloadCloud size={22} color="var(--destructive)" />
            {busy === "download" ? t("settings.webdavDownloading") : t("settings.webdavRestore")}
          </button>
        </div>

        <p className="text-muted-foreground px-1 pt-2 text-[12px] leading-relaxed">
          {t("settings.webdavSecretsNote")}
        </p>
      </div>
    </div>
  );
}
