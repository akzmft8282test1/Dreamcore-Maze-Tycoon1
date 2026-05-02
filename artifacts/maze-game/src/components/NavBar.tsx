// 상단 내비게이션 바
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/contexts/SocketContext";
import { Button } from "@/components/ui/button";
import { LogOut, Wifi, WifiOff } from "lucide-react";

const NAV_LINKS = [
  { href: "/lobby", label: "로비" },
  { href: "/shop", label: "상점" },
  { href: "/leaderboard", label: "명예의 전당" },
  { href: "/profile", label: "프로필" },
];

export default function NavBar() {
  const [location] = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const { isConnected } = useSocket();

  return (
    <nav className="glass-strong border-b border-border/30 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* 로고 */}
        <Link href="/lobby">
          <span className="text-lg font-bold text-primary text-glow cursor-pointer">
            드림코어
          </span>
        </Link>

        {/* 네비게이션 링크 */}
        <div className="hidden sm:flex items-center gap-1">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href}>
              <span
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
                  location === link.href
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                data-testid={`nav-${link.label}`}
              >
                {link.label}
              </span>
            </Link>
          ))}
          {isAdmin && (
            <Link href="/admin">
              <span
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
                  location === "/admin" ? "bg-red-500/20 text-red-400" : "text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                }`}
                data-testid="nav-admin"
              >
                관리자
              </span>
            </Link>
          )}
        </div>

        {/* 우측 영역 */}
        <div className="flex items-center gap-3">
          {/* 소켓 상태 */}
          <div className="flex items-center gap-1.5">
            {isConnected ? (
              <Wifi className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </div>

          {/* 재화 */}
          <div className="glass rounded-lg px-3 py-1 flex items-center gap-1.5">
            <span className="text-yellow-400 text-xs">DC</span>
            <span className="text-sm font-semibold">{(user?.currency ?? 0).toLocaleString()}</span>
          </div>

          {/* 닉네임 */}
          <Link href="/profile">
            <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer hidden sm:block">
              {user?.nickname}
            </span>
          </Link>

          {/* 로그아웃 */}
          <Button
            size="sm"
            variant="ghost"
            onClick={logout}
            data-testid="button-logout"
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
