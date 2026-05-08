import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Ban, X } from "lucide-react";

interface QueueItem {
  downloadId: string;
  gameId?: string;
  gameTitle?: string;
  releaseName: string;
  size?: number;
  progress: number;
  speed?: number;
  seeders?: number;
  client: string;
  eta?: number;
  status: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatEta(seconds?: number): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatSpeed(bytesPerSec?: number): string {
  if (!bytesPerSec) return "—";
  return `${(bytesPerSec / 1024 ** 2).toFixed(1)} MB/s`;
}

export default function ActivityQueuePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authHeaders = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  const { data: queue = [], isLoading } = useQuery<QueueItem[]>({
    queryKey: ["/api/activity/queue"],
    queryFn: () => fetch("/api/activity/queue", { headers: authHeaders }).then((r) => r.json()),
    refetchInterval: 10000,
  });

  const blacklistMutation = useMutation({
    mutationFn: ({ releaseName, gameId }: { releaseName: string; gameId?: string }) =>
      fetch("/api/activity/blacklist", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ releaseName, gameId, reason: "Manually blacklisted from queue" }),
      }).then((r) => {
        if (!r.ok) throw new Error("Blacklist failed");
      }),
    onSuccess: () => {
      toast({ title: "Release blacklisted" });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/queue"] });
    },
    onError: () => toast({ title: "Failed to blacklist", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <X className="w-8 h-8" />
        <p>No active downloads.</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Game</TableHead>
            <TableHead>Release</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Speed</TableHead>
            <TableHead>Seeders</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>ETA</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {queue.map((item) => (
            <TableRow key={item.downloadId}>
              <TableCell>
                {item.gameId ? (
                  <button
                    className="text-left hover:underline font-medium"
                    onClick={() => navigate(`/games/${item.gameId}`)}
                  >
                    {item.gameTitle ?? "Unknown"}
                  </button>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="font-mono text-xs max-w-[200px] truncate">
                {item.releaseName}
              </TableCell>
              <TableCell>{formatBytes(item.size)}</TableCell>
              <TableCell className="min-w-[120px]">
                <div className="flex items-center gap-2">
                  <Progress value={item.progress} className="h-2 flex-1" />
                  <span className="text-xs text-muted-foreground">{item.progress.toFixed(0)}%</span>
                </div>
              </TableCell>
              <TableCell>{formatSpeed(item.speed)}</TableCell>
              <TableCell>{item.seeders ?? "—"}</TableCell>
              <TableCell>{item.client}</TableCell>
              <TableCell>{formatEta(item.eta)}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Blacklist"
                  onClick={() =>
                    blacklistMutation.mutate({
                      releaseName: item.releaseName,
                      gameId: item.gameId,
                    })
                  }
                >
                  <Ban className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
