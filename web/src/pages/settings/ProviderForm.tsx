import { useState, useCallback } from "react";
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
import type { Provider, ProviderType } from "../../../../src/types";
import { useProviderStore } from "../../stores/provider-store";
import { generateId } from "../../lib/id";

interface ProviderFormProps {
  provider?: Provider;
  onClose: () => void;
}

export function ProviderForm({ provider, onClose }: ProviderFormProps) {
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
      const res = await fetch(`${url}/models`, {
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
      <h3 className="text-base font-semibold text-foreground">
        {provider ? "Edit Provider" : "Add Provider"}
      </h3>

      <div className="space-y-3">
        {/* Type */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
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
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Provider"
            className="h-10"
          />
        </div>

        {/* Base URL */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Base URL</label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="h-10"
          />
        </div>

        {/* API Key */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">API Key</label>
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
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Test / Fetch result */}
      {testResult && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
          testResult === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}>
          {testResult === "success" ? <Check size={14} /> : <X size={14} />}
          {testResult === "success" ? "Connection successful" : "Connection failed"}
        </div>
      )}
      {fetchResult && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
          fetchResult.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
        }`}>
          {fetchResult.startsWith("Error") ? <X size={14} /> : <Check size={14} />}
          {fetchResult}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button variant="outline" onClick={handleTest} disabled={testing || fetchingModels || !baseUrl || !apiKey} className="flex-1">
          {testing ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
          Test
        </Button>
        <Button onClick={handleSaveAndFetch} disabled={fetchingModels || !name.trim() || !baseUrl.trim() || !apiKey.trim()} className="flex-1">
          {fetchingModels ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
          Save & Fetch
        </Button>
      </div>
      <Button variant="ghost" onClick={onClose} className="w-full text-muted-foreground" disabled={fetchingModels}>
        Cancel
      </Button>
    </div>
  );
}
