// 관리자 전용 라우트 — 전지전능 버전
import { Router } from "express";
import type { IRouter } from "express";
import {
  db, usersTable, gameServersTable, reportsTable, logsTable,
  anomalyLogsTable, worldSettingsTable, inventoryTable, gameStatesTable,
} from "@workspace/db";
import { count, desc, and, gte, eq, sql } from "drizzle-orm";
import { requireAdmin, requireMaster } from "../lib/auth";
import { onlinePlayers } from "../lib/socket";
import { SHOP_ITEMS } from "../lib/shop-data";

const router: IRouter = Router();

// GET /api/admin/stats — 대시보드 통계
router.get("/admin/stats", requireAdmin, async (_req, res): Promise<void> => {
  const [totalUsers] = await db.select({ count: count() }).from(usersTable);
  const [totalServers] = await db.select({ count: count() }).from(gameServersTable);
  const [activeServers] = await db.select({ count: count() }).from(gameServersTable)
    .where(eq(gameServersTable.status, "active"));
  const [totalReports] = await db.select({ count: count() }).from(reportsTable);
  const [pendingReports] = await db.select({ count: count() }).from(reportsTable)
    .where(eq(reportsTable.status, "pending"));

  const oneDayAgo = new Date(Date.now() - 86400000);
  const [recentSignups] = await db.select({ count: count() }).from(usersTable)
    .where(gte(usersTable.createdAt, oneDayAgo));

  const allUsers = await db.select({ currency: usersTable.currency }).from(usersTable);
  const totalCurrency = allUsers.reduce((sum, u) => sum + u.currency, 0);

  const [bannedUsers] = await db.select({ count: count() }).from(usersTable)
    .where(eq(usersTable.isBanned, true));

  res.json({
    totalUsers: Number(totalUsers.count),
    onlineUsers: onlinePlayers.size,
    totalServers: Number(totalServers.count),
    activeServers: Number(activeServers.count),
    totalCurrencyCirculating: totalCurrency,
    totalReports: Number(totalReports.count),
    pendingReports: Number(pendingReports.count),
    recentSignups: Number(recentSignups.count),
    bannedUsers: Number(bannedUsers.count),
  });
});

// GET /api/admin/logs — 서버 로그 목록
router.get("/admin/logs", requireAdmin, async (req, res): Promise<void> => {
  const limit = parseInt(String(req.query.limit || "100"), 10);
  const type = req.query.type as string | undefined;

  const logs = await db.select().from(logsTable)
    .orderBy(desc(logsTable.createdAt))
    .limit(limit);
  const filtered = type ? logs.filter(l => l.type === type) : logs;
  res.json(filtered);
});

// POST /api/admin/announce — 전체 공지 전송
router.post("/admin/announce", requireAdmin, async (req, res): Promise<void> => {
  const { message, channel } = req.body;
  if (!message) { res.status(400).json({ error: "메시지를 입력해주세요" }); return; }

  await db.insert(logsTable).values({
    type: "admin",
    message: `공지 전송: ${message}`,
    metadata: { channel: channel || "global" },
  });
  res.json({ message: "공지가 전송되었습니다" });
});

// GET /api/admin/world-settings — 월드 설정 조회
router.get("/admin/world-settings", requireAdmin, async (_req, res): Promise<void> => {
  let [settings] = await db.select().from(worldSettingsTable);
  if (!settings) {
    [settings] = await db.insert(worldSettingsTable).values({
      complexity: 5, wallThickness: 1.0, trapRate: 0.1,
      mapWarp: false, entitySpawnRate: 0.05, ambientDarkness: 0.7, glitchFrequency: 0.1,
    }).returning();
  }
  res.json(settings);
});

// PATCH /api/admin/world-settings — 월드 설정 변경
router.patch("/admin/world-settings", requireAdmin, async (req, res): Promise<void> => {
  const { complexity, wallThickness, trapRate, mapWarp, entitySpawnRate, ambientDarkness, glitchFrequency } = req.body;
  const [settings] = await db.select().from(worldSettingsTable);
  const updateData: Record<string, unknown> = {};
  if (complexity !== undefined) updateData.complexity = complexity;
  if (wallThickness !== undefined) updateData.wallThickness = wallThickness;
  if (trapRate !== undefined) updateData.trapRate = trapRate;
  if (mapWarp !== undefined) updateData.mapWarp = mapWarp;
  if (entitySpawnRate !== undefined) updateData.entitySpawnRate = entitySpawnRate;
  if (ambientDarkness !== undefined) updateData.ambientDarkness = ambientDarkness;
  if (glitchFrequency !== undefined) updateData.glitchFrequency = glitchFrequency;

  if (settings) {
    const [updated] = await db.update(worldSettingsTable).set(updateData)
      .where(eq(worldSettingsTable.id, settings.id)).returning();
    res.json(updated);
  } else {
    const [created] = await db.insert(worldSettingsTable).values({
      complexity: (complexity as number) || 5, wallThickness: (wallThickness as number) || 1.0,
      trapRate: (trapRate as number) || 0.1, mapWarp: (mapWarp as boolean) || false,
      entitySpawnRate: (entitySpawnRate as number) || 0.05, ambientDarkness: (ambientDarkness as number) || 0.7,
      glitchFrequency: (glitchFrequency as number) || 0.1,
    }).returning();
    res.json(created);
  }
});

