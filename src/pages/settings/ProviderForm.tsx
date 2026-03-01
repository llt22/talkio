import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Loader2, Check, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import type { Provider, ProviderType } from "../../types";
import { useProviderStore } from "../../stores/provider-store";
import { appFetch } from "../../lib/http";
import { generateId } from "../../lib/id";

interface ProviderFormProps {
  provider?: Provider;
  onClose: () => void;
}

export function ProviderForm({ provider, onClose }: ProviderFormProps) {
  const { t } = useTranslation();
  const addProvider = useProviderStore((s) => s.addProvider);
  const updateProvider = useProviderStore((s) => s.updateProvider);

  const [name, setName] = useState(provider?.name ?? "");
  const [type, setType] = useState<ProviderType>("openai");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(provider?.apiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

  const handleTest = useCallback(async () => {
    if (!baseUrl || !apiKey) return;
    setTesting(true);
    setTestResult(null);
    try {
      const url = baseUrl.replace(/\/+$/, "");
      const res = await appFetch(`${url}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      setTestResult(res.ok ? "success" : "error");
    } catch {
      setTestResult("error");
    } finally {
      setTesting(false);
    }
  }, [baseUrl, apiKey]);

  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchResult, setFetchResult] = useState<string | null>(null);
  const fetchModels = useProviderStore((s) => s.fetchModels);

  const doSave = useCallback((): string => {
    if (!name.trim() || !baseUrl.trim() || !apiKey.trim()) return "";

    if (provider) {
      updateProvider(provider.id, {
        name: name.trim(),
        type,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
      });
      return provider.id;
    } else {
      const id = generateId();
      addProvider({
        id,
        name: name.trim(),
        type,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        apiVersion: undefined,
        customHeaders: [],
        enabled: true,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      return id;
    }
  }, [name, type, baseUrl, apiKey, provider, addProvider, updateProvider]);

  const handleSave = useCallback(() => {
    doSave();
    onClose();
  }, [doSave, onClose]);

  const handleSaveAndFetch = useCallback(async () => {
    const providerId = doSave();
    if (!providerId) return;
    setFetchingModels(true);
    setFetchResult(null);
    try {
      const models = await fetchModels(providerId);
      setFetchResult(`Fetched ${models.length} models`);
      setTimeout(() => onClose(), 1000);
    } catch (err: any) {
      setFetchResult(`Error: ${err.message}`);
    } finally {
      setFetchingModels(false);
    }
  }, [doSave, fetchModels, onClose]);

  const presets: Record<string, { name: string; baseUrl: string }> = {
    openai: { name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  };

  const handleTypeChange = (val: string) => {
    const t = val as ProviderType;
    setType(t);
    if (!provider && presets[t]) {
      if (!name) setName(presets[t].name);
      if (!baseUrl) setBaseUrl(presets[t].baseUrl);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-foreground text-base font-semibold">
        {provider ? t("settings.editProvider") : t("settings.addProvider")}
      </h3>

      <div className="space-y-3">
        {/* Type */}
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-medium">
            {t("providerEdit.type", { defaultValue: "Type" })}
          </label>
          <Select value={type} onValueChange={handleTypeChange}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI Compatible</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Name */}
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-medium">
            {t("providerEdit.name", { defaultValue: "Name" })}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("providerEdit.namePlaceholder", { defaultValue: "My Provider" })}
            className="h-10"
          />
        </div>

        {/* Base URL */}
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-medium">
            {t("settings.baseUrl")}
          </label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="h-10"
          />
        </div>

        {/* API Key */}
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-medium">
            {t("settings.apiKey")}
          </label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="h-10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 p-1"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Test / Fetch result */}
      {testResult && (
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
            testResult === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {testResult === "success" ? <Check size={14} /> : <X size={14} />}
          {testResult === "success"
            ? t("providerEdit.connectionSuccess", { defaultValue: "Connection successful" })
            : t("providerEdit.connectionFailed", { defaultValue: "Connection failed" })}
        </div>
      )}
      {fetchResult && (
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
            fetchResult.startsWith("Error")
              ? "bg-red-50 text-red-700"
              : "bg-green-50 text-green-700"
          }`}
        >
          {fetchResult.startsWith("Error") ? <X size={14} /> : <Check size={14} />}
          {fetchResult}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={testing || fetchingModels || !baseUrl || !apiKey}
          className="flex-1"
        >
          {testing ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
          {t("providerEdit.testConnection", { defaultValue: "Test" })}
        </Button>
        <Button
          onClick={handleSaveAndFetch}
          disabled={fetchingModels || !name.trim() || !baseUrl.trim() || !apiKey.trim()}
          className="flex-1"
        >
          {fetchingModels ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
          {t("providerEdit.saveAndFetch", { defaultValue: "Save & Fetch" })}
        </Button>
      </div>
      <Button
        variant="ghost"
        onClick={onClose}
        className="text-muted-foreground w-full"
        disabled={fetchingModels}
      >
        {t("common.cancel")}
      </Button>
    </div>
  );
}
