// 채팅 시스템: 발로란트 스타일 채팅 UI
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

export default function ChatSystem() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [currentChannel, setCurrentChannel] = useState<Channel>("global");
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { chatMessages, sendChat } = useSocket();
  const { isAdmin } = useAuth();

  const visibleChannels = isAdmin
    ? (Object.keys(CHANNEL_LABELS) as Channel[])
    : (["global", "server", "team", "party"] as Channel[]);

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

  const sendMessage = () => {
    if (!inputValue.trim()) {
      setIsOpen(false);
      return;
    }
    sendChat(currentChannel, inputValue.trim());
    setInputValue("");
    setIsOpen(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === "Escape") {
      setIsOpen(false);
      setInputValue("");
    }
  };

  const filteredMessages = chatMessages.filter(m => {
    if (!isAdmin && m.channel === "admin") return false;
    return true;
  }).slice(-30);

  return (
    <div className="absolute bottom-16 left-4 w-80 z-20 select-none pointer-events-none">
      {/* 메시지 목록 */}
      <div className="max-h-48 overflow-hidden flex flex-col justify-end gap-0.5 mb-1 pointer-events-none">
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
        </AnimatePresence>
      </div>

      {/* 입력 영역 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="glass rounded-lg p-2 pointer-events-auto"
          >
            {/* 채널 탭 */}
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
                placeholder={`${CHANNEL_LABELS[currentChannel]} 채팅...`}
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
          </motion.div>
        )}
      </AnimatePresence>

      {!isOpen && (
        <p className="text-xs text-muted-foreground/40 px-2 pointer-events-none">
          Enter — 채팅
        </p>
      )}
    </div>
  );
}
