// Socket.io 서버 설정 및 실시간 게임 이벤트 처리
import { Server as SocketServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { verifyToken } from "./auth";
import { db, usersTable, chatMessagesTable, gameStatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// 온라인 플레이어 상태 관리
export const onlinePlayers = new Map<string, {
  userId: number;
  nickname: string;
  role: string;
  serverId?: number;
  position?: { x: number; y: number; z: number };
  socketId: string;
}>();

let io: SocketServer;

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/api/socket.io",
  });

  // JWT 인증 미들웨어
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      next(new Error("인증 토큰이 없습니다"));
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      next(new Error("유효하지 않은 토큰입니다"));
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
    if (!user) {
      next(new Error("유저를 찾을 수 없습니다"));
      return;
    }
    (socket as any).user = user;
    next();
  });

  io.on("connection", (socket) => {
    const user = (socket as any).user;
    logger.info({ userId: user.id, nickname: user.nickname }, "플레이어 접속");

    // 온라인 목록에 추가
    onlinePlayers.set(socket.id, {
      userId: user.id,
      nickname: user.nickname,
      role: user.role,
      socketId: socket.id,
    });

    // 마지막 접속 시간 업데이트
    db.update(usersTable).set({ lastSeen: new Date() }).where(eq(usersTable.id, user.id)).catch(() => {});

    // 전체 채팅
    socket.on("chat:global", async (data: { message: string }) => {
      if (user.isBanned) {
        socket.emit("error", { message: "채팅이 금지된 계정입니다" });
        return;
      }
      const msg = {
        userId: user.id,
        nickname: user.nickname,
        channel: "global",
        message: data.message.slice(0, 500),
      };
      // DB에 저장
      await db.insert(chatMessagesTable).values(msg).catch(() => {});
      io.emit("chat:message", { ...msg, createdAt: new Date().toISOString() });
    });

    // 서버 채팅
    socket.on("chat:server", async (data: { message: string; serverId: number }) => {
      if (user.isBanned) return;
      const msg = {
        userId: user.id,
        nickname: user.nickname,
        channel: `server:${data.serverId}`,
        message: data.message.slice(0, 500),
      };
      await db.insert(chatMessagesTable).values(msg).catch(() => {});
      io.to(`server:${data.serverId}`).emit("chat:message", { ...msg, createdAt: new Date().toISOString() });
    });

    // 팀 채팅
    socket.on("chat:team", async (data: { message: string; teamId: string }) => {
      if (user.isBanned) return;
      const msg = {
        userId: user.id,
        nickname: user.nickname,
        channel: `team:${data.teamId}`,
        message: data.message.slice(0, 500),
      };
      await db.insert(chatMessagesTable).values(msg).catch(() => {});
      io.to(`team:${data.teamId}`).emit("chat:message", { ...msg, createdAt: new Date().toISOString() });
    });

    // 파티 채팅
    socket.on("chat:party", async (data: { message: string; partyId: string }) => {
      if (user.isBanned) return;
      const msg = {
        userId: user.id,
        nickname: user.nickname,
        channel: `party:${data.partyId}`,
        message: data.message.slice(0, 500),
      };
      await db.insert(chatMessagesTable).values(msg).catch(() => {});
      io.to(`party:${data.partyId}`).emit("chat:message", { ...msg, createdAt: new Date().toISOString() });
    });

    // 관리자 채팅
    socket.on("chat:admin", async (data: { message: string }) => {
      if (user.role !== "admin" && user.role !== "master") return;
      const msg = {
        userId: user.id,
        nickname: user.nickname,
        channel: "admin",
        message: data.message.slice(0, 500),
      };
      await db.insert(chatMessagesTable).values(msg).catch(() => {});
      // 관리자들에게만 전송
      for (const [sid, player] of onlinePlayers) {
        if (player.role === "admin" || player.role === "master") {
          io.to(sid).emit("chat:message", { ...msg, createdAt: new Date().toISOString() });
        }
      }
    });

    // 플레이어 위치 동기화
    socket.on("player:move", (data: { x: number; y: number; z: number; rotY: number }) => {
      const player = onlinePlayers.get(socket.id);
      if (player) {
        player.position = data;
        // 같은 서버의 유저들에게 위치 전송
        if (player.serverId) {
          socket.to(`server:${player.serverId}`).emit("player:moved", {
            userId: user.id,
            nickname: user.nickname,
            skin: user.equippedSkin,
            ...data,
          });
        }
      }
    });

    // 서버 입장
    socket.on("server:join", (data: { serverId: number }) => {
      const player = onlinePlayers.get(socket.id);
      if (player) {
        if (player.serverId) socket.leave(`server:${player.serverId}`);
        player.serverId = data.serverId;
        socket.join(`server:${data.serverId}`);
        io.to(`server:${data.serverId}`).emit("server:playerJoined", {
          userId: user.id,
          nickname: user.nickname,
        });
      }
    });

    // 서버 퇴장
    socket.on("server:leave", () => {
      const player = onlinePlayers.get(socket.id);
      if (player?.serverId) {
        io.to(`server:${player.serverId}`).emit("server:playerLeft", {
          userId: user.id,
          nickname: user.nickname,
        });
        socket.leave(`server:${player.serverId}`);
        player.serverId = undefined;
      }
    });

    // ── 관리자 소켓 이벤트 ──

    // 유저 소환 (납치)
    socket.on("admin:teleport", (data: { targetUserId: number; position: object }) => {
      if (user.role !== "admin" && user.role !== "master") return;
      for (const [sid, player] of onlinePlayers) {
        if (player.userId === data.targetUserId) {
          io.to(sid).emit("admin:forceTeleport", data.position);
          break;
        }
      }
    });

    // 강제 채팅
    socket.on("admin:forceChat", (data: { targetUserId: number; message: string; channel: string }) => {
      if (user.role !== "admin" && user.role !== "master") return;
      for (const [sid, player] of onlinePlayers) {
        if (player.userId === data.targetUserId) {
          io.to(sid).emit("admin:forcedMessage", { message: data.message, channel: data.channel });
          break;
        }
      }
      // 채널에 해당 메시지를 해당 유저 이름으로 발송
      io.emit("chat:message", {
        userId: data.targetUserId,
        nickname: "[강제]",
        channel: data.channel,
        message: data.message,
        createdAt: new Date().toISOString(),
      });
    });

    // 서버 블랙아웃
    socket.on("admin:blackout", () => {
      if (user.role !== "admin" && user.role !== "master") return;
      io.emit("admin:blackout");
    });

    // 전체 공지 (실시간)
    socket.on("admin:broadcast", (data: { message: string }) => {
      if (user.role !== "admin" && user.role !== "master") return;
      io.emit("admin:announcement", { message: data.message, from: user.nickname });
    });

    // 엔티티 소환
    socket.on("admin:spawnEntity", (data: { type: string; position: object; serverId: number }) => {
      if (user.role !== "admin" && user.role !== "master") return;
      io.to(`server:${data.serverId}`).emit("entity:spawn", {
        type: data.type,
        position: data.position,
        id: `entity_${Date.now()}`,
      });
    });

    // 노클립 토글
    socket.on("admin:noclip", (data: { targetUserId: number; enabled: boolean }) => {
      if (user.role !== "admin" && user.role !== "master") return;
      for (const [sid, player] of onlinePlayers) {
        if (player.userId === data.targetUserId) {
          io.to(sid).emit("admin:noclipToggle", { enabled: data.enabled });
          break;
        }
      }
    });

    // 실시간 코드 주입 (Live 기능)
    socket.on("admin:inject", (data: { code: string; targets: string }) => {
      if (user.role !== "master") return;
      if (data.targets === "all") {
        io.emit("admin:executeCode", { code: data.code });
      } else {
        io.to(data.targets).emit("admin:executeCode", { code: data.code });
      }
    });

    // 실시간 설문
    socket.on("admin:survey", (data: { question: string; options: string[] }) => {
      if (user.role !== "admin" && user.role !== "master") return;
      io.emit("admin:survey", { question: data.question, options: data.options, id: Date.now() });
    });

    // 설문 응답
    socket.on("survey:answer", (data: { surveyId: number; answer: string }) => {
      // 관리자들에게 집계 전달
      for (const [sid, player] of onlinePlayers) {
        if (player.role === "admin" || player.role === "master") {
          io.to(sid).emit("survey:result", {
            surveyId: data.surveyId,
            userId: user.id,
            nickname: user.nickname,
            answer: data.answer,
          });
        }
      }
    });

    // 이상 현상 보고
    socket.on("anomaly:report", (data: { type: string; detail: string }) => {
      logger.warn({ userId: user.id, ...data }, "이상 현상 감지");
    });

    // 연결 해제
    socket.on("disconnect", () => {
      const player = onlinePlayers.get(socket.id);
      if (player?.serverId) {
        io.to(`server:${player.serverId}`).emit("server:playerLeft", {
          userId: user.id,
          nickname: user.nickname,
        });
      }
      onlinePlayers.delete(socket.id);
      logger.info({ userId: user.id }, "플레이어 접속 해제");
    });
  });

  return io;
}

export function getIO(): SocketServer {
  return io;
}
