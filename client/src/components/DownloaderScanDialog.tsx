import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Loader2, ScanSearch, PackageCheck, Download, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import type { Downloader } from "@shared/schema";

interface ScanItem {
  id: string;
  name: string;
  cleanTitle: string;
  status: string;
  progress: number;
  downloadHash: string;
  downloadType: "torrent" | "usenet";
  alreadyInLibrary: boolean;
  existingGameId?: string;
}

interface IgdbSearchResult {
  id: number;
  name: string;
  cover?: { url: string };
  first_release_date?: number;
  summary?: string;
  platforms?: Array<{ name: string }>;
  genres?: Array<{ name: string }>;
  involved_companies?: Array<{
    developer?: boolean;
    publisher?: boolean;
    company?: { name: string };
  }>;
  screenshots?: Array<{ url: string }>;
  rating?: number;
}

interface RowState {
  checked: boolean;
  cleanTitle: string;
}

interface Props {
  downloader: Downloader;
  open: boolean;
  onClose: () => void;
}

function IgdbMatchCell({ title }: { title: string }) {
  const { data, isFetching } = useQuery<IgdbSearchResult[]>({
    queryKey: ["/api/igdb/search", title],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: title.trim().length > 0,
    staleTime: 5 * 60 * 1000,
  });

  if (isFetching) {
    return (
      <span className="flex items-center gap-1 text-muted-foreground text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Searching…
      </span>
    );
  }

  const match = data?.[0];
  if (!match) {
    return <span className="text-muted-foreground text-xs">No match</span>;
  }

  const coverUrl = match.cover?.url?.replace("t_thumb", "t_cover_small");

  return (
    <div className="flex items-center gap-2">
      {coverUrl && <img src={coverUrl} alt={match.name} className="h-8 w-6 object-cover rounded" />}
      <span className="text-xs truncate max-w-[140px]" title={match.name}>
        {match.name}
      </span>
    </div>
  );
}

