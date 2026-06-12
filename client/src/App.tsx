import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import Header from "@/components/Header";
import { useBackgroundNotifications } from "@/hooks/use-background-notifications";
import { AuthProvider } from "@/lib/auth";
import { Suspense, lazy } from "react";
import LoadingFallback from "@/components/LoadingFallback";
import { ThemeProvider } from "next-themes";

// ⚡ Code splitting with React.lazy
const SearchPage = lazy(() => import("@/pages/search"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const NotFound = lazy(() => import("@/pages/not-found"));
const LibraryPage = lazy(() => import("@/pages/library"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
const LoginPage = lazy(() => import("@/pages/auth/login"));
const SetupPage = lazy(() => import("@/pages/auth/setup"));
const GameDetailPage = lazy(() => import("@/pages/game-detail"));
const ActivityQueuePage = lazy(() => import("@/pages/activity-queue"));
const ActivityHistoryPage = lazy(() => import("@/pages/activity-history"));
const ActivityBlacklistPage = lazy(() => import("@/pages/activity-blacklist"));
const WantedPage = lazy(() => import("@/pages/wanted"));
const SystemPage = lazy(() => import("@/pages/system"));

function Router() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
        {/* Auth */}
        <Route path="/login" component={LoginPage} />
        <Route path="/setup" component={SetupPage} />

        {/* Core pages */}
        <Route path="/library" component={LibraryPage} />
        <Route path="/games/:id" component={GameDetailPage} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/wanted" component={WantedPage} />
        <Route path="/search" component={SearchPage} />

        {/* Activity */}
        <Route path="/activity/queue" component={ActivityQueuePage} />
        <Route path="/activity/history" component={ActivityHistoryPage} />
        <Route path="/activity/blacklist" component={ActivityBlacklistPage} />

        {/* System + Settings */}
        <Route path="/system" component={SystemPage} />
        <Route path="/settings" component={SettingsPage} />

        {/* Backwards-compatibility redirects */}
        <Route path="/">
          <Redirect to="/library" />
        </Route>
        <Route path="/downloads">
          <Redirect to="/activity/queue" />
        </Route>
        <Route path="/discover">
          <Redirect to="/library?tab=discover" />
        </Route>
        <Route path="/wishlist">
          <Redirect to="/wanted" />
        </Route>
        <Route path="/xrel">
          <Redirect to="/settings?tab=sources" />
        </Route>
        <Route path="/rss">
          <Redirect to="/settings?tab=sources" />
        </Route>
        <Route path="/indexers">
          <Redirect to="/settings?tab=sources" />
        </Route>
        <Route path="/downloaders">
          <Redirect to="/settings?tab=services" />
        </Route>
        <Route path="/root-folders">
          <Redirect to="/settings?tab=media-management" />
        </Route>
        <Route path="/library-scan">
          <Redirect to="/settings?tab=media-management" />
        </Route>
        <Route path="/import-history">
          <Redirect to="/activity/history" />
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AppContent() {
  // Enable background notifications for downloads
  useBackgroundNotifications();

  return <Router />;
}

function App() {
  const [location, navigate] = useLocation();

  // Custom sidebar width for the application
  const style = {
    "--sidebar-width": "16rem", // 256px for navigation
    "--sidebar-width-icon": "4rem", // default icon width
  };

  const getPageTitle = (path: string) => {
    if (path.startsWith("/games/")) return "Game Details";
    if (path.startsWith("/settings")) return "Settings";
    switch (path) {
      case "/library":
        return "Library";
      case "/calendar":
        return "Calendar";
      case "/wanted":
        return "Wanted";
      case "/search":
        return "Search";
      case "/activity/queue":
        return "Queue";
      case "/activity/history":
        return "History";
      case "/activity/blacklist":
        return "Blacklist";
      case "/system":
        return "System";
      default:
        return "Gamearr";
    }
  };

  // If on login or setup page, render simplified layout without sidebar/header
  if (location === "/login" || location === "/setup") {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <AuthProvider>
            <Router />
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <AuthProvider>
          <TooltipProvider>
            <SidebarProvider style={style as React.CSSProperties}>
              <div className="flex h-screen w-full overflow-hidden">
                <AppSidebar activeItem={location} onNavigate={navigate} />
                <div className="flex flex-col flex-1 min-w-0">
                  <Header title={getPageTitle(location)} />
                  <main className="flex-1 overflow-hidden">
                    <AppContent />
                  </main>
                </div>
              </div>
            </SidebarProvider>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
