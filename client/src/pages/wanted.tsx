import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type Game } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Star } from "lucide-react";

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

export default function WantedPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: games = [], isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games", "wanted"],
    queryFn: () =>
      fetch("/api/games?status=wanted", { headers: authHeader() }).then((r) => r.json()),
  });

  const searchOneMutation = useMutation({
    mutationFn: (gameId: string) =>
      fetch(`/api/games/${gameId}/search`, { method: "POST", headers: authHeader() }).then((r) => {
        if (!r.ok) throw new Error();
      }),
    onSuccess: () => toast({ title: "Search triggered" }),
    onError: () => toast({ title: "Search failed", variant: "destructive" }),
  });

  const searchAllMutation = useMutation({
    mutationFn: () =>
      Promise.all(
        games.map((g) =>
          fetch(`/api/games/${g.id}/search`, { method: "POST", headers: authHeader() })
        )
      ),
    onSuccess: () => {
      toast({ title: `Search triggered for ${games.length} games` });
      queryClient.invalidateQueries({ queryKey: ["/api/games", "wanted"] });
    },
    onError: () => toast({ title: "Search failed", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">Loading…</div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <Star className="w-8 h-8" />
        <p>No games in Wanted list.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <span className="text-sm text-muted-foreground">
          {games.length} game{games.length !== 1 ? "s" : ""} wanted
        </span>
        <Button
          size="sm"
          onClick={() => searchAllMutation.mutate()}
          disabled={searchAllMutation.isPending}
        >
          <Search className="w-4 h-4 mr-1" />
          Search All
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Platforms</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {games.map((game) => {
              const year = game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : null;
              return (
                <TableRow key={game.id}>
                  <TableCell className="font-medium">{game.title}</TableCell>
                  <TableCell className="text-muted-foreground">{year ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(game.platforms ?? []).slice(0, 3).map((p) => (
                        <Badge key={p} variant="outline" className="text-xs">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{game.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => searchOneMutation.mutate(game.id)}
                      disabled={searchOneMutation.isPending}
                    >
                      <Search className="w-3 h-3 mr-1" />
                      Search
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
