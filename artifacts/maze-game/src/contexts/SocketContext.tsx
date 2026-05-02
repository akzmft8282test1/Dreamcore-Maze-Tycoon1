// 소켓 컨텍스트: Socket.io 실시간 통신 관리
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";

interface ChatMessage {
  id: string;
  channel: string;
  nickname: string;
  message: string;
  timestamp: string;
  role?: string;
}

interface PlayerPosition {
  x: number;
  y: number;
  z: number;
  mapId: string;
}

interface OnlinePlayer {
  userId: number;
  nickname: string;
  position: PlayerPosition;
  skin: string | null;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  chatMessages: ChatMessage[];
  onlinePlayers: Map<number, OnlinePlayer>;
  sendChat: (channel: string, message: string) => void;
  sendPosition: (position: PlayerPosition) => void;
  joinServer: (serverId: number) => void;
  leaveServer: () => void;
  currentServerId: number | null;
  announcement: string | null;
  clearAnnouncement: () => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  chatMessages: [],
  onlinePlayers: new Map(),
  sendChat: () => {},
  sendPosition: () => {},
  joinServer: () => {},
  leaveServer: () => {},
  currentServerId: null,
  announcement: null,
  clearAnnouncement: () => {},
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [onlinePlayers, setOnlinePlayers] = useState<Map<number, OnlinePlayer>>(new Map());
  const [currentServerId, setCurrentServerId] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !user) return;

    const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
    const socket = io(`${window.location.origin}${BASE}/api/socket.io`, {
      path: `${BASE}/api/socket.io/`,
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

    socket.on("chat:message", (msg: ChatMessage) => {
      setChatMessages(prev => [...prev.slice(-199), msg]);
    });

    socket.on("players:update", (players: OnlinePlayer[]) => {
      setOnlinePlayers(new Map(players.map(p => [p.userId, p])));
    });

    socket.on("admin:announcement", (msg: string) => {
      setAnnouncement(msg);
      setTimeout(() => setAnnouncement(null), 8000);
    });

    socket.on("admin:blackout", () => {
      document.body.style.transition = "background 0.3s";
      document.body.style.background = "#000";
      setTimeout(() => {
        document.body.style.background = "";
      }, 2000);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user]);

  const sendChat = (channel: string, message: string) => {
    socketRef.current?.emit(`chat:${channel}`, { message });
  };

  const sendPosition = (position: PlayerPosition) => {
    socketRef.current?.emit("player:move", { position });
  };

  const joinServer = (serverId: number) => {
    socketRef.current?.emit("server:join", { serverId });
    setCurrentServerId(serverId);
  };

  const leaveServer = () => {
    socketRef.current?.emit("server:leave");
    setCurrentServerId(null);
  };

  const clearAnnouncement = () => setAnnouncement(null);

  return (
    <SocketContext.Provider value={{
      socket: socketRef.current,
      isConnected,
      chatMessages,
      onlinePlayers,
      sendChat,
      sendPosition,
      joinServer,
      leaveServer,
      currentServerId,
      announcement,
      clearAnnouncement,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
