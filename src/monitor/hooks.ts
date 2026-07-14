import { useState, useEffect, useCallback } from "react";
import { monitorApi, type UsageSummary, type SessionMeta, type ProxyStatus } from "./api";

interface HealthState {
  connected: boolean;
  error?: string;
}

export function useMonitor() {
  const [health, setHealth] = useState<HealthState>({ connected: false });
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [h, u, s, p] = await Promise.all([
        monitorApi.health(),
        monitorApi.usageSummary(),
        monitorApi.sessions(),
        monitorApi.proxyStatus(),
      ]);
      setHealth({ connected: h.status === "ok" });
      setUsage(u);
      setSessions(s);
      setProxyStatus(p);
    } catch (err) {
      setHealth({ connected: false, error: String(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { health, usage, sessions, proxyStatus, loading, refresh };
}