export default function DownloaderScanDialog({ downloader, open, onClose }: Props) {
  const { toast } = useToast();
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [igdbDataCache, setIgdbDataCache] = useState<Record<string, IgdbSearchResult | null>>({});

  const {
    data: scanData,
    isFetching: isScanning,
    error: scanError,
    refetch,
  } = useQuery<{ downloader: { id: string; name: string }; items: ScanItem[] }>({
    queryKey: [`/api/downloaders/${downloader.id}/scan`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: open,
    staleTime: 0,
  });

  const items = scanData?.items ?? [];

  // Initialize row states when items load
  const effectiveRowStates = useMemo(() => {
    const states: Record<string, RowState> = {};
    for (const item of items) {
      states[item.id] = rowStates[item.id] ?? {
        checked: !item.alreadyInLibrary,
        cleanTitle: item.cleanTitle,
      };
    }
    return states;
  }, [items, rowStates]);

  const selectedItems = useMemo(
    () => items.filter((item) => effectiveRowStates[item.id]?.checked),
    [items, effectiveRowStates]
  );

  const toggleRow = useCallback((id: string, checked: boolean) => {
    setRowStates((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { cleanTitle: "" }), checked },
    }));
  }, []);

  const updateTitle = useCallback((id: string, cleanTitle: string) => {
    setRowStates((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { checked: true }), cleanTitle },
    }));
  }, []);

  const toggleAll = useCallback(
    (checked: boolean) => {
      const updates: Record<string, RowState> = {};
      for (const item of items) {
        if (item.alreadyInLibrary) continue;
        updates[item.id] = {
          ...(effectiveRowStates[item.id] ?? { cleanTitle: item.cleanTitle }),
          checked,
        };
      }
      setRowStates((prev) => ({ ...prev, ...updates }));
    },
    [items, effectiveRowStates]
  );

  const importMutation = useMutation({
    mutationFn: async () => {
      // Collect IGDB data for selected items by querying current cache
      const importItems = await Promise.all(
        selectedItems.map(async (item) => {
          const title = effectiveRowStates[item.id]?.cleanTitle ?? item.cleanTitle;
          let igdbGameData:
            | {
                title: string;
                igdbId: number;
                coverUrl?: string;
                releaseDate?: string;
                summary?: string;
                platforms?: string[];
                genres?: string[];
                publishers?: string[];
                developers?: string[];
                screenshots?: string[];
                rating?: number;
              }
            | undefined = undefined;
          let igdbId: number | undefined;

          try {
            const res = await apiRequest(
              "GET",
              `/api/igdb/search?q=${encodeURIComponent(title)}&limit=1`
            );
            const results: IgdbSearchResult[] = await res.json();
            const match = results?.[0];
            if (match) {
              igdbId = match.id;
              const coverUrl = match.cover?.url?.replace("t_thumb", "t_cover_big");
              igdbGameData = {
                title: match.name,
                igdbId: match.id,
                coverUrl,
                releaseDate: match.first_release_date
                  ? new Date(match.first_release_date * 1000).toISOString().split("T")[0]
                  : undefined,
                summary: match.summary,
                platforms: match.platforms?.map((p) => p.name),
                genres: match.genres?.map((g) => g.name),
                publishers: match.involved_companies
                  ?.filter((ic) => ic.publisher)
                  .map((ic) => ic.company?.name)
                  .filter(Boolean) as string[],
                developers: match.involved_companies
                  ?.filter((ic) => ic.developer)
                  .map((ic) => ic.company?.name)
                  .filter(Boolean) as string[],
                screenshots: match.screenshots?.map((s) =>
                  s.url.replace("t_thumb", "t_screenshot_big")
                ),
                rating: match.rating,
              };
            }
          } catch {
            // No IGDB match, import with title only
          }

          return {
            downloadId: item.id,
            downloadHash: item.downloadHash,
            downloadName: item.name,
            downloadType: item.downloadType,
            igdbId,
            igdbGameData,
            customTitle: title,
            status: item.status,
            progress: item.progress,
          };
        })
      );

      const res = await apiRequest("POST", `/api/downloaders/${downloader.id}/import`, {
        items: importItems,
      });
      return res.json() as Promise<{ imported: number; skipped: number; errors: string[] }>;
    },
    onSuccess: (result) => {
      const parts = [`${result.imported} game(s) imported`];
      if (result.skipped > 0) parts.push(`${result.skipped} skipped (already in library)`);
      if (result.errors.length > 0) parts.push(`${result.errors.length} error(s)`);
      toast({
        title: "Import complete",
        description: parts.join(", "),
        variant: result.errors.length > 0 ? "destructive" : "default",
      });
      if (result.imported > 0) {
        onClose();
      }
    },
    onError: (error) => {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const allSelectableChecked =
    items.filter((i) => !i.alreadyInLibrary).length > 0 &&
    items.filter((i) => !i.alreadyInLibrary).every((i) => effectiveRowStates[i.id]?.checked);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanSearch className="h-5 w-5" />
            Scan Downloads — {downloader.name}
          </DialogTitle>
          <DialogDescription>
            Select downloads to import into your game library. Clean titles are used to match games
            on IGDB — edit them if needed.
          </DialogDescription>
        </DialogHeader>

        {isScanning && (
          <div className="flex items-center justify-center py-12 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">Scanning downloader…</span>
          </div>
        )}

        {scanError && !isScanning && (
          <div className="flex items-center gap-2 py-8 text-destructive justify-center">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to scan downloader. Please check the connection.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isScanning && !scanError && items.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            No downloads found on this downloader.
          </div>
        )}

        {!isScanning && !scanError && items.length > 0 && (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-3 pb-2 border-b">
              <Checkbox
                id="select-all"
                checked={allSelectableChecked}
                onCheckedChange={(checked) => toggleAll(!!checked)}
                aria-label="Select all importable downloads"
              />
              <label
                htmlFor="select-all"
                className="text-sm text-muted-foreground select-none cursor-pointer"
              >
                {selectedItems.length} / {items.filter((i) => !i.alreadyInLibrary).length} selected
              </label>
            </div>

            {/* Items list */}
            <ScrollArea className="flex-1 min-h-0 max-h-[50vh]">
              <div className="space-y-2 pr-2">
                {items.map((item) => {
                  const state = effectiveRowStates[item.id];
                  const cleanTitle = state?.cleanTitle ?? item.cleanTitle;
                  const isDisabled = item.alreadyInLibrary;

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        isDisabled ? "opacity-50 bg-muted/30" : "bg-card"
                      }`}
                    >
                      <Checkbox
                        checked={state?.checked ?? false}
                        disabled={isDisabled}
                        onCheckedChange={(checked) => toggleRow(item.id, !!checked)}
                        aria-label={`Select ${item.name}`}
                      />

                      {/* Download info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground truncate" title={item.name}>
                          {item.name}
                        </p>
                        <Input
                          value={cleanTitle}
                          disabled={isDisabled}
                          onChange={(e) => updateTitle(item.id, e.target.value)}
                          className="h-7 text-sm mt-1"
                          aria-label={`Clean title for ${item.name}`}
                        />
                      </div>

                      {/* IGDB match */}
                      <div className="w-44 shrink-0">
                        {!isDisabled && <IgdbMatchCell title={cleanTitle} />}
                        {isDisabled && (
                          <Badge variant="outline" className="text-xs">
                            <PackageCheck className="h-3 w-3 mr-1" />
                            In library
                          </Badge>
                        )}
                      </div>

                      {/* Status */}
                      <div className="w-28 shrink-0 text-right">
                        <Badge
                          variant={
                            item.status === "completed" || item.status === "seeding"
                              ? "default"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {item.status}
                        </Badge>
                        {item.progress > 0 && item.progress < 100 && (
                          <Progress value={item.progress} className="h-1 mt-1" />
                        )}
                        <Badge variant="outline" className="text-xs mt-1">
                          {item.downloadType === "usenet" ? (
                            <>
                              <span className="text-blue-400">NZB</span>
                            </>
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        )}

        {/* Footer */}
        {!isScanning && !scanError && items.length > 0 && (
          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-sm text-muted-foreground">
              {selectedItems.length} download(s) selected for import
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={() => importMutation.mutate()}
                disabled={selectedItems.length === 0 || importMutation.isPending}
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <PackageCheck className="h-4 w-4 mr-2" />
                    Import Selected ({selectedItems.length})
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
