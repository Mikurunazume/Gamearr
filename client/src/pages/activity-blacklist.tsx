import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Ban } from "lucide-react";
import { useState } from "react";

interface BlacklistEntry {
  id: string;
  releaseName: string;
  gameId?: string;
  gameTitle?: string;
  reason?: string;
  createdAt: number;
}

export default function ActivityBlacklistPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showClearDialog, setShowClearDialog] = useState(false);
  const authHeaders = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  const { data: entries = [], isLoading } = useQuery<BlacklistEntry[]>({
    queryKey: ["/api/activity/blacklist"],
    queryFn: () => fetch("/api/activity/blacklist", { headers: authHeaders }).then((r) => r.json()),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/activity/blacklist/${id}`, { method: "DELETE", headers: authHeaders }).then(
        (r) => {
          if (!r.ok) throw new Error();
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity/blacklist"] });
      toast({ title: "Entry removed from blacklist" });
    },
    onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
  });

  const clearMutation = useMutation({
    mutationFn: () =>
      fetch("/api/activity/blacklist", { method: "DELETE", headers: authHeaders }).then((r) => {
        if (!r.ok) throw new Error();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity/blacklist"] });
      toast({ title: "Blacklist cleared" });
      setShowClearDialog(false);
    },
    onError: () => toast({ title: "Failed to clear blacklist", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">Loading…</div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Ban className="w-4 h-4" />
          <span>
            {entries.length} blacklisted release{entries.length !== 1 ? "s" : ""}
          </span>
        </div>
        {entries.length > 0 && (
          <Button variant="destructive" size="sm" onClick={() => setShowClearDialog(true)}>
            Clear All
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground">
          No blacklisted releases.
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Release</TableHead>
                <TableHead>Game</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-xs">{entry.releaseName}</TableCell>
                  <TableCell>
                    {entry.gameId ? (
                      <button
                        className="hover:underline text-left"
                        onClick={() => navigate(`/games/${entry.gameId}`)}
                      >
                        {entry.gameTitle ?? entry.gameId}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {entry.reason ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMutation.mutate(entry.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear entire blacklist?</AlertDialogTitle>
            <AlertDialogDescription>
              All {entries.length} blacklisted releases will be re-authorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => clearMutation.mutate()}
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