// GET /api/admin/anomalies — 이상 현상 로그
router.get("/admin/anomalies", requireAdmin, async (_req, res): Promise<void> => {
  const anomalies = await db.select({
    id: anomalyLogsTable.id,
    userId: anomalyLogsTable.userId,
    nickname: anomalyLogsTable.nickname,
    type: anomalyLogsTable.type,
    detail: anomalyLogsTable.detail,
    severity: anomalyLogsTable.severity,
    createdAt: anomalyLogsTable.createdAt,
  }).from(anomalyLogsTable).orderBy(desc(anomalyLogsTable.createdAt)).limit(200);
  res.json(anomalies);
});

// ─── 새 관리자 전용 라우트 ───────────────────────────────────────────────

// POST /api/admin/users/:id/set-currency — 유저 재화 설정
router.post("/admin/users/:id/set-currency", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id), 10);
  const { amount, mode } = req.body; // mode: "set" | "add" | "subtract"
  if (amount === undefined) { res.status(400).json({ error: "amount 필드가 필요합니다" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "유저를 찾을 수 없습니다" }); return; }

  let newCurrency: number;
  if (mode === "add") newCurrency = Math.max(0, user.currency + Number(amount));
  else if (mode === "subtract") newCurrency = Math.max(0, user.currency - Number(amount));
  else newCurrency = Math.max(0, Number(amount));

  const [updated] = await db.update(usersTable).set({ currency: newCurrency })
    .where(eq(usersTable.id, id)).returning();

  // 게임 상태도 동기화
  await db.update(gameStatesTable).set({ currency: newCurrency })
    .where(eq(gameStatesTable.userId, id));

  await db.insert(logsTable).values({
    type: "admin",
    message: `관리자가 유저 ${user.nickname}(${user.id}) 재화를 ${mode ?? "set"} ${amount} → 최종: ${newCurrency}`,
  });

  res.json({ id: updated.id, nickname: updated.nickname, currency: updated.currency });
});

// POST /api/admin/users/:id/set-role — 유저 역할 변경
router.post("/admin/users/:id/set-role", requireMaster, async (req, res): Promise<void> => {
  const id = parseInt(String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id), 10);
  const { role } = req.body;
  if (!["user", "admin", "master"].includes(role)) {
    res.status(400).json({ error: "유효하지 않은 역할입니다 (user | admin | master)" });
    return;
  }

  const [updated] = await db.update(usersTable).set({ role })
    .where(eq(usersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "유저를 찾을 수 없습니다" }); return; }

  await db.insert(logsTable).values({
    type: "admin",
    message: `관리자가 유저 ${updated.nickname}(${id}) 역할을 ${role}로 변경`,
  });

  res.json({ id: updated.id, nickname: updated.nickname, role: updated.role });
});

// POST /api/admin/users/:id/give-item — 아이템 지급
router.post("/admin/users/:id/give-item", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id), 10);
  const { itemId } = req.body;

  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) { res.status(404).json({ error: "존재하지 않는 아이템입니다" }); return; }

  // 이미 보유 중이면 스킵
  const [existing] = await db.select().from(inventoryTable)
    .where(and(eq(inventoryTable.userId, id), eq(inventoryTable.itemId, itemId)));
  if (existing) { res.status(409).json({ error: "이미 보유 중인 아이템입니다" }); return; }

  await db.insert(inventoryTable).values({
    userId: id,
    itemId: item.id,
    itemType: item.type,
  });

  const [user] = await db.select({ nickname: usersTable.nickname }).from(usersTable).where(eq(usersTable.id, id));
  await db.insert(logsTable).values({
    type: "admin",
    message: `관리자가 유저 ${user?.nickname ?? id}에게 아이템 ${item.name}(${itemId}) 지급`,
  });

  res.json({ message: `${item.name}이(가) 지급되었습니다` });
});

