import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, RefreshCw } from "lucide-react";

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

interface SystemStatus {
  version: string;
  uptime: number;
  dbSizeBytes: number;
  lastAutoSearch: number | null;
  downloaderHealth: { name: string; ok: boolean }[];
}

interface SystemLog {
  lines: string[];
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function SystemPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: status, isLoading: statusLoading } = useQuery<SystemStatus>({
    queryKey: ["/api/system/status"],
    queryFn: () => fetch("/api/system/status", { headers: authHeader() }).then((r) => r.json()),
    refetchInterval: 30000,
  });

  const { data: logs } = useQuery<SystemLog>({
    queryKey: ["/api/system/logs"],
    queryFn: () =>
      fetch("/api/system/logs?limit=200", { headers: authHeader() }).then((r) => r.json()),
    refetchInterval: 5000,
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Tabs defaultValue="status" className="flex flex-col h-full">
        <div className="border-b px-6 pt-4">
          <TabsList>
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>
        </div>

        {/* Status tab */}
        <TabsContent value="status" className="flex-1 overflow-auto p-6 m-0">
          {statusLoading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : status ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Version</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-mono">{status.version}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Uptime</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-mono">{formatUptime(status.uptime)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Database Size</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-mono">{formatBytes(status.dbSizeBytes)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Last Auto-Search</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">
                    {status.lastAutoSearch
                      ? new Date(status.lastAutoSearch).toLocaleString()
                      : "Never"}
                  </p>
                </CardContent>
              </Card>

              {/* Downloader health */}
              {status.downloaderHealth.length > 0 && (
                <Card className="col-span-full md:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-sm">Download Clients</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3">
                      {status.downloaderHealth.map((d) => (
                        <div key={d.name} className="flex items-center gap-2">
                          {d.ok ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                          <span className="text-sm">{d.name}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </TabsContent>

        {/* Logs tab */}
        <TabsContent value="logs" className="flex-1 overflow-hidden m-0 flex flex-col">
          <div className="flex items-center gap-2 px-4 py-2 border-b">
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/system/logs"] })}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
            <span className="text-xs text-muted-foreground">
              Last {logs?.lines.length ?? 0} lines (auto-refreshes every 5s)
            </span>
          </div>
          <div className="flex-1 overflow-auto p-4 bg-black/20">
            <pre className="text-xs font-mono leading-5 whitespace-pre-wrap break-all">
              {(logs?.lines ?? []).join("\n") || "No logs available."}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
