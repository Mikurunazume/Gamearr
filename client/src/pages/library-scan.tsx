import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScanSearch, Play, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { io } from "socket.io-client";
import type { RootFolder } from "@shared/schema";

interface ScanProgress {
  rootFolderId: string;
  rootFolderPath: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "completed" | "failed";
  totalCandidates: number;
  processedCandidates: number;
  matched: number;
  unmatched: number;
  errors: number;
  currentCandidate?: string;
  errorMessage?: string;
}

interface UnmatchedEntry {
  rootFolderId: string;
  rootFolderPath: string;
  folderName: string;
  absolutePath: string;
  candidates: Array<{ igdbId: number; name: string; releaseYear: number | null }>;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (res.status === 204 ? null : res.json()) as T;
}

export default function LibraryScanPage() {
  const { toast } = useToast();
  const [liveProgress, setLiveProgress] = useState<Map<string, ScanProgress>>(new Map());

  const { data: folders = [] } = useQuery<RootFolder[]>({
    queryKey: ["/api/root-folders"],
  });

  const { data: progressList = [], refetch: refetchProgress } = useQuery<ScanProgress[]>({
    queryKey: ["/api/library/scan/status"],
    refetchInterval: 3000,
  });

  const { data: unmatched = [], refetch: refetchUnmatched } = useQuery<UnmatchedEntry[]>({
    queryKey: ["/api/library/scan/unmatched"],
    refetchInterval: 5000,
  });

  // Live WebSocket progress for smoother UI updates between polls
  useEffect(() => {
    const token = localStorage.getItem("token");
    const socket = io({ auth: { token } });
    socket.on("library-scan-progress", (p: ScanProgress) => {
      setLiveProgress((prev) => new Map(prev).set(p.rootFolderId, p));
      if (p.status === "completed" || p.status === "failed") {
        queryClient.invalidateQueries({ queryKey: ["/api/library/scan/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/library/scan/unmatched"] });
      }
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  // Merge live progress with polled progress for the most up-to-date view
  const mergedProgress = new Map<string, ScanProgress>();
  for (const p of progressList) mergedProgress.set(p.rootFolderId, p);
  liveProgress.forEach((p, id) => mergedProgress.set(id, p));
  const progressArray = Array.from(mergedProgress.values());

  const scanAllMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ accepted: boolean }>("/api/library/scan", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      toast({ title: "Scan started", description: "Scanning every enabled root folder…" });
      refetchProgress();
    },
  });

  const scanOneMutation = useMutation({
    mutationFn: (rootFolderId: string) =>
      apiFetch("/api/library/scan", {
        method: "POST",
        body: JSON.stringify({ rootFolderId }),
      }),
    onSuccess: () => refetchProgress(),
  });

  const matchMutation = useMutation({
    mutationFn: (payload: { rootFolderId: string; folderName: string; igdbId: number }) =>
      apiFetch<{ gameId: string; filesAdded: number }>("/api/library/scan/unmatched/match", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      toast({
        title: "Matched",
        description: `Game added, ${data.filesAdded} file(s) indexed.`,
      });
      refetchUnmatched();
    },
    onError: (err: unknown) =>
      toast({
        title: "Match failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      }),
  });

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ScanSearch className="h-6 w-6" />
            Library Scan
          </h1>
          <p className="text-muted-foreground text-sm">
            Scan your root folders and match folders against IGDB.
          </p>
        </div>
        <Button onClick={() => scanAllMutation.mutate()} disabled={scanAllMutation.isPending}>
          <Play className="h-4 w-4 mr-2" />
          Scan all enabled folders
        </Button>
      </div>

      <Tabs defaultValue="progress">
        <TabsList>
          <TabsTrigger value="progress">
            Progress ({progressArray.filter((p) => p.status === "running").length} running)
          </TabsTrigger>
          <TabsTrigger value="unmatched">Unmatched ({unmatched.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="progress" className="space-y-4 mt-4">
          {folders.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Add a root folder first, then run a scan.
              </CardContent>
            </Card>
          )}
          {folders.map((folder) => {
            const p = mergedProgress.get(folder.id);
            const running = p?.status === "running";
            const pct =
              p && p.totalCandidates > 0
                ? Math.round((p.processedCandidates / p.totalCandidates) * 100)
                : 0;
            return (
              <Card key={folder.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{folder.label}</CardTitle>
                      <CardDescription className="font-mono text-xs">{folder.path}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={running || !folder.enabled}
                        onClick={() => scanOneMutation.mutate(folder.id)}
                      >
                        <RefreshCw className={`h-4 w-4 mr-1 ${running ? "animate-spin" : ""}`} />
                        {running ? "Scanning…" : "Scan now"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {p ? (
                    <>
                      <Progress value={pct} />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          {p.processedCandidates} / {p.totalCandidates} folders
                          {p.currentCandidate ? ` · current: ${p.currentCandidate}` : ""}
                        </span>
                        <span className="flex gap-2">
                          <Badge variant="outline" className="text-green-500 border-green-500/40">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> {p.matched} matched
                          </Badge>
                          <Badge variant="outline" className="text-yellow-500 border-yellow-500/40">
                            <AlertTriangle className="h-3 w-3 mr-1" /> {p.unmatched} unmatched
                          </Badge>
                          {p.errors > 0 && <Badge variant="destructive">{p.errors} errors</Badge>}
                        </span>
                      </div>
                      {p.status === "failed" && p.errorMessage && (
                        <p className="text-xs text-destructive">{p.errorMessage}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No scan history yet.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="unmatched" className="space-y-3 mt-4">
          {unmatched.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nothing to resolve. Every scanned folder either matched IGDB or was skipped.
              </CardContent>
            </Card>
          ) : (
            unmatched.map((u) => (
              <Card key={`${u.rootFolderId}:${u.folderName}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{u.folderName}</CardTitle>
                  <CardDescription className="font-mono text-xs">{u.absolutePath}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {u.candidates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No IGDB candidates found. Try renaming the folder.
                    </p>
                  ) : (
                    u.candidates.map((c) => (
                      <div
                        key={c.igdbId}
                        className="flex items-center justify-between rounded border p-2"
                      >
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          {c.releaseYear && (
                            <p className="text-xs text-muted-foreground">{c.releaseYear}</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={() =>
                            matchMutation.mutate({
                              rootFolderId: u.rootFolderId,
                              folderName: u.folderName,
                              igdbId: c.igdbId,
                            })
                          }
                          disabled={matchMutation.isPending}
                        >
                          Use this
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
