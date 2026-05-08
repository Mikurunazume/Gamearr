import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

interface HistoryItem {
  id: string;
  date: number;
  gameId: string;
  gameTitle: string;
  releaseName: string;
  indexer?: string;
  action: "grabbed" | "imported" | "failed" | "deleted";
  size?: number;
  detail?: string;
}

interface HistoryResponse {
  items: HistoryItem[];
  total: number;
  page: number;
  pages: number;
}

const ACTION_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  grabbed: "secondary",
  imported: "default",
  failed: "destructive",
  deleted: "outline",
};

export default function ActivityHistoryPage() {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const authHeader = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  const params = new URLSearchParams({ page: String(page), limit: "50" });
  if (search) params.set("search", search);
  if (actionFilter) params.set("action", actionFilter);

  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: ["/api/activity/history", page, search, actionFilter],
    queryFn: () =>
      fetch(`/api/activity/history?${params}`, { headers: authHeader }).then((r) => r.json()),
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filters */}
      <div className="flex items-center gap-3 p-4 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search release or game…"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex gap-1">
          {(["", "grabbed", "imported", "failed", "deleted"] as const).map((action) => (
            <Button
              key={action || "all"}
              variant={actionFilter === action ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setActionFilter(action);
                setPage(1);
              }}
            >
              {action || "All"}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading…
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Game</TableHead>
                <TableHead>Release</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(item.date).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <button
                      className="hover:underline font-medium text-left"
                      onClick={() => navigate(`/games/${item.gameId}`)}
                    >
                      {item.gameTitle}
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[240px] truncate">
                    {item.releaseName}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ACTION_COLORS[item.action] ?? "secondary"}>{item.action}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between p-4 border-t text-sm text-muted-foreground">
          <span>{data.total} records</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span>
              Page {data.page} / {data.pages}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
