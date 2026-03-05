import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  IoKeyOutline,
  IoEyeOutline,
  IoEyeOffOutline,
  IoCaretDown,
  IoCaretUp,
  IoAdd,
  IoCloseCircle,
} from "../../icons";
import type { ProviderType, ApiFormat, CustomHeader } from "../../types";

const PROVIDER_TYPE_OPTIONS: { value: ProviderType; label: string }[] = [
  { value: "openai", label: "OpenAI" },
];

export interface ProviderConfigFormProps {
  name: string;
  onNameChange: (v: string) => void;
  baseUrl: string;
  onBaseUrlChange: (v: string) => void;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  providerType: ProviderType;
  onProviderTypeChange: (v: ProviderType) => void;
  apiFormat: ApiFormat;
  onApiFormatChange: (v: ApiFormat) => void;
  customHeaders: CustomHeader[];
  onCustomHeadersChange: (v: CustomHeader[]) => void;
  providerEnabled: boolean;
  onProviderEnabledChange: (v: boolean) => void;
  /** Show name/URL/type fields (false for preset providers) */
  showBaseFields: boolean;
}

export function ProviderConfigForm(props: ProviderConfigFormProps) {
  const { t } = useTranslation();
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <>
      {/* Name / URL / Type */}
      {props.showBaseFields && (
        <div
          className="mb-4 overflow-hidden rounded-xl"
          style={{ backgroundColor: "var(--card)" }}
        >
          <FormRow label={t("providerEdit.name")}>
            <input
              className="text-foreground flex-1 bg-transparent text-[16px] outline-none"
              value={props.name}
              onChange={(e) => props.onNameChange(e.target.value)}
              placeholder="e.g. OpenRouter"
            />
          </FormRow>
          <FormRow label={t("providerEdit.baseUrl")}>
            <input
              className="text-foreground flex-1 bg-transparent text-[16px] outline-none"
              value={props.baseUrl}
              onChange={(e) => props.onBaseUrlChange(e.target.value)}
              placeholder="https://api.example.com/v1"
            />
          </FormRow>
          <FormRow label={t("providerEdit.type")} isLast>
            <div className="flex flex-wrap gap-2">
              {PROVIDER_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => props.onProviderTypeChange(opt.value)}
                  className="rounded-full px-3 py-1 text-[13px] font-medium transition-colors"
                  style={{
                    border: `1px solid ${props.providerType === opt.value ? "var(--primary)" : "var(--border)"}`,
                    backgroundColor:
                      props.providerType === opt.value
                        ? "color-mix(in srgb, var(--primary) 10%, transparent)"
                        : "transparent",
                    color:
                      props.providerType === opt.value
                        ? "var(--primary)"
                        : "var(--muted-foreground)",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </FormRow>
        </div>
      )}

      {/* API Key */}
      <div
        className="mb-4 overflow-hidden rounded-xl"
        style={{ backgroundColor: "var(--card)" }}
      >
        <div className="flex items-center px-4 py-3.5">
          <IoKeyOutline
            size={18}
            color="var(--muted-foreground)"
            className="mr-3 flex-shrink-0"
          />
          <input
            type={showApiKey ? "text" : "password"}
            className="text-foreground flex-1 bg-transparent text-[16px] outline-none"
            value={props.apiKey}
            onChange={(e) => props.onApiKeyChange(e.target.value)}
            placeholder={t("providerEdit.apiKeyPlaceholder")}
          />
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className="ml-2 p-1 active:opacity-60"
          >
            {showApiKey ? (
              <IoEyeOffOutline size={20} color="var(--muted-foreground)" />
            ) : (
              <IoEyeOutline size={20} color="var(--muted-foreground)" />
            )}
          </button>
        </div>
      </div>

      {/* Advanced Settings Toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="mb-2 flex w-full items-center justify-between px-1 py-2"
      >
        <span className="text-muted-foreground text-[13px] font-medium">
          {t("providerEdit.advancedSettings")}
        </span>
        {showAdvanced ? (
          <IoCaretUp size={16} color="var(--muted-foreground)" style={{ opacity: 0.5 }} />
        ) : (
          <IoCaretDown size={16} color="var(--muted-foreground)" style={{ opacity: 0.5 }} />
        )}
      </button>

      {showAdvanced && (
        <div
          className="mb-4 overflow-hidden rounded-xl"
          style={{ backgroundColor: "var(--card)" }}
        >
          {/* Enabled toggle */}
          <div
            className="flex items-center justify-between px-4 py-3.5"
            style={{ borderBottom: "0.5px solid var(--border)" }}
          >
            <span className="text-foreground text-[15px]">{t("providerEdit.enabled")}</span>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={props.providerEnabled}
                onChange={(e) => props.onProviderEnabledChange(e.target.checked)}
                className="peer sr-only"
              />
              <div className="peer-checked:bg-primary bg-muted-foreground/30 h-6 w-11 rounded-full after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
            </label>
          </div>

          {/* API Format */}
          <div
            className="flex items-center justify-between px-4 py-3.5"
            style={{ borderBottom: "0.5px solid var(--border)" }}
          >
            <span className="text-foreground text-[15px]">{t("providerEdit.apiFormat")}</span>
            <div className="flex gap-1.5">
              {(["chat-completions", "responses"] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => props.onApiFormatChange(fmt)}
                  className="rounded-full px-3 py-1 text-[12px] font-medium transition-colors"
                  style={{
                    border: `1px solid ${props.apiFormat === fmt ? "var(--primary)" : "var(--border)"}`,
                    backgroundColor:
                      props.apiFormat === fmt
                        ? "color-mix(in srgb, var(--primary) 10%, transparent)"
                        : "transparent",
                    color: props.apiFormat === fmt ? "var(--primary)" : "var(--muted-foreground)",
                  }}
                >
                  {fmt === "chat-completions" ? "Chat Completions" : "Responses"}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Headers */}
          <div className="px-4 py-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-foreground text-[14px]">
                {t("providerEdit.customHeaders")}
              </span>
              <button
                onClick={() =>
                  props.onCustomHeadersChange([...props.customHeaders, { name: "", value: "" }])
                }
                className="flex items-center gap-1 text-[13px] font-medium active:opacity-60"
                style={{ color: "var(--primary)" }}
              >
                <IoAdd size={14} color="var(--primary)" />
                {t("common.add")}
              </button>
            </div>
            {props.customHeaders.map((h: CustomHeader, idx: number) => (
              <div key={idx} className="mb-2 flex items-center gap-2">
                <input
                  className="text-foreground flex-1 rounded-lg px-3 py-2 text-[14px] outline-none"
                  style={{ backgroundColor: "var(--muted)" }}
                  value={h.name}
                  onChange={(e) => {
                    const next = [...props.customHeaders];
                    next[idx] = { ...next[idx], name: e.target.value };
                    props.onCustomHeadersChange(next);
                  }}
                  placeholder={t("providerEdit.customHeaderName")}
                />
                <input
                  className="text-foreground flex-1 rounded-lg px-3 py-2 text-[14px] outline-none"
                  style={{ backgroundColor: "var(--muted)" }}
                  value={h.value}
                  onChange={(e) => {
                    const next = [...props.customHeaders];
                    next[idx] = { ...next[idx], value: e.target.value };
                    props.onCustomHeadersChange(next);
                  }}
                  placeholder={t("providerEdit.customHeaderValue")}
                />
                <button
                  onClick={() =>
                    props.onCustomHeadersChange(props.customHeaders.filter((_, i) => i !== idx))
                  }
                  className="p-1 active:opacity-60"
                >
                  <IoCloseCircle size={18} color="var(--destructive)" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Helper: Form Row ──

function FormRow({
  label,
  children,
  isLast = false,
}: {
  label: string;
  children: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div
      className="flex items-center px-4 py-3.5"
      style={{ borderBottom: isLast ? "none" : "0.5px solid var(--border)" }}
    >
      <span className="text-foreground w-24 flex-shrink-0 text-[15px]">{label}</span>
      {children}
    </div>
  );
}
