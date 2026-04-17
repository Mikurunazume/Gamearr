import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Plus, Edit, Trash2, Activity, CheckCircle2, XCircle, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRootFolderSchema, type RootFolder, type InsertRootFolder } from "@shared/schema";
import { asZodType } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function diskUsagePercent(folder: RootFolder): number | null {
  if (!folder.diskTotalBytes || !folder.diskFreeBytes) return null;
  const used = folder.diskTotalBytes - folder.diskFreeBytes;
  return Math.max(0, Math.min(100, (used / folder.diskTotalBytes) * 100));
}

async function apiFetch(url: string, init?: RequestInit) {
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
  return res.status === 204 ? null : res.json();
}

export default function RootFoldersPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RootFolder | null>(null);
  const [probingId, setProbingId] = useState<string | null>(null);

  const { data: folders = [], isLoading } = useQuery<RootFolder[]>({
    queryKey: ["/api/root-folders"],
    refetchInterval: 60_000, // refresh disk stats once a minute in the UI
  });

  const form = useForm<InsertRootFolder>({
    resolver: zodResolver(asZodType<InsertRootFolder>(insertRootFolderSchema)),
    defaultValues: { path: "", label: "", enabled: true },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ path: "", label: "", enabled: true });
    setDialogOpen(true);
  };

  const openEdit = (folder: RootFolder) => {
    setEditing(folder);
    form.reset({ path: folder.path, label: folder.label, enabled: folder.enabled });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: InsertRootFolder) => {
      if (editing) {
        return apiFetch(`/api/root-folders/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(values),
        });
      }
      return apiFetch(`/api/root-folders`, {
        method: "POST",
        body: JSON.stringify(values),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/root-folders"] });
      setDialogOpen(false);
      toast({
        title: editing ? "Root folder updated" : "Root folder added",
        description: editing ? editing.path : form.getValues("path"),
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiFetch(`/api/root-folders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/root-folders"] });
      toast({ title: "Root folder deleted" });
    },
  });

  const healthMutation = useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/api/root-folders/${id}/health-check`, { method: "POST" }),
    onMutate: (id) => setProbingId(id),
    onSettled: () => setProbingId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/root-folders"] }),
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: async (folder: RootFolder) =>
      apiFetch(`/api/root-folders/${folder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !folder.enabled }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/root-folders"] }),
  });

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FolderTree className="h-6 w-6" />
            Root Folders
          </h1>
          <p className="text-muted-foreground text-sm">
            Library paths where Gamearr scans for games and imports new downloads.
          </p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-root-folder">
          <Plus className="h-4 w-4 mr-2" />
          Add root folder
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : folders.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <FolderTree className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-lg font-medium">No root folder configured</p>
            <p className="text-sm text-muted-foreground mb-4">
              Add your first library path to enable scanning and import.
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add root folder
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {folders.map((folder) => {
            const pct = diskUsagePercent(folder);
            return (
              <Card key={folder.id} data-testid={`card-root-folder-${folder.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        {folder.label}
                        {folder.accessible ? (
                          <Badge variant="outline" className="text-green-500 border-green-500/40">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Accessible
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-500 border-red-500/40">
                            <XCircle className="h-3 w-3 mr-1" />
                            Unreachable
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="font-mono text-xs break-all">
                        {folder.path}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={folder.enabled}
                        onCheckedChange={() => toggleEnabledMutation.mutate(folder)}
                        aria-label="Toggle enabled"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={probingId === folder.id}
                        onClick={() => healthMutation.mutate(folder.id)}
                        title="Run health check"
                      >
                        <Activity className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(folder)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete root folder "${folder.label}"?`))
                            deleteMutation.mutate(folder.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pct !== null ? (
                    <>
                      <Progress value={pct} />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          {formatBytes(
                            folder.diskTotalBytes && folder.diskFreeBytes
                              ? folder.diskTotalBytes - folder.diskFreeBytes
                              : null
                          )}{" "}
                          used
                        </span>
                        <span>
                          {formatBytes(folder.diskFreeBytes)} free of{" "}
                          {formatBytes(folder.diskTotalBytes)} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Disk stats unavailable on this platform.
                    </p>
                  )}
                  {folder.lastHealthCheck && (
                    <p className="text-xs text-muted-foreground">
                      Last check: {new Date(folder.lastHealthCheck).toLocaleString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit root folder" : "Add root folder"}</DialogTitle>
            <DialogDescription>
              Absolute path on the server (inside the container, e.g. <code>/games</code> or{" "}
              <code>/mnt/GAMES</code>).
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="path"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Path</FormLabel>
                    <FormControl>
                      <Input placeholder="/mnt/GAMES" {...field} />
                    </FormControl>
                    <FormDescription>
                      Must be an absolute path. The server process needs read+write access.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Label</FormLabel>
                    <FormControl>
                      <Input placeholder="Main Library" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDialogOpen(false)}
                  disabled={saveMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving…" : editing ? "Save" : "Add root folder"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
