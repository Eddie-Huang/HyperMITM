const API_BASE = "/api/monitor";

export interface MonitorStatus {
  status: string;
  version: string;
}

export interface UsageSummary {
  totalRequests: number;
  totalCost: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  successRate: number;
  realTotalTokens: number;
  cacheHitRate: number;
}

export interface UsageSummaryByApp {
  appType: string;
  summary: UsageSummary;
}

export interface DailyStats {
  date: string;
  requestCount: number;
  totalCost: string;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
}

export interface ProviderStats {
  providerId: string;
  providerName: string;
  requestCount: number;
  totalTokens: number;
  totalCost: string;
  successRate: number;
  avgLatencyMs: number;
}

export interface ModelStats {
  model: string;
  requestCount: number;
  totalTokens: number;
  totalCost: string;
  avgCostPerRequest: string;
}

export interface SessionMeta {
  sessionId: string;
  providerId: string;
  title?: string;
  projectDir?: string;
  appType?: string;
  ts?: number;
  sourcePath?: string;
}

export interface SessionMessage {
  role: string;
  content: string;
  parts?: MessagePart[];
  ts?: number;
}

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "toolUse"; id: string; name: string; input: string }
  | { type: "toolResult"; toolUseId: string; content: string };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export const api = {
  status: () => fetchJson<MonitorStatus>(`${API_BASE}/status`),

  usageSummary: (params?: {
    startDate?: number;
    endDate?: number;
    appType?: string;
    providerName?: string;
    model?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.startDate) q.set("startDate", String(params.startDate));
    if (params?.endDate) q.set("endDate", String(params.endDate));
    if (params?.appType) q.set("appType", params.appType);
    if (params?.providerName) q.set("providerName", params.providerName);
    if (params?.model) q.set("model", params.model);
    return fetchJson<UsageSummary>(`${API_BASE}/usage/summary?${q}`);
  },

  usageByApp: (params?: {
    startDate?: number;
    endDate?: number;
    providerName?: string;
    model?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.startDate) q.set("startDate", String(params.startDate));
    if (params?.endDate) q.set("endDate", String(params.endDate));
    if (params?.providerName) q.set("providerName", params.providerName);
    if (params?.model) q.set("model", params.model);
    return fetchJson<UsageSummaryByApp[]>(`${API_BASE}/usage/by-app?${q}`);
  },

  dailyTrends: (params?: {
    startDate?: number;
    endDate?: number;
    appType?: string;
    providerName?: string;
    model?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.startDate) q.set("startDate", String(params.startDate));
    if (params?.endDate) q.set("endDate", String(params.endDate));
    if (params?.appType) q.set("appType", params.appType);
    if (params?.providerName) q.set("providerName", params.providerName);
    if (params?.model) q.set("model", params.model);
    return fetchJson<DailyStats[]>(`${API_BASE}/usage/trends?${q}`);
  },

  providerStats: (params?: {
    startDate?: number;
    endDate?: number;
    appType?: string;
    providerName?: string;
    model?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.startDate) q.set("startDate", String(params.startDate));
    if (params?.endDate) q.set("endDate", String(params.endDate));
    if (params?.appType) q.set("appType", params.appType);
    if (params?.providerName) q.set("providerName", params.providerName);
    if (params?.model) q.set("model", params.model);
    return fetchJson<ProviderStats[]>(`${API_BASE}/usage/provider-stats?${q}`);
  },

  modelStats: (params?: {
    startDate?: number;
    endDate?: number;
    appType?: string;
    providerName?: string;
    model?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.startDate) q.set("startDate", String(params.startDate));
    if (params?.endDate) q.set("endDate", String(params.endDate));
    if (params?.appType) q.set("appType", params.appType);
    if (params?.providerName) q.set("providerName", params.providerName);
    if (params?.model) q.set("model", params.model);
    return fetchJson<ModelStats[]>(`${API_BASE}/usage/model-stats?${q}`);
  },

  sessions: () =>
    fetchJson<SessionMeta[]>(`${API_BASE}/sessions/list`),

  sessionMessages: (providerId: string, sourcePath: string) => {
    const q = new URLSearchParams({ providerId, sourcePath });
    return fetchJson<SessionMessage[]>(`${API_BASE}/sessions/messages?${q}`);
  },
};
