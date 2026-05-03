// 게임 HUD: 서버 정보, 재화, 손전등 상태/교체, 조작 안내
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/contexts/SocketContext";
import { useGetGameState, getGetGameStateQueryKey } from "@workspace/api-client-react";

const FLASHLIGHT_NAMES: Record<string, string> = {
  flashlight_basic: "기본 손전등",
  flashlight_wide: "광각 손전등",
  flashlight_uv: "UV 손전등",
  flashlight_dreamcore: "드림코어 랜턴",
};

const FLASHLIGHT_COLORS: Record<string, string> = {
  flashlight_basic: "#fff9c4",
  flashlight_wide: "#fff3e0",
  flashlight_uv: "#ce93d8",
  flashlight_dreamcore: "#ffe57f",
};

const FLASHLIGHT_ICONS: Record<string, string> = {
  flashlight_basic: "🔦",
  flashlight_wide: "💡",
  flashlight_uv: "🔮",
  flashlight_dreamcore: "🕯️",
};

interface FlashlightItem {
  itemId: string;
  itemType: string;
}

interface HUDProps {
  serverName?: string;
  onViewToggle?: () => void;
  is2DView?: boolean;
  roomNumber?: number;
  flashlightOn?: boolean;
  equippedFlashlight?: string | null;
  ownedFlashlights?: FlashlightItem[];
  onEquipFlashlight?: (itemId: string | null) => void;
}

export default function HUD({
  serverName = "솔로 탐험",
  onViewToggle,
  is2DView = false,
  roomNumber = 1,
  flashlightOn = true,
  equippedFlashlight,
  ownedFlashlights = [],
  onEquipFlashlight,
}: HUDProps) {
  const { user } = useAuth();
  const { onlinePlayers, currentServerId } = useSocket();
  const { data: gameState } = useGetGameState({
    query: { queryKey: getGetGameStateQueryKey() }
  });
  const [showPicker, setShowPicker] = useState(false);

  const playerCount = currentServerId ? onlinePlayers.size : 1;
  const currency = gameState?.currency ?? user?.currency ?? 0;

  const flashlightColor = equippedFlashlight
    ? (FLASHLIGHT_COLORS[equippedFlashlight] ?? "#ffffff")
    : "#ffffff";
  const flashlightName = equippedFlashlight
    ? (FLASHLIGHT_NAMES[equippedFlashlight] ?? "손전등")
    : "기본 손전등";
  const flashlightIcon = equippedFlashlight
    ? (FLASHLIGHT_ICONS[equippedFlashlight] ?? "🔦")
    : "🔦";

  return (
    <>
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="absolute top-4 left-4 glass rounded-xl px-4 py-3 z-10 min-w-40">
        <p className="text-xs text-muted-foreground">서버</p>
        <p className="text-sm font-semibold text-foreground truncate max-w-32">{serverName}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-muted-foreground">{playerCount}명 접속 중</span>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="absolute top-4 right-4 glass rounded-xl px-4 py-3 z-10 text-right">
        <p className="text-xs text-muted-foreground">구역</p>
        <p className="text-sm font-semibold text-primary">#{roomNumber.toString().padStart(4, "0")}</p>
        <p className="text-xs text-muted-foreground mt-1">탐색 진행 중</p>
      </motion.div>

      <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onViewToggle} data-testid="button-toggle-view" className="absolute top-4 left-1/2 -translate-x-1/2 glass rounded-full px-4 py-1.5 z-10 text-xs text-muted-foreground hover:text-foreground transition-colors">
        {is2DView ? "3D 뷰 (V)" : "2D 맵 (V)"}
      </motion.button>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-4 left-4 z-20 space-y-2">
        <div className="glass rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-sm">DC</span>
            <span className="text-sm font-bold text-foreground">{currency.toLocaleString()}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">레벨 {gameState?.level ?? 1}</p>
        </div>

        <div className="relative">
          <button onClick={() => setShowPicker(p => !p)} className="glass rounded-xl px-4 py-3 w-full text-left hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-2.5">
              <span className="text-base" style={{ filter: flashlightOn && equippedFlashlight ? `drop-shadow(0 0 6px ${flashlightColor})` : "none", opacity: flashlightOn ? 1 : 0.4, transition: "all 0.2s" }}>
                {flashlightIcon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: flashlightOn ? flashlightColor : "#4a4a6a" }}>
                  {flashlightOn ? flashlightName : `${flashlightName} (꺼짐)`}
                </p>
                <p className="text-[10px] text-muted-foreground/50">F: 켜기/끄기 · 클릭: 교체</p>
              </div>
              {ownedFlashlights.length > 0 && <span className="text-muted-foreground/40 text-xs">⇅</span>}
            </div>
          </button>

          <AnimatePresence>
            {showPicker && (
              <motion.div initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }} transition={{ duration: 0.15 }} className="absolute bottom-full mb-2 left-0 glass-strong rounded-xl p-2 min-w-48 shadow-xl">
                <p className="text-[10px] text-muted-foreground/60 px-2 pb-1.5 border-b border-white/5 mb-1.5">손전등 교체</p>
                <button onClick={() => { onEquipFlashlight?.(null); setShowPicker(false); }} className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors hover:bg-white/8 ${!equippedFlashlight ? "bg-white/10" : ""}`}>
                  <span className="text-sm opacity-50">🔦</span>
                  <div>
                    <p className="text-xs text-muted-foreground">기본 손전등</p>
                    <p className="text-[10px] text-muted-foreground/40">기본 장비</p>
                  </div>
                  {!equippedFlashlight && <span className="ml-auto text-primary text-xs">✓</span>}
                </button>
                {ownedFlashlights.map((item) => {
                  const isEquipped = equippedFlashlight === item.itemId;
                  const color = FLASHLIGHT_COLORS[item.itemId] ?? "#ffffff";
                  const name = FLASHLIGHT_NAMES[item.itemId] ?? item.itemId;
                  const icon = FLASHLIGHT_ICONS[item.itemId] ?? "🔦";
                  return (
                    <button key={item.itemId} onClick={() => { onEquipFlashlight?.(item.itemId); setShowPicker(false); }} className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors hover:bg-white/8 ${isEquipped ? "bg-white/10" : ""}`}>
                      <span className="text-sm" style={{ filter: `drop-shadow(0 0 4px ${color})` }}>{icon}</span>
                      <div className="flex-1"><p className="text-xs font-medium" style={{ color }}>{name}</p></div>
                      {isEquipped && <span className="text-primary text-xs">✓</span>}
                    </button>
                  );
                })}
                {ownedFlashlights.length === 0 && <p className="text-[10px] text-muted-foreground/40 px-2 py-1">상점에서 손전등을 구매하세요</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} className="absolute bottom-4 right-4 text-right z-10 text-xs text-muted-foreground/50 space-y-0.5">
        <p>WASD / 방향키 — 이동</p>
        <p>마우스 드래그 — 시점 회전</p>
        <p>V — 뷰 전환</p>
        <p>F — 손전등 켜기/끄기</p>
        <p>Enter — 채팅</p>
      </motion.div>
    </>
  );
}
