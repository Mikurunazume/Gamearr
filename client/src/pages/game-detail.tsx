import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type Game, type GameFile } from "@shared/schema";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, Search, Edit, Trash2, Star } from "lucide-react";
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
import { useState } from "react";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: game, isLoading } = useQuery<Game>({
    queryKey: [`/api/games/${id}`],
    queryFn: () =>
      fetch(`/api/games/${id}`, { headers: authHeaders() }).then((r) => {
        if (!r.ok) throw new Error("Game not found");
        return r.json();
      }),
  });

  const { data: files = [] } = useQuery<GameFile[]>({
    queryKey: [`/api/games/${id}/files`],
    queryFn: () =>
      fetch(`/api/games/${id}/files`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!game,
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/games/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      }).then((r) => {
        if (!r.ok) throw new Error("Delete failed");
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      navigate("/library");
    },
    onError: () => toast({ title: "Failed to delete game", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">Loading…</div>
    );
  }

  if (!game) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">Game not found</p>
        <Button variant="outline" onClick={() => navigate("/library")}>
          Back to Library
        </Button>
      </div>
    );
  }

  const year = game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : null;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-6 pt-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/library")}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Library
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 px-6 pb-6 flex-1 min-h-0">
        {/* Left column — cover + action buttons */}
        <div className="lg:w-[280px] flex-shrink-0 flex flex-col gap-4">
          {game.coverUrl ? (
            <img
              src={game.coverUrl}
              alt={game.title}
              className="w-full rounded-lg object-cover shadow-md"
            />
          ) : (
            <div className="w-full aspect-[3/4] rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
              No cover
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" className="justify-start gap-2">
              <Search className="w-4 h-4" /> Search
            </Button>
            <Button variant="outline" size="sm" className="justify-start gap-2">
              <RefreshCw className="w-4 h-4" /> Refresh Metadata
            </Button>
            <Button variant="outline" size="sm" className="justify-start gap-2">
              <Edit className="w-4 h-4" /> Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="justify-start gap-2 text-destructive hover:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          </div>
        </div>

        {/* Right column — metadata + tabs */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{game.title}</h1>
              {year && <span className="text-muted-foreground text-lg">{year}</span>}
              {game.rating && (
                <div className="flex items-center gap-1 text-yellow-500">
                  <Star className="w-4 h-4 fill-current" />
                  <span className="text-sm">{(game.rating / 10).toFixed(1)}</span>
                </div>
              )}
            </div>
            {game.genres && game.genres.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {game.genres.map((g) => (
                  <Badge key={g} variant="secondary">
                    {g}
                  </Badge>
                ))}
              </div>
            )}
            {game.platforms && game.platforms.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {game.platforms.map((p) => (
                  <Badge key={p} variant="outline">
                    {p}
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
              <span>
                Status: <Badge>{game.status}</Badge>
              </span>
            </div>
          </div>

          <Tabs defaultValue="files" className="flex-1 flex flex-col">
            <TabsList className="w-fit">
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="search">Manual Search</TabsTrigger>
            </TabsList>

            <TabsContent value="files" className="flex-1 overflow-auto">
              {files.length === 0 ? (
                <p className="text-muted-foreground text-sm pt-4">
                  No files tracked for this game.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Path</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-mono text-xs">{f.relativePath}</TableCell>
                        <TableCell>{formatBytes(f.sizeBytes)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{f.fileType}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="history" className="flex-1 overflow-auto">
              <p className="text-muted-foreground text-sm pt-4">
                Download history for this game will appear here.
              </p>
            </TabsContent>

            <TabsContent value="search" className="flex-1 overflow-auto">
              <p className="text-muted-foreground text-sm pt-4">
                Manual search for <strong>{game.title}</strong> coming in a future update.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {game.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the game from Gamearr. Files on disk are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
