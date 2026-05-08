import {
  Library,
  Calendar,
  Download,
  Clock,
  Ban,
  Star,
  Settings,
  Monitor,
  ChevronRight,
  LogOut,
  User,
  Cpu,
  HardDrive,
  Database,
  Rss,
  Bell,
  FolderOpen,
} from "lucide-react";
import { useState, useMemo } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { type Game, type DownloadStatus } from "@shared/schema";
import { useAuth } from "@/lib/auth";

interface AppSidebarProps {
  activeItem?: string;
  onNavigate?: (url: string) => void;
}

export default function AppSidebar({ activeItem = "/library", onNavigate }: AppSidebarProps) {
  const { logout, user } = useAuth();
  const [activityOpen, setActivityOpen] = useState(activeItem?.startsWith("/activity") ?? false);
  const [settingsOpen, setSettingsOpen] = useState(activeItem?.startsWith("/settings") ?? false);

  const { data: games = [] } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  const { data: downloadsData } = useQuery<{ downloads: DownloadStatus[] }>({
    queryKey: ["/api/downloads"],
    refetchInterval: 5000,
  });

  const { libraryCount, wantedCount, activeDownloadsCount } = useMemo(() => {
    const libraryCount = games.filter((g) =>
      ["owned", "completed", "downloading"].includes(g.status)
    ).length;
    const wantedCount = games.filter((g) => g.status === "wanted").length;
    const activeDownloadsCount = downloadsData?.downloads?.length ?? 0;
    return { libraryCount, wantedCount, activeDownloadsCount };
  }, [games, downloadsData]);

  const nav = (url: string) => onNavigate?.(url);
  const isActive = (url: string) => activeItem === url;

  return (
    <Sidebar data-testid="sidebar-main">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center">
            <img src="/Questarr.svg" alt="Gamearr Logo" className="w-8 h-8" />
          </div>
          <div>
            <span className="truncate font-semibold">Gamearr</span>
            <p className="text-xs text-muted-foreground">Game Management</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Library */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive("/library")}
                  data-testid="nav-library"
                >
                  <button
                    onClick={() => nav("/library")}
                    className="flex items-center justify-between w-full"
                  >
                    <div className="flex items-center gap-2">
                      <Library className="w-4 h-4" />
                      <span>Library</span>
                    </div>
                    {libraryCount > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {libraryCount}
                      </Badge>
                    )}
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Calendar */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive("/calendar")}
                  data-testid="nav-calendar"
                >
                  <button
                    onClick={() => nav("/calendar")}
                    className="flex items-center gap-2 w-full"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Calendar</span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Activity — collapsible */}
              <SidebarMenuItem>
                <Collapsible open={activityOpen} onOpenChange={setActivityOpen}>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      data-testid="nav-activity"
                      className="flex items-center justify-between w-full"
                    >
                      <div className="flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        <span>Activity</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {activeDownloadsCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {activeDownloadsCount}
                          </Badge>
                        )}
                        <ChevronRight
                          className={`w-3 h-3 transition-transform ${activityOpen ? "rotate-90" : ""}`}
                        />
                      </div>
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isActive("/activity/queue")}
                          data-testid="nav-activity-queue"
                        >
                          <button
                            onClick={() => nav("/activity/queue")}
                            className="flex items-center gap-2 w-full"
                          >
                            <Download className="w-3 h-3" />
                            <span>Queue</span>
                            {activeDownloadsCount > 0 && (
                              <Badge variant="secondary" className="ml-auto text-xs">
                                {activeDownloadsCount}
                              </Badge>
                            )}
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isActive("/activity/history")}
                          data-testid="nav-activity-history"
                        >
                          <button
                            onClick={() => nav("/activity/history")}
                            className="flex items-center gap-2 w-full"
                          >
                            <Clock className="w-3 h-3" />
                            <span>History</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isActive("/activity/blacklist")}
                          data-testid="nav-activity-blacklist"
                        >
                          <button
                            onClick={() => nav("/activity/blacklist")}
                            className="flex items-center gap-2 w-full"
                          >
                            <Ban className="w-3 h-3" />
                            <span>Blacklist</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>

              {/* Wanted */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/wanted")} data-testid="nav-wanted">
                  <button
                    onClick={() => nav("/wanted")}
                    className="flex items-center justify-between w-full"
                  >
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4" />
                      <span>Wanted</span>
                    </div>
                    {wantedCount > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {wantedCount}
                      </Badge>
                    )}
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Settings — collapsible */}
              <SidebarMenuItem>
                <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      data-testid="nav-settings"
                      className="flex items-center justify-between w-full"
                    >
                      <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        <span>Settings</span>
                      </div>
                      <ChevronRight
                        className={`w-3 h-3 transition-transform ${settingsOpen ? "rotate-90" : ""}`}
                      />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {[
                        { label: "Media Management", tab: "media", icon: FolderOpen },
                        { label: "Indexers", tab: "indexers", icon: Database },
                        { label: "Download Clients", tab: "downloaders", icon: HardDrive },
                        { label: "Sources", tab: "sources", icon: Rss },
                        { label: "Connect", tab: "connect", icon: Bell },
                        { label: "General", tab: "general", icon: Cpu },
                      ].map(({ label, tab, icon: Icon }) => (
                        <SidebarMenuSubItem key={tab}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={activeItem === `/settings?tab=${tab}`}
                          >
                            <button
                              onClick={() => nav(`/settings?tab=${tab}`)}
                              className="flex items-center gap-2 w-full"
                            >
                              <Icon className="w-3 h-3" />
                              <span>{label}</span>
                            </button>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>

              {/* System */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/system")} data-testid="nav-system">
                  <button onClick={() => nav("/system")} className="flex items-center gap-2 w-full">
                    <Monitor className="w-4 h-4" />
                    <span>System</span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => logout()}
              className="cursor-pointer w-full"
              tooltip="Log out"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <User className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user?.username ?? "User"}</span>
                <span className="truncate text-xs">Logged in</span>
              </div>
              <LogOut className="ml-auto size-4" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
