// 채팅 시스템: 발로란트 스타일 채팅 UI + /문 명령어
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket } from "@/contexts/SocketContext";
import { useAuth } from "@/contexts/AuthContext";

type Channel = "global" | "server" | "team" | "party" | "admin";

const CHANNEL_LABELS: Record<Channel, string> = {
  global: "전체",
  server: "서버",
  team: "팀",
  party: "파티",
  admin: "관리",
};

const CHANNEL_COLORS: Record<Channel, string> = {
  global: "text-foreground",
  server: "text-cyan-400",
  team: "text-green-400",
  party: "text-yellow-400",
  admin: "text-red-400",
};

interface LocalMessage {
  id: string;
  text: string;
  color: string;
}

interface ChatSystemProps {
  doorZone?: number | null;
  currentDimension?: 1 | 2 | 3;
  playerPos?: { x: number; z: number };
}

export default function ChatSystem({ doorZone, currentDimension = 1, playerPos }: ChatSystemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [currentChannel, setCurrentChannel] = useState<Channel>("global");
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { chatMessages, sendChat } = useSocket();
  const { isAdmin } = useAuth();

  const visibleChannels = isAdmin
    ? (Object.keys(CHANNEL_LABELS) as Channel[])
    : (["global", "server", "team", "party"] as Channel[]);

  const addLocalMessage = useCallback((text: string, color = "rgba(255,230,100,0.95)") => {
    const id = `local_${Date.now()}_${Math.random()}`;
    setLocalMessages(prev => [...prev.slice(-10), { id, text, color }]);
    setTimeout(() => {
      setLocalMessages(prev => prev.filter(m => m.id !== id));
    }, 8000);
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isOpen, chatMessages]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Enter" && !isOpen) {
      e.preventDefault();
      setIsOpen(true);
    }
    if (e.key === "Escape" && isOpen) {
      setIsOpen(false);
      setInputValue("");
    }
  }, [isOpen]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleCommand = useCallback((cmd: string): boolean => {
    const trimmed = cmd.trim();
    if (trimmed === "/문" || trimmed === "/문위치" || trimmed === "/exit") {
      if (currentDimension === 1) {
        if (doorZone != null) {
          const zone = doorZone;
          const zoneRow = Math.floor((zone - 1) / 18) + 1;
          const zoneCol = ((zone - 1) % 18) + 1;
          addLocalMessage(
            `🚪 분홍 출구 문: ${zone}번 구역 (행 ${zoneRow}, 열 ${zoneCol})`,
            "rgba(255,160,220,0.98)"
          );
        } else {
          addLocalMessage("🚪 이 미로에는 출구 문이 없습니다.", "rgba(255,160,120,0.9)");
        }
      } else if (currentDimension === 2) {
        addLocalMessage("🌀 포탈을 찾으세요 — 벽에 청록빛 포탈이 있습니다 (가까이 가면 자동 진입)", "rgba(100,255,200,0.95)");
      } else if (currentDimension === 3) {
        addLocalMessage("🏫 3차원 학교 — 절벽 밖으로 나가면 1차원으로 돌아갑니다", "rgba(160,190,255,0.95)");
      }
      return true;
    }
    if (trimmed === "/위치" || trimmed === "/pos") {
      if (playerPos) {
        const cellX = Math.floor(playerPos.x / 4) + 1;
        const cellZ = Math.floor(playerPos.z / 4) + 1;
        addLocalMessage(`📍 현재 위치: (${playerPos.x.toFixed(1)}, ${playerPos.z.toFixed(1)}) — 셀 (${cellX}, ${cellZ}) — ${currentDimension}차원`, "rgba(180,230,255,0.95)");
      }
      return true;
    }
    if (trimmed === "/도움" || trimmed === "/help") {
      addLocalMessage("💡 명령어: /문 (출구 위치), /위치 (현재 위치), /도움 (도움말)", "rgba(255,255,180,0.9)");
      return true;
    }
    return false;
  }, [doorZone, currentDimension, playerPos, addLocalMessage]);

  const sendMessage = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setIsOpen(false);
      return;
    }
    if (trimmed.startsWith("/")) {
      const handled = handleCommand(trimmed);
      if (handled) {
        setInputValue("");
        setIsOpen(false);
        return;
      }
    }
    sendChat(currentChannel, trimmed);
    setInputValue("");
    setIsOpen(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); sendMessage(); }
    if (e.key === "Escape") { setIsOpen(false); setInputValue(""); }
  };

  const filteredMessages = chatMessages.filter(m => {
    if (!isAdmin && m.channel === "admin") return false;
    return true;
  }).slice(-30);

  return (
    <div className="absolute bottom-16 left-4 w-80 z-20 select-none pointer-events-none">
      <div className="max-h-52 overflow-hidden flex flex-col justify-end gap-0.5 mb-1 pointer-events-none">
        <AnimatePresence initial={false}>
          {filteredMessages.map((msg, i) => (
            <motion.div
              key={msg.id || i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: isOpen ? 1 : 0.7, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="text-xs leading-5 px-2"
            >
              <span className={`font-medium ${CHANNEL_COLORS[msg.channel as Channel] || "text-muted-foreground"} mr-1`}>
                [{CHANNEL_LABELS[msg.channel as Channel] || msg.channel}]
              </span>
              <span className="text-primary/80 font-semibold mr-1">{msg.nickname}:</span>
              <span className="text-foreground/85">{msg.message}</span>
            </motion.div>
          ))}
          {localMessages.map(lm => (
            <motion.div
              key={lm.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-xs leading-5 px-2 py-0.5 rounded"
              style={{ background: "rgba(0,0,0,0.45)", color: lm.color }}
            >
              {lm.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="glass rounded-lg p-2 pointer-events-auto"
          >
            <div className="flex gap-1 mb-2">
              {visibleChannels.map(ch => (
                <button
                  key={ch}
                  data-testid={`chat-channel-${ch}`}
                  onClick={() => setCurrentChannel(ch)}
                  className={`text-xs px-2 py-0.5 rounded transition-colors ${
                    currentChannel === ch
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {CHANNEL_LABELS[ch]}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                data-testid="chat-input"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="/문 · /위치 · /도움 또는 채팅..."
                maxLength={200}
                className="flex-1 bg-transparent border border-border/50 rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
              <button
                onClick={sendMessage}
                className="text-xs px-2 py-1 bg-primary/20 border border-primary/30 rounded text-primary hover:bg-primary/30 transition-colors"
              >
                전송
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground/40 mt-1">/문 — 출구 위치 · /위치 — 현재 위치</p>
          </motion.div>
        )}
      </AnimatePresence>

      {!isOpen && (
        <p className="text-xs text-muted-foreground/40 px-2 pointer-events-none">
          Enter — 채팅 · /문 — 출구 위치
        </p>
      )}
    </div>
  );
}
