// 게임 메인 화면: Three.js 미로 + HUD + 채팅
import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import MazeEngine from "@/components/game/MazeEngine";
import ChatSystem from "@/components/game/ChatSystem";
import HUD from "@/components/game/HUD";
import Minimap from "@/components/game/Minimap";
import DreamcoreEvents from "@/components/game/DreamcoreEvents";
import { useSocket } from "@/contexts/SocketContext";
import { useUpdateGameState } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { LogOut, Map } from "lucide-react";

export default function GamePage() {
  const [, setLocation] = useLocation();
  const [is2DView, setIs2DView] = useState(false);
  const [playerPos, setPlayerPos] = useState({ x: 2, z: 2 });
  const [roomNumber, setRoomNumber] = useState(1);
  const { currentServerId, leaveServer } = useSocket();
  const updateState = useUpdateGameState();

  const handlePositionChange = useCallback((pos: { x: number; y: number; z: number; mapId: string }) => {
    setPlayerPos({ x: pos.x, z: pos.z });
    const newRoom = Math.floor(pos.x / 4) * 100 + Math.floor(pos.z / 4) + 1;
    setRoomNumber(Math.max(1, newRoom));
    updateState.mutate({ data: { position: pos } });
  }, [updateState]);

  const handleViewToggle = useCallback(() => setIs2DView(v => !v), []);

  const handleLeave = () => {
    leaveServer();
    setLocation("/lobby");
  };

  // V키 뷰 전환
  return (
    <div className="fixed inset-0 bg-black overflow-hidden" data-testid="game-page">
      {/* Three.js 캔버스 영역 */}
      <div className="absolute inset-0">
        {!is2DView && (
          <MazeEngine
            serverId={currentServerId}
            complexity={5}
            onPositionChange={handlePositionChange}
          />
        )}
        {is2DView && (
          <div className="w-full h-full flex items-center justify-center bg-black">
            <div className="relative" style={{ width: 600, height: 600 }}>
              <Minimap playerPos={playerPos} mazeSize={20} compact={false} />
              <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
                2D 미로 맵 — V 키로 3D 복귀
              </p>
            </div>
          </div>
        )}
      </div>

      {/* HUD */}
      <HUD
        serverName={currentServerId ? `서버 #${currentServerId}` : "솔로 탐험"}
        onViewToggle={handleViewToggle}
        is2DView={is2DView}
        roomNumber={roomNumber}
      />

      {/* 채팅 */}
      <ChatSystem />

      {/* 미니맵 */}
      {!is2DView && <Minimap playerPos={playerPos} compact={true} />}

      {/* 드림코어 이벤트 */}
      <DreamcoreEvents />

      {/* 나가기 버튼 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute top-4 right-36 z-10"
      >
        <Button
          size="sm"
          variant="outline"
          onClick={handleLeave}
          data-testid="button-leave-game"
          className="glass border-border/40 text-muted-foreground hover:text-foreground text-xs"
        >
          <LogOut className="w-3.5 h-3.5 mr-1.5" />
          나가기
        </Button>
      </motion.div>
    </div>
  );
}
