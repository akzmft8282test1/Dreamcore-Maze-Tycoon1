// 관리자 전용 라우트
import { Router } from "express";
import type { IRouter } from "express";
import { db, usersTable, gameServersTable, reportsTable, logsTable, anomalyLogsTable, worldSettingsTable } from "@workspace/db";
import { count, desc, and, gte, eq } from "drizzle-orm";
import { requireAdmin, requireMaster } from "../lib/auth";
import { onlinePlayers } from "../lib/socket";

const router: IRouter = Router();

// GET /api/admin/stats — 관리자 대시보드 통계
router.get("/admin/stats", requireAdmin, async (_req, res): Promise<void> => {
  const [totalUsers] = await db.select({ count: count() }).from(usersTable);
  const [totalServers] = await db.select({ count: count() }).from(gameServersTable);
  const [activeServers] = await db.select({ count: count() }).from(gameServersTable)
    .where(eq(gameServersTable.status, "active"));
  const [totalReports] = await db.select({ count: count() }).from(reportsTable);
  const [pendingReports] = await db.select({ count: count() }).from(reportsTable)
    .where(eq(reportsTable.status, "pending"));

  // 최근 24시간 가입자
  const oneDayAgo = new Date(Date.now() - 86400000);
  const [recentSignups] = await db.select({ count: count() }).from(usersTable)
    .where(gte(usersTable.createdAt, oneDayAgo));

  // 전체 순환 재화 합산
  const allUsers = await db.select({ currency: usersTable.currency }).from(usersTable);
  const totalCurrency = allUsers.reduce((sum, u) => sum + u.currency, 0);

  res.json({
    totalUsers: Number(totalUsers.count),
    onlineUsers: onlinePlayers.size,
    totalServers: Number(totalServers.count),
    activeServers: Number(activeServers.count),
    totalCurrencyCirculating: totalCurrency,
    totalReports: Number(totalReports.count),
    pendingReports: Number(pendingReports.count),
    recentSignups: Number(recentSignups.count),
  });
});

// GET /api/admin/logs — 서버 로그 목록
router.get("/admin/logs", requireAdmin, async (req, res): Promise<void> => {
  const limit = parseInt(String(req.query.limit || "100"), 10);
  const type = req.query.type as string | undefined;

  let query = db.select().from(logsTable)
    .orderBy(desc(logsTable.createdAt))
    .limit(limit);

  const logs = await query;
  const filtered = type ? logs.filter(l => l.type === type) : logs;
  res.json(filtered);
});

// POST /api/admin/announce — 전체 공지 전송
router.post("/admin/announce", requireAdmin, async (req, res): Promise<void> => {
  const { message, channel } = req.body;

  if (!message) {
    res.status(400).json({ error: "메시지를 입력해주세요" });
    return;
  }

  // DB에 로그 저장
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
      complexity: 5,
      wallThickness: 1.0,
      trapRate: 0.1,
      mapWarp: false,
      entitySpawnRate: 0.05,
      ambientDarkness: 0.7,
      glitchFrequency: 0.1,
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
      complexity: complexity || 5,
      wallThickness: wallThickness || 1.0,
      trapRate: trapRate || 0.1,
      mapWarp: mapWarp || false,
      entitySpawnRate: entitySpawnRate || 0.05,
      ambientDarkness: ambientDarkness || 0.7,
      glitchFrequency: glitchFrequency || 0.1,
    }).returning();
    res.json(created);
  }
});

// GET /api/admin/anomalies — 이상 현상 로그
router.get("/admin/anomalies", requireAdmin, async (_req, res): Promise<void> => {
  const anomalies = await db
    .select({
      id: anomalyLogsTable.id,
      userId: anomalyLogsTable.userId,
      nickname: anomalyLogsTable.nickname,
      type: anomalyLogsTable.type,
      detail: anomalyLogsTable.detail,
      severity: anomalyLogsTable.severity,
      createdAt: anomalyLogsTable.createdAt,
    })
    .from(anomalyLogsTable)
    .orderBy(desc(anomalyLogsTable.createdAt))
    .limit(200);

  res.json(anomalies);
});

export default router;
