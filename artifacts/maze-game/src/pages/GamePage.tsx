// 게임 메인 화면: Three.js 미로 + HUD + 채팅
import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import MazeEngine, { FLASHLIGHT_PRESETS } from "@/components/game/MazeEngine";
import ChatSystem from "@/components/game/ChatSystem";
import HUD from "@/components/game/HUD";
import Minimap from "@/components/game/Minimap";
import DreamcoreEvents from "@/components/game/DreamcoreEvents";
import { useSocket } from "@/contexts/SocketContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateGameState,
  useGetUserInventory,
  useEquipSkin,
  getGetUserInventoryQueryKey,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function GamePage() {
  const [, setLocation] = useLocation();
  const [is2DView, setIs2DView] = useState(false);
  const [playerPos, setPlayerPos] = useState({ x: 2, z: 2 });
  const [roomNumber, setRoomNumber] = useState(1);
  const [flashlightOn, setFlashlightOn] = useState(true);
  const [fullBright, setFullBright] = useState(false);
  const { currentServerId, leaveServer } = useSocket();
  const { user } = useAuth();
  const updateState = useUpdateGameState();
  const equipSkin = useEquipSkin();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: inventory = [] } = useGetUserInventory(user?.id ?? 0, {
    query: { queryKey: getGetUserInventoryQueryKey(user?.id ?? 0), enabled: !!user }
  });
  const ownedFlashlights = (inventory as any[]).filter((item: any) => item.itemType === "flashlight");
  const equippedFlashlight = (user as any)?.equippedFlashlight ?? null;

  const handlePositionChange = useCallback((pos: { x: number; y: number; z: number; mapId: string }) => {
    setPlayerPos({ x: pos.x, z: pos.z });
    const newRoom = Math.floor(pos.x / 4) * 100 + Math.floor(pos.z / 4) + 1;
    setRoomNumber(Math.max(1, newRoom));
    updateState.mutate({ data: { position: pos } });
  }, [updateState]);

  const handleViewToggle = useCallback(() => setIs2DView(v => !v), []);

  const handleEquipFlashlight = useCallback(async (itemId: string | null) => {
    try {
      await equipSkin.mutateAsync({ data: { itemId: itemId ?? "flashlight_none" } });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      const name = itemId
        ? ({ flashlight_basic: "기본 손전등", flashlight_wide: "광각 손전등", flashlight_uv: "UV 손전등", flashlight_dreamcore: "드림코어 랜턴" }[itemId] ?? itemId)
        : "기본 손전등";
      toast({ title: `${name} 장착`, description: "손전등이 교체되었습니다" });
    } catch {
      toast({ title: "장착 실패", variant: "destructive" });
    }
  }, [equipSkin, queryClient, toast]);

  const handleLeave = () => {
    leaveServer();
    setLocation("/lobby");
  };

  return (
    <div className="fixed inset-0 bg-black overflow-hidden" data-testid="game-page">
      <div className="absolute inset-0">
        {!is2DView && (
          <MazeEngine
            serverId={currentServerId}
            complexity={5}
            equippedFlashlight={equippedFlashlight}
            onPositionChange={handlePositionChange}
            onFlashlightChange={(on) => setFlashlightOn(on && !fullBright)}
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

      <HUD
        serverName={currentServerId ? `서버 #${currentServerId}` : "솔로 탐험"}
        onViewToggle={handleViewToggle}
        is2DView={is2DView}
        roomNumber={roomNumber}
        flashlightOn={flashlightOn}
        fullBright={fullBright}
        equippedFlashlight={equippedFlashlight}
        ownedFlashlights={ownedFlashlights}
        onEquipFlashlight={handleEquipFlashlight}
        onToggleFullBright={() => setFullBright(v => !v)}
      />

      <ChatSystem />
      {!is2DView && <Minimap playerPos={playerPos} compact={true} />}
      <DreamcoreEvents />

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
