import { Dashboard, ConnectionError, SessionList } from "./components/Dashboard";
import { useMonitor } from "./hooks";

export default function App() {
  const { health, usage, sessions, proxyStatus, loading, refresh } = useMonitor();

  if (!health.connected) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <ConnectionError error={health.error ?? "Unknown error"} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-5xl mx-auto">
      <Dashboard usage={usage} proxyStatus={proxyStatus} loading={loading} onRefresh={refresh} />
      <SessionList sessions={sessions} />
    </div>
  );
}