// DELETE /api/admin/users/:id/reset-gamestate — 게임 상태 초기화
router.delete("/admin/users/:id/reset-gamestate", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id), 10);

  await db.delete(gameStatesTable).where(eq(gameStatesTable.userId, id));
  await db.insert(logsTable).values({
    type: "admin",
    message: `관리자가 유저 ${id} 게임 상태 초기화`,
  });

  res.json({ message: "게임 상태가 초기화되었습니다" });
});

// POST /api/admin/economy/give-all — 전체 유저 재화 지급
router.post("/admin/economy/give-all", requireAdmin, async (req, res): Promise<void> => {
  const { amount } = req.body;
  if (!amount || Number(amount) <= 0) { res.status(400).json({ error: "유효한 amount가 필요합니다" }); return; }

  await db.execute(
    sql`UPDATE users SET currency = currency + ${Number(amount)}`
  );
  await db.execute(
    sql`UPDATE game_states SET currency = currency + ${Number(amount)}`
  );

  await db.insert(logsTable).values({
    type: "admin",
    message: `관리자가 전체 유저에게 ${amount} DC 지급`,
  });

  res.json({ message: `전체 유저에게 ${amount} DC가 지급되었습니다` });
});

// GET /api/admin/economy — 경제 현황
router.get("/admin/economy", requireAdmin, async (_req, res): Promise<void> => {
  const allUsers = await db.select({
    id: usersTable.id,
    nickname: usersTable.nickname,
    currency: usersTable.currency,
    totalScore: usersTable.totalScore,
  }).from(usersTable).orderBy(desc(usersTable.currency)).limit(20);

  const [sumResult] = await db.select({ total: sql<number>`SUM(currency)` }).from(usersTable);
  const [avgResult] = await db.select({ avg: sql<number>`AVG(currency)` }).from(usersTable);
  const [maxResult] = await db.select({ max: sql<number>`MAX(currency)` }).from(usersTable);

  res.json({
    totalCirculating: Number(sumResult.total) || 0,
    averageCurrency: Math.round(Number(avgResult.avg) || 0),
    maxCurrency: Number(maxResult.max) || 0,
    richest: allUsers.slice(0, 10),
  });
});

// POST /api/admin/users/:id/reset-password — 비밀번호 초기화
router.post("/admin/users/:id/reset-password", requireMaster, async (req, res): Promise<void> => {
  const id = parseInt(String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id), 10);
  const { newPassword } = req.body;
  if (!newPassword) { res.status(400).json({ error: "newPassword 필드가 필요합니다" }); return; }

  const bcrypt = await import("bcryptjs");
  const hashed = await bcrypt.hash(newPassword, 10);

  const [updated] = await db.update(usersTable).set({ password: hashed })
    .where(eq(usersTable.id, id)).returning({ id: usersTable.id, nickname: usersTable.nickname });
  if (!updated) { res.status(404).json({ error: "유저를 찾을 수 없습니다" }); return; }

  await db.insert(logsTable).values({
    type: "admin",
    message: `관리자가 유저 ${updated.nickname}(${id}) 비밀번호 초기화`,
  });

  res.json({ message: "비밀번호가 초기화되었습니다" });
});

// DELETE /api/admin/users/:id/clear-inventory — 인벤토리 초기화
router.delete("/admin/users/:id/clear-inventory", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id), 10);
  await db.delete(inventoryTable).where(eq(inventoryTable.userId, id));
  await db.insert(logsTable).values({ type: "admin", message: `관리자가 유저 ${id} 인벤토리 초기화` });
  res.json({ message: "인벤토리가 초기화되었습니다" });
});

// POST /api/admin/broadcast-event — 전체 서버 이벤트 발생
router.post("/admin/broadcast-event", requireAdmin, async (req, res): Promise<void> => {
  const { eventType, payload } = req.body;
  const validEvents = ["blackout", "entity_surge", "map_warp", "glitch_storm", "currency_rain", "portal_open"];
  if (!validEvents.includes(eventType)) {
    res.status(400).json({ error: `유효하지 않은 이벤트 타입입니다. 가능한 타입: ${validEvents.join(", ")}` });
    return;
  }

  await db.insert(logsTable).values({
    type: "event",
    message: `관리자가 이벤트 발생: ${eventType}`,
    metadata: payload || {},
  });

  res.json({ message: `이벤트 "${eventType}"가 발생했습니다`, eventType });
});

// GET /api/admin/users/:id/gamestate — 특정 유저 게임 상태 조회
router.get("/admin/users/:id/gamestate", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id), 10);
  const [state] = await db.select().from(gameStatesTable).where(eq(gameStatesTable.userId, id));
  if (!state) { res.status(404).json({ error: "게임 상태 없음" }); return; }
  res.json(state);
});

export default router;
