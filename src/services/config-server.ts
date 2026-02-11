import * as server from "expo-http-server";
import { Platform } from "react-native";
import * as Network from "expo-network";
import { logger } from "./logger";

const log = logger.withContext("ConfigServer");
const PORT = 19280;

let isRunning = false;
let onConfigReceived: ((config: ProviderConfig) => void) | null = null;

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
}

const CONFIG_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Avatar — Provider Setup</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .card { background: white; border-radius: 20px; padding: 40px; max-width: 520px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
    h1 { font-size: 24px; font-weight: 700; color: #1a1a2e; margin-bottom: 4px; }
    .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 28px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    input { width: 100%; padding: 12px 16px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 15px; color: #1f2937; margin-bottom: 16px; transition: border-color 0.2s; outline: none; }
    input:focus { border-color: #667eea; }
    input::placeholder { color: #9ca3af; }
    .presets { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
    .preset-btn { padding: 6px 14px; border: 1px solid #e5e7eb; border-radius: 20px; background: #f9fafb; font-size: 13px; color: #374151; cursor: pointer; transition: all 0.2s; }
    .preset-btn:hover { background: #667eea; color: white; border-color: #667eea; }
    .btn-row { display: flex; gap: 10px; margin-bottom: 16px; }
    .submit-btn { flex: 1; padding: 14px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; }
    .submit-btn:hover { opacity: 0.9; }
    .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .test-btn { padding: 14px 20px; background: #f0f9ff; color: #3b82f6; border: 2px solid #3b82f6; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .test-btn:hover { background: #3b82f6; color: white; }
    .test-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .toast { margin-top: 12px; padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 500; display: none; }
    .toast.success { display: block; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
    .toast.error { display: block; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .history { margin-top: 20px; }
    .history-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #f9fafb; border-radius: 10px; margin-bottom: 8px; font-size: 14px; }
    .history-icon { font-size: 18px; }
    .history-name { font-weight: 600; color: #1f2937; }
    .history-url { color: #9ca3af; font-size: 12px; }
    .security-note { margin-top: 20px; padding: 12px 16px; background: #f0f9ff; border-radius: 10px; font-size: 12px; color: #64748b; text-align: center; }
    .lang-switch { position: absolute; top: 16px; right: 16px; padding: 4px 12px; border: 1px solid rgba(255,255,255,0.4); border-radius: 20px; background: rgba(255,255,255,0.15); color: white; font-size: 12px; cursor: pointer; }
    .lang-switch:hover { background: rgba(255,255,255,0.3); }
  </style>
</head>
<body>
  <button class="lang-switch" onclick="toggleLang()" id="langBtn">中文</button>
  <div class="card">
    <h1>🤖 Avatar</h1>
    <p class="subtitle" data-i18n="subtitle">Configure your AI provider from the comfort of your keyboard.</p>

    <label data-i18n="quickSelect">Quick Select</label>
    <div class="presets">
      <button class="preset-btn" onclick="applyPreset('OpenAI','https://api.openai.com/v1')">OpenAI</button>
      <button class="preset-btn" onclick="applyPreset('Anthropic','https://api.anthropic.com/v1')">Anthropic</button>
      <button class="preset-btn" onclick="applyPreset('OpenRouter','https://openrouter.ai/api/v1')">OpenRouter</button>
      <button class="preset-btn" onclick="applyPreset('DeepSeek','https://api.deepseek.com/v1')">DeepSeek</button>
      <button class="preset-btn" onclick="applyPreset('Groq','https://api.groq.com/openai/v1')">Groq</button>
      <button class="preset-btn" onclick="applyPreset('Together','https://api.together.xyz/v1')">Together</button>
      <button class="preset-btn" onclick="applyPreset('Ollama','http://localhost:11434/v1')">Ollama</button>
    </div>

    <label data-i18n="providerName">Provider Name</label>
    <input type="text" id="name" data-ph="namePh" placeholder="e.g. OpenRouter" />

    <label data-i18n="baseUrl">Base URL</label>
    <input type="url" id="baseUrl" placeholder="https://api.example.com/v1" />

    <label data-i18n="apiKey">API Key</label>
    <input type="password" id="apiKey" placeholder="sk-..." />

    <div class="btn-row">
      <button class="submit-btn" id="submitBtn" onclick="submitConfig()" data-i18n="sendBtn">Send to App</button>
      <button class="test-btn" id="testBtn" onclick="testConnection()" data-i18n="testBtn">Test</button>
    </div>

    <div class="toast" id="toast"></div>

    <div class="history" id="history"></div>

    <div class="security-note" data-i18n="security">
      🔒 Your API key is sent directly to your phone over the local network. It never leaves your devices.
    </div>
  </div>

  <script>
    const i18n = {
      en: {
        subtitle: 'Configure your AI provider from the comfort of your keyboard.',
        quickSelect: 'Quick Select', providerName: 'Provider Name', baseUrl: 'Base URL', apiKey: 'API Key',
        sendBtn: 'Send to App', testBtn: 'Test', namePh: 'e.g. OpenRouter',
        security: '🔒 Your API key is sent directly to your phone over the local network. It never leaves your devices.',
        sending: 'Sending...', testing: 'Testing...', added: '✅ added!',
        testOk: '✅ Connection successful!', testFail: '❌ Connection failed: ',
        allRequired: 'All fields are required.', connFail: 'Connection to app failed. Same network?',
        langToggle: '中文',
      },
      zh: {
        subtitle: '在电脑上舒适地配置你的 AI 供应商。',
        quickSelect: '快速选择', providerName: '供应商名称', baseUrl: '接口地址', apiKey: 'API 密钥',
        sendBtn: '发送到 App', testBtn: '测试', namePh: '例如 OpenRouter',
        security: '🔒 API 密钥通过局域网直接发送到手机，不会离开你的设备。',
        sending: '发送中...', testing: '测试中...', added: '✅ 已添加！',
        testOk: '✅ 连接成功！', testFail: '❌ 连接失败：',
        allRequired: '所有字段都必须填写。', connFail: '无法连接到 App，请确认在同一网络。',
        langToggle: 'EN',
      }
    };

    let lang = navigator.language.startsWith('zh') ? 'zh' : 'en';
    const added = [];

    function t(key) { return i18n[lang][key] || key; }

    function applyI18n() {
      document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
      });
      document.querySelectorAll('[data-ph]').forEach(el => {
        el.placeholder = t(el.dataset.ph);
      });
      document.getElementById('langBtn').textContent = t('langToggle');
    }

    function toggleLang() {
      lang = lang === 'en' ? 'zh' : 'en';
      applyI18n();
    }

    function applyPreset(name, url) {
      document.getElementById('name').value = name;
      document.getElementById('baseUrl').value = url;
      document.getElementById('apiKey').focus();
    }

    function showToast(msg, type) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.className = 'toast ' + type;
      setTimeout(() => { el.className = 'toast'; }, 5000);
    }

    function renderHistory() {
      const el = document.getElementById('history');
      el.innerHTML = added.map(p =>
        '<div class="history-item"><span class="history-icon">✅</span><div><div class="history-name">' +
        p.name + '</div><div class="history-url">' + p.baseUrl + '</div></div></div>'
      ).join('');
    }

    function getFields() {
      return {
        name: document.getElementById('name').value.trim(),
        baseUrl: document.getElementById('baseUrl').value.trim(),
        apiKey: document.getElementById('apiKey').value.trim(),
      };
    }

    async function submitConfig() {
      const { name, baseUrl, apiKey } = getFields();
      if (!name || !baseUrl || !apiKey) { showToast(t('allRequired'), 'error'); return; }

      const btn = document.getElementById('submitBtn');
      btn.disabled = true; btn.textContent = t('sending');

      try {
        const res = await fetch('/api/config', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, baseUrl, apiKey }),
        });
        if (res.ok) {
          added.push({ name, baseUrl });
          renderHistory();
          showToast(name + ' ' + t('added'), 'success');
          document.getElementById('name').value = '';
          document.getElementById('baseUrl').value = '';
          document.getElementById('apiKey').value = '';
        } else {
          const data = await res.json();
          showToast(data.error || 'Failed', 'error');
        }
      } catch { showToast(t('connFail'), 'error'); }
      btn.disabled = false; btn.textContent = t('sendBtn');
    }

    async function testConnection() {
      const { baseUrl, apiKey } = getFields();
      if (!baseUrl || !apiKey) { showToast(t('allRequired'), 'error'); return; }

      const btn = document.getElementById('testBtn');
      btn.disabled = true; btn.textContent = t('testing');

      try {
        const res = await fetch('/api/test', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseUrl, apiKey }),
        });
        const data = await res.json();
        if (data.ok) { showToast(t('testOk'), 'success'); }
        else { showToast(t('testFail') + (data.error || ''), 'error'); }
      } catch { showToast(t('connFail'), 'error'); }
      btn.disabled = false; btn.textContent = t('testBtn');
    }

    applyI18n();
  </script>
</body>
</html>`;

export async function startConfigServer(
  callback: (config: ProviderConfig) => void,
): Promise<string> {
  if (isRunning) {
    const ip = await getLocalIP();
    return `http://${ip}:${PORT}`;
  }

  onConfigReceived = callback;

  server.setup(PORT, (event) => {
    log.info(`Server status: ${event.status} - ${event.message}`);
  });

  server.route("/", "GET", async () => ({
    statusCode: 200,
    contentType: "text/html",
    body: CONFIG_PAGE_HTML,
  }));

  server.route("/api/config", "POST", async (request) => {
    try {
      const config: ProviderConfig = JSON.parse(request.body);
      if (!config.name || !config.baseUrl || !config.apiKey) {
        return {
          statusCode: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "All fields are required" }),
        };
      }
      onConfigReceived?.(config);
      return {
        statusCode: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      };
    } catch {
      return {
        statusCode: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid JSON" }),
      };
    }
  });

  server.route("/api/test", "POST", async (request) => {
    try {
      const { baseUrl, apiKey } = JSON.parse(request.body);
      if (!baseUrl || !apiKey) {
        return {
          statusCode: 400,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, error: "baseUrl and apiKey required" }),
        };
      }
      const url = baseUrl.replace(/\/$/, "") + "/models";
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (resp.ok) {
        return {
          statusCode: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        };
      }
      const text = await resp.text().catch(() => "");
      return {
        statusCode: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: `${resp.status} ${text.slice(0, 200)}` }),
      };
    } catch (err) {
      return {
        statusCode: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Unknown" }),
      };
    }
  });

  server.route("/api/test", "OPTIONS", async () => ({
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: "",
  }));

  // CORS preflight
  server.route("/api/config", "OPTIONS", async () => ({
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: "",
  }));

  server.start();
  isRunning = true;

  const ip = await getLocalIP();
  const url = `http://${ip}:${PORT}`;
  log.info(`Config server started at ${url}`);
  return url;
}

export function stopConfigServer() {
  if (!isRunning) return;
  server.stop();
  isRunning = false;
  onConfigReceived = null;
  log.info("Config server stopped");
}

async function getLocalIP(): Promise<string> {
  try {
    const ip = await Network.getIpAddressAsync();
    return ip;
  } catch {
    return "localhost";
  }
}
