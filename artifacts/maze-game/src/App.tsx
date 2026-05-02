// 앱 라우터: 모든 페이지를 wouter로 연결
import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SocketProvider } from "@/contexts/SocketContext";
import LoginPage from "@/pages/LoginPage";
import GamePage from "@/pages/GamePage";
import LobbyPage from "@/pages/LobbyPage";
import ShopPage from "@/pages/ShopPage";
import LeaderboardPage from "@/pages/LeaderboardPage";
import AdminPage from "@/pages/AdminPage";
import ProfilePage from "@/pages/ProfilePage";
import NotFound from "@/pages/not-found";
import { Spinner } from "@/components/ui/spinner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading, token } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && (!token || !user)) {
      setLocation("/");
    }
  }, [isLoading, token, user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen dreamcore-bg flex items-center justify-center">
        <div className="glass rounded-2xl p-8 flex flex-col items-center gap-4">
          <Spinner className="w-8 h-8 text-primary" />
          <p className="text-muted-foreground text-sm">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!token || !user) return null;

  return <Component />;
}

function AdminRoute() {
  const { user, isAdmin, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) {
      setLocation("/");
    }
  }, [isLoading, user, isAdmin, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen dreamcore-bg flex items-center justify-center">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  if (!user || !isAdmin) return null;

  return <AdminPage />;
}

function AppRouter() {
  const { user, isLoading, token } = useAuth();
  const [location, setLocation] = useLocation();

  // 로그인 완료 시 자동 리다이렉트 (상태 업데이트 완료 후 처리)
  useEffect(() => {
    if (!isLoading && token && user && location === "/") {
      setLocation("/lobby");
    }
  }, [isLoading, token, user, location, setLocation]);

  return (
    <Switch>
      <Route path="/">
        {isLoading ? (
          <div className="min-h-screen dreamcore-bg flex items-center justify-center">
            <div className="glass rounded-2xl p-8 flex flex-col items-center gap-4">
              <Spinner className="w-8 h-8 text-primary" />
              <p className="text-muted-foreground text-sm">로딩 중...</p>
            </div>
          </div>
        ) : token && user ? null : (
          <LoginPage />
        )}
      </Route>
      <Route path="/game">
        <ProtectedRoute component={GamePage} />
      </Route>
      <Route path="/lobby">
        <ProtectedRoute component={LobbyPage} />
      </Route>
      <Route path="/shop">
        <ProtectedRoute component={ShopPage} />
      </Route>
      <Route path="/leaderboard">
        <ProtectedRoute component={LeaderboardPage} />
      </Route>
      <Route path="/admin">
        <AdminRoute />
      </Route>
      <Route path="/profile">
        <ProtectedRoute component={ProfilePage} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <SocketProvider>
              <div className="noise-overlay scanline">
                <AppRouter />
              </div>
              <Toaster />
            </SocketProvider>
          </AuthProvider>
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
