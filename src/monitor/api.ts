const BASE_URL = "http://127.0.0.1:15722/api";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface UsageSummary {
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  request_count: number;
  success_rate: number;
  cache_hit_rate: number;
  real_total_tokens: number;
}

export interface SessionMeta {
  providerId: string;
  sessionId: string;
  sourcePath?: string;
  projectDir?: string;
  createdAt: string;
  lastActiveAt?: string;
  messageCount?: number;
}

export interface ProxyStatus {
  running: boolean;
  address: string | null;
  port: number | null;
}

export const monitorApi = {
  health: () => fetchJson<{ status: string }>("/health"),
  usageSummary: () => fetchJson<UsageSummary>("/usage/summary"),
  sessions: () => fetchJson<SessionMeta[]>("/sessions"),
  sessionMessages: (provider: string, path: string) =>
    fetchJson(`/sessions/${encodeURIComponent(provider)}/${encodeURIComponent(path)}`),
  proxyStatus: () => fetchJson<ProxyStatus>("/proxy/status"),
};