// 게임 HUD: 서버 정보, 재화, 채팅 안내
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/contexts/SocketContext";
import { useGetGameState } from "@workspace/api-client-react";
import { getGetGameStateQueryKey } from "@workspace/api-client-react";

interface HUDProps {
  serverName?: string;
  onViewToggle?: () => void;
  is2DView?: boolean;
  roomNumber?: number;
}

export default function HUD({ serverName = "솔로 탐험", onViewToggle, is2DView = false, roomNumber = 1 }: HUDProps) {
  const { user } = useAuth();
  const { onlinePlayers, currentServerId } = useSocket();
  const { data: gameState } = useGetGameState({
    query: { queryKey: getGetGameStateQueryKey() }
  });

  const playerCount = currentServerId ? onlinePlayers.size : 1;
  const currency = gameState?.currency ?? user?.currency ?? 0;

  return (
    <>
      {/* 좌측 상단: 서버 정보 */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="absolute top-4 left-4 glass rounded-xl px-4 py-3 z-10 min-w-40"
      >
        <p className="text-xs text-muted-foreground">서버</p>
        <p className="text-sm font-semibold text-foreground truncate max-w-32">{serverName}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-muted-foreground">{playerCount}명 접속 중</span>
        </div>
      </motion.div>

      {/* 우측 상단: 방 번호 & 탐색 진행도 */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="absolute top-4 right-4 glass rounded-xl px-4 py-3 z-10 text-right"
      >
        <p className="text-xs text-muted-foreground">구역</p>
        <p className="text-sm font-semibold text-primary">#{roomNumber.toString().padStart(4, "0")}</p>
        <p className="text-xs text-muted-foreground mt-1">탐색 진행 중</p>
      </motion.div>

      {/* 좌측 하단: 재화 & 레벨 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute bottom-4 left-4 glass rounded-xl px-4 py-3 z-10"
      >
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 text-sm">DC</span>
          <span className="text-sm font-bold text-foreground">{currency.toLocaleString()}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">레벨 {gameState?.level ?? 1}</p>
      </motion.div>

      {/* 뷰 전환 버튼 */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onViewToggle}
        data-testid="button-toggle-view"
        className="absolute top-4 left-1/2 -translate-x-1/2 glass rounded-full px-4 py-1.5 z-10 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {is2DView ? "3D 뷰 (V)" : "2D 맵 (V)"}
      </motion.button>

      {/* 조작 도움말 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        className="absolute bottom-4 right-4 text-right z-10 text-xs text-muted-foreground/50 space-y-0.5"
      >
        <p>WASD / 방향키 — 이동</p>
        <p>마우스 드래그 — 시점 회전</p>
        <p>V — 뷰 전환</p>
        <p>Enter — 채팅</p>
      </motion.div>
    </>
  );
}
