/**
 * Persona Market Service
 *
 * Fetches community personas from a remote JSON source (GitHub Raw).
 * Caches the result in localStorage for 24 hours so offline usage
 * and repeat visits don't hit the network every time.
 */

import { appFetch } from "../lib/http";

const CACHE_KEY = "persona_market_cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

/** URL to the hosted personas list on GitHub (updated without releasing). */
const REMOTE_URL =
  "https://raw.githubusercontent.com/llt22/talkio/main/public/personas.json";
export interface MarketPersonaParams {
  temperature?: number;
  topP?: number;
}

export interface MarketPersona {
  name: string;
  icon: string;
  /** category key: "productivity" | "creative" | "learning" | "fun" | "technical" */
  category: string;
  description: string;
  systemPrompt: string;
  params?: MarketPersonaParams;
}

export interface PersonaMarketData {
  version: number;
  updatedAt: string;
  personas: MarketPersona[];
}

interface CacheEntry {
  fetchedAt: number;
  data: PersonaMarketData;
}

function readCache(): PersonaMarketData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(data: PersonaMarketData): void {
  try {
    const entry: CacheEntry = { fetchedAt: Date.now(), data };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Quota exceeded or private mode — silently ignore
  }
}

async function fetchFromUrl(url: string): Promise<PersonaMarketData> {
  const res = await appFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: PersonaMarketData = await res.json();
  if (!Array.isArray(data.personas)) throw new Error("Invalid format");
  return data;
}

/**
 * Load personas from remote, with localStorage cache (24 h TTL).
 * Falls back to the bundled personas.json when the remote is unreachable.
 */
export async function fetchPersonaMarket(): Promise<PersonaMarketData> {
  const cached = readCache();
  if (cached) return cached;

  let data: PersonaMarketData;
  try {
    data = await fetchFromUrl(REMOTE_URL);
  } catch {
    // Network unavailable or remote not yet published — use local bundled copy
    // Use globalThis.fetch (not appFetch) because local assets are served by
    // the webview and accessible via same-origin fetch on both desktop and mobile.
    try {
      const res = await globalThis.fetch('/personas.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const local: PersonaMarketData = await res.json();
      if (!Array.isArray(local.personas)) throw new Error("Invalid format");
      data = local;
    } catch {
      data = { version: 0, updatedAt: "", personas: [] };
    }
  }

  writeCache(data);
  return data;
}

/** Invalidate the local cache (e.g. pull-to-refresh) */
export function invalidatePersonaMarketCache(): void {
  localStorage.removeItem(CACHE_KEY);
}
