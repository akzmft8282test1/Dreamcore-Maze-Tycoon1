// 게임 메인 화면: Three.js 미로 + HUD + 채팅
import { useEffect, useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import MazeEngine from "@/components/game/MazeEngine";
import ChatSystem from "@/components/game/ChatSystem";
import HUD from "@/components/game/HUD";
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
  const [initialPart, setInitialPart] = useState<number | null>(null);
  const [initialDimension, setInitialDimension] = useState<1 | 2 | null>(null);
  const [is2DView, setIs2DView] = useState(false);
  const [playerPos, setPlayerPos] = useState({ x: 2, z: 2 });
  const [roomNumber, setRoomNumber] = useState(1);
  const [flashlightOn, setFlashlightOn] = useState(true);
  const [fullBright, setFullBright] = useState(false);
  const [pointerSensitivity, setPointerSensitivity] = useState(1);
  const [doorZone, setDoorZone] = useState<number | null>(null);
  const [currentDimension, setCurrentDimension] = useState<1 | 2 | 3>(1);
  const { currentServerId, leaveServer } = useSocket();
  const { user } = useAuth();
  const updateState = useUpdateGameState();
  const equipSkin = useEquipSkin();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const partValue = params.get("part")?.replace("#", "");
    const dimensionValue = params.get("dimension");
    const parsedPart = Number.parseInt(partValue ?? "", 10);
    const parsedDimension = Number.parseInt(dimensionValue ?? "", 10);
    setInitialPart(Number.isFinite(parsedPart) && parsedPart > 0 ? parsedPart : null);
    setInitialDimension(parsedDimension === 2 ? 2 : 1);
  }, []);

  const upgradeItems = useMemo(() => [
    { id: "speed_boost", name: "이동 속도", desc: "빠르게 이동", max: 5, cost: 300 },
    { id: "vision_enhance", name: "시야 강화", desc: "손전등 범위 증가", max: 5, cost: 400 },
    { id: "memory_extractor", name: "기억 추출기", desc: "방치 재화 증가", max: 10, cost: 500 },
    { id: "loot_magnet", name: "잔상 자석", desc: "자동 루팅 강화", max: 5, cost: 700 },
    { id: "maze_quality", name: "미로 품질", desc: "더 복잡한 미로", max: 3, cost: 1500 },
  ], []);

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
        {/* MazeEngine은 항상 마운트 — is2DView 시 내부에서 미니맵 풀스크린 표시 */}
        <MazeEngine
          is2DView={is2DView}
          serverId={currentServerId}
          complexity={5}
          equippedFlashlight={equippedFlashlight}
          pointerSensitivity={pointerSensitivity}
          initialPart={initialPart}
          initialDimension={initialDimension}
          onDoorZoneChange={(zone) => {
            setDoorZone(zone);
            if (zone) toast({ title: "문 위치", description: `${zone}번 구역에 문이 있어요` });
          }}
          onDimensionChange={(dim) => setCurrentDimension(dim)}
          onPositionChange={handlePositionChange}
          onFlashlightChange={(on) => setFlashlightOn(on && !fullBright)}
        />
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
        pointerSensitivity={pointerSensitivity}
        onPointerSensitivityChange={setPointerSensitivity}
        upgradeItems={upgradeItems}
      />

      <ChatSystem
        doorZone={doorZone}
        currentDimension={currentDimension}
        playerPos={playerPos}
      />
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
