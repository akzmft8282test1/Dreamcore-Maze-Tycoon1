// 게임 서버 관련 라우트
import { Router } from "express";
import type { IRouter } from "express";
import { db, gameServersTable, usersTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { onlinePlayers } from "../lib/socket";

const router: IRouter = Router();

// GET /api/servers/stats — 서버 통계 (관리자용)
router.get("/servers/stats", requireAdmin, async (req, res): Promise<void> => {
  const [totalServers] = await db.select({ count: count() }).from(gameServersTable);
  const [activeServers] = await db.select({ count: count() }).from(gameServersTable)
    .where(eq(gameServersTable.status, "active"));

  const totalPlayers = await db.select({ count: count() }).from(usersTable);

  res.json({
    totalServers: Number(totalServers.count),
    activeServers: Number(activeServers.count),
    totalPlayers: Number(totalPlayers[0].count),
    onlinePlayers: onlinePlayers.size,
  });
});

// GET /api/servers — 서버 목록
router.get("/servers", requireAuth, async (req, res): Promise<void> => {
  const servers = await db
    .select({
      id: gameServersTable.id,
      name: gameServersTable.name,
      ownerId: gameServersTable.ownerId,
      ownerNickname: usersTable.nickname,
      mode: gameServersTable.mode,
      maxPlayers: gameServersTable.maxPlayers,
      currentPlayers: gameServersTable.currentPlayers,
      isPublic: gameServersTable.isPublic,
      complexity: gameServersTable.complexity,
      trapRate: gameServersTable.trapRate,
      mapWarp: gameServersTable.mapWarp,
      status: gameServersTable.status,
      createdAt: gameServersTable.createdAt,
    })
    .from(gameServersTable)
    .leftJoin(usersTable, eq(gameServersTable.ownerId, usersTable.id))
    .where(eq(gameServersTable.status, "active"));

  res.json(servers);
});

// POST /api/servers — 서버 생성
router.post("/servers", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { name, mode = "explore", maxPlayers = 8, isPublic = true, complexity = 5, trapRate = 0.1, mapWarp = false } = req.body;

  if (!name || name.trim().length === 0) {
    res.status(400).json({ error: "서버 이름을 입력해주세요" });
    return;
  }

  const [server] = await db.insert(gameServersTable).values({
    name: name.trim(),
    ownerId: user.id,
    mode,
    maxPlayers,
    isPublic,
    complexity,
    trapRate,
    mapWarp,
  }).returning();

  res.status(201).json({
    ...server,
    ownerNickname: user.nickname,
  });
});

// GET /api/servers/:serverId — 서버 정보 조회
router.get("/servers/:serverId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.serverId) ? req.params.serverId[0] : req.params.serverId;
  const serverId = parseInt(raw, 10);

  const [server] = await db
    .select({
      id: gameServersTable.id,
      name: gameServersTable.name,
      ownerId: gameServersTable.ownerId,
      ownerNickname: usersTable.nickname,
      mode: gameServersTable.mode,
      maxPlayers: gameServersTable.maxPlayers,
      currentPlayers: gameServersTable.currentPlayers,
      isPublic: gameServersTable.isPublic,
      complexity: gameServersTable.complexity,
      trapRate: gameServersTable.trapRate,
      mapWarp: gameServersTable.mapWarp,
      status: gameServersTable.status,
      createdAt: gameServersTable.createdAt,
    })
    .from(gameServersTable)
    .leftJoin(usersTable, eq(gameServersTable.ownerId, usersTable.id))
    .where(eq(gameServersTable.id, serverId));

  if (!server) {
    res.status(404).json({ error: "서버를 찾을 수 없습니다" });
    return;
  }

  res.json(server);
});

// PATCH /api/servers/:serverId — 서버 설정 변경
router.patch("/servers/:serverId", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const raw = Array.isArray(req.params.serverId) ? req.params.serverId[0] : req.params.serverId;
  const serverId = parseInt(raw, 10);

  const [server] = await db.select().from(gameServersTable).where(eq(gameServersTable.id, serverId));
  if (!server) {
    res.status(404).json({ error: "서버를 찾을 수 없습니다" });
    return;
  }

  // 소유자 또는 관리자만 수정 가능
  if (server.ownerId !== user.id && user.role !== "admin" && user.role !== "master") {
    res.status(403).json({ error: "권한이 없습니다" });
    return;
  }

  const { name, maxPlayers, isPublic, complexity, trapRate, mapWarp, status } = req.body;
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (maxPlayers !== undefined) updateData.maxPlayers = maxPlayers;
  if (isPublic !== undefined) updateData.isPublic = isPublic;
  if (complexity !== undefined) updateData.complexity = complexity;
  if (trapRate !== undefined) updateData.trapRate = trapRate;
  if (mapWarp !== undefined) updateData.mapWarp = mapWarp;
  if (status !== undefined) updateData.status = status;

  const [updated] = await db.update(gameServersTable).set(updateData)
    .where(eq(gameServersTable.id, serverId)).returning();

  res.json({ ...updated, ownerNickname: user.nickname });
});

// DELETE /api/servers/:serverId — 서버 삭제
router.delete("/servers/:serverId", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const raw = Array.isArray(req.params.serverId) ? req.params.serverId[0] : req.params.serverId;
  const serverId = parseInt(raw, 10);

  const [server] = await db.select().from(gameServersTable).where(eq(gameServersTable.id, serverId));
  if (!server) {
    res.status(404).json({ error: "서버를 찾을 수 없습니다" });
    return;
  }

  if (server.ownerId !== user.id && user.role !== "admin" && user.role !== "master") {
    res.status(403).json({ error: "권한이 없습니다" });
    return;
  }

  await db.delete(gameServersTable).where(eq(gameServersTable.id, serverId));
  res.sendStatus(204);
});

export default router;
