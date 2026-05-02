// 드림코어 이벤트: 글리치, 팝업 메시지, 선언 등 랜덤 이벤트
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket } from "@/contexts/SocketContext";

const DREAM_MESSAGES = [
  "여기서 나가지 마세요",
  "당신이 잠든 동안 이곳은 계속 존재했습니다",
  "복도 끝을 보지 마세요",
  "형광등이 깜빡입니다",
  "누군가 당신을 따라오고 있어요",
  "이 공간은 현실이 아닙니다",
  "출구는 없습니다",
  "아직 더 깊이 들어갈 수 있어요",
  "... 당신이 보입니다",
  "돌아가는 길을 잊었나요?",
  "이 냄새는 익숙하지 않나요?",
  "조용히 해요. 무언가 들립니다",
];

interface GlitchEvent {
  id: string;
  active: boolean;
}

export default function DreamcoreEvents() {
  const [dreamMessage, setDreamMessage] = useState<string | null>(null);
  const [glitch, setGlitch] = useState<GlitchEvent | null>(null);
  const { announcement, clearAnnouncement } = useSocket();

  // 랜덤 드림 메시지 (60~180초마다)
  useEffect(() => {
    const schedule = () => {
      const delay = 60000 + Math.random() * 120000;
      return setTimeout(() => {
        const msg = DREAM_MESSAGES[Math.floor(Math.random() * DREAM_MESSAGES.length)];
        setDreamMessage(msg);
        setTimeout(() => setDreamMessage(null), 4000);
        schedule();
      }, delay);
    };
    const t = schedule();
    return () => clearTimeout(t);
  }, []);

  // 글리치 이펙트 (80~200초마다)
  useEffect(() => {
    const schedule = () => {
      const delay = 80000 + Math.random() * 120000;
      return setTimeout(() => {
        setGlitch({ id: Date.now().toString(), active: true });
        setTimeout(() => setGlitch(null), 500);
        schedule();
      }, delay);
    };
    const t = schedule();
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      {/* 글리치 오버레이 */}
      <AnimatePresence>
        {glitch && (
          <motion.div
            key={glitch.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.8, 0, 0.5, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, times: [0, 0.1, 0.3, 0.5, 1] }}
            className="fixed inset-0 z-50 pointer-events-none"
            style={{
              background: "linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(34, 211, 238, 0.2) 50%, transparent 100%)",
              mixBlendMode: "screen",
            }}
          />
        )}
      </AnimatePresence>

      {/* 드림 메시지 팝업 */}
      <AnimatePresence>
        {dreamMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-1/3 left-1/2 -translate-x-1/2 z-50 pointer-events-none text-center"
          >
            <p className="text-white/70 text-lg font-light tracking-wider text-glow">
              {dreamMessage}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 관리자 공지 */}
      <AnimatePresence>
        {announcement && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 glass rounded-xl px-6 py-4 max-w-lg text-center"
          >
            <p className="text-xs text-muted-foreground mb-1">시스템 공지</p>
            <p className="text-foreground font-medium">{announcement}</p>
            <button
              onClick={clearAnnouncement}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              닫기
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
