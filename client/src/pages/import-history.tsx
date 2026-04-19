import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Download, CheckCircle2, XCircle, Loader2, RotateCcw, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import type { ImportTask } from "@shared/schema";

type StatusFilter = "all" | "pending" | "in_progress" | "completed" | "failed";

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

function StatusBadge({ status }: { status: string }) {
  if (status === "completed")
    return (
      <Badge variant="outline" className="text-green-500 border-green-500/40">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Completed
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge variant="outline" className="text-red-500 border-red-500/40">
        <XCircle className="h-3 w-3 mr-1" />
        Failed
      </Badge>
    );
  if (status === "in_progress")
    return (
      <Badge variant="outline" className="text-blue-500 border-blue-500/40">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Importing
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <Clock className="h-3 w-3 mr-1" />
      Pending
    </Badge>
  );
}

export default function ImportHistoryPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<StatusFilter>("all");

  const { data: tasks = [], isLoading } = useQuery<ImportTask[]>({
    queryKey: ["/api/import/tasks", filter],
    queryFn: () =>
      apiFetch<ImportTask[]>(
        filter === "all" ? "/api/import/tasks" : `/api/import/tasks?status=${filter}`
      ),
    refetchInterval: 4000,
  });

  const counts = useMemo(() => {
    const base = { all: 0, pending: 0, in_progress: 0, completed: 0, failed: 0 };
    for (const t of tasks) {
      base.all += 1;
      if (t.status in base) {
        base[t.status as keyof typeof base] += 1;
      }
    }
    return base;
  }, [tasks]);

  const retry = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/import/tasks/${id}/retry`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/import/tasks"] });
      toast({ title: "Import retry queued" });
    },
    onError: (err: unknown) =>
      toast({
        title: "Retry failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      }),
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/import/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/import/tasks"] });
      toast({ title: "Import task dismissed" });
    },
  });

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Download className="h-6 w-6" />
          Import History
        </h1>
        <p className="text-muted-foreground text-sm">
          Post-download imports — move, hardlink, copy or symlink from the downloader into your root
          folders.
        </p>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
          <TabsTrigger value="in_progress">Running ({counts.in_progress})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({counts.completed})</TabsTrigger>
          <TabsTrigger value="failed">Failed ({counts.failed})</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Download className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-lg font-medium">No import tasks yet</p>
            <p className="text-sm text-muted-foreground">
              Imports will appear here when a download completes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => (
            <Card key={task.id} data-testid={`card-import-task-${task.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      <span className="truncate">{task.targetRelativePath || "(unresolved)"}</span>
                      <StatusBadge status={task.status} />
                      <Badge variant="secondary" className="uppercase text-xs">
                        {task.strategy}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="font-mono text-xs break-all">
                      {task.sourcePath || "(source unknown)"}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {task.status === "failed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retry.mutate(task.id)}
                        disabled={retry.isPending}
                        data-testid={`button-retry-${task.id}`}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Retry
                      </Button>
                    )}
                    {task.status !== "in_progress" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Dismiss this import task?")) dismiss.mutate(task.id);
                        }}
                        data-testid={`button-dismiss-${task.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              {(task.errorMessage || task.completedAt) && (
                <CardContent className="pt-0 space-y-1">
                  {task.errorMessage && (
                    <p className="text-xs text-red-500 break-words">{task.errorMessage}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Created {task.createdAt ? new Date(task.createdAt).toLocaleString() : "—"}
                    {task.completedAt &&
                      ` · ${task.status === "completed" ? "completed" : "finished"} ${new Date(task.completedAt).toLocaleString()}`}
                  </p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
