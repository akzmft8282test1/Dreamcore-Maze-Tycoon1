// 게임 상태, 업그레이드, 스냅샷 라우트
import { Router } from "express";
import type { IRouter } from "express";
import { db, gameStatesTable, snapshotsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { UPGRADES } from "../lib/shop-data";

const router: IRouter = Router();

// GET /api/game/state — 내 게임 상태 조회
router.get("/game/state", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;

  let [state] = await db.select().from(gameStatesTable)
    .where(eq(gameStatesTable.userId, user.id));

  // 상태가 없으면 초기화
  if (!state) {
    [state] = await db.insert(gameStatesTable).values({
      userId: user.id,
      level: 1,
      currency: 100,
      upgrades: {},
      position: { x: 0, y: 0, z: 0, mapId: "default" },
      stats: { kills: 0, deaths: 0, distance: 0, roomsExplored: 0 },
    }).returning();
  }

  res.json(state);
});

// PATCH /api/game/state — 게임 상태 저장
router.patch("/game/state", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { level, currency, upgrades, position, stats } = req.body;

  const updateData: Record<string, unknown> = {};
  if (level !== undefined) updateData.level = level;
  if (currency !== undefined) updateData.currency = currency;
  if (upgrades !== undefined) updateData.upgrades = upgrades;
  if (position !== undefined) updateData.position = position;
  if (stats !== undefined) updateData.stats = stats;

  const [state] = await db.update(gameStatesTable)
    .set(updateData)
    .where(eq(gameStatesTable.userId, user.id))
    .returning();

  // 유저 통계도 업데이트
  if (stats?.totalScore !== undefined) {
    await db.update(usersTable)
      .set({ totalScore: stats.totalScore })
      .where(eq(usersTable.id, user.id));
  }

  res.json(state);
});

// GET /api/game/upgrades — 업그레이드 목록
router.get("/game/upgrades", async (_req, res): Promise<void> => {
  res.json(UPGRADES);
});

// POST /api/game/upgrades/:upgradeId/purchase — 업그레이드 구매
router.post("/game/upgrades/:upgradeId/purchase", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const upgradeId = Array.isArray(req.params.upgradeId) ? req.params.upgradeId[0] : req.params.upgradeId;

  const upgrade = UPGRADES.find(u => u.id === upgradeId);
  if (!upgrade) {
    res.status(404).json({ error: "업그레이드를 찾을 수 없습니다" });
    return;
  }

  const [state] = await db.select().from(gameStatesTable)
    .where(eq(gameStatesTable.userId, user.id));

  if (!state) {
    res.status(400).json({ error: "게임 상태가 없습니다" });
    return;
  }

  const currentUpgrades = (state.upgrades as Record<string, number>) || {};
  const currentLevel = currentUpgrades[upgradeId] || 0;

  if (currentLevel >= upgrade.maxLevel) {
    res.status(400).json({ error: "이미 최대 레벨입니다" });
    return;
  }

  const totalCost = upgrade.cost * (currentLevel + 1);
  if (state.currency < totalCost) {
    res.status(400).json({ error: `재화가 부족합니다 (필요: ${totalCost})` });
    return;
  }

  const newUpgrades = { ...currentUpgrades, [upgradeId]: currentLevel + 1 };
  const [updatedState] = await db.update(gameStatesTable)
    .set({
      currency: state.currency - totalCost,
      upgrades: newUpgrades,
    })
    .where(eq(gameStatesTable.userId, user.id))
    .returning();

  res.json(updatedState);
});

// GET /api/game/snapshot — 스냅샷 목록
router.get("/game/snapshot", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const snapshots = await db.select().from(snapshotsTable)
    .where(eq(snapshotsTable.userId, user.id));
  res.json(snapshots);
});

// POST /api/game/snapshot — 스냅샷 생성
router.post("/game/snapshot", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;

  const [state] = await db.select().from(gameStatesTable)
    .where(eq(gameStatesTable.userId, user.id));

  if (!state) {
    res.status(400).json({ error: "저장할 게임 상태가 없습니다" });
    return;
  }

  const [snapshot] = await db.insert(snapshotsTable).values({
    userId: user.id,
    data: state,
  }).returning();

  res.status(201).json(snapshot);
});

// POST /api/game/snapshot/:snapshotId/rollback — 스냅샷 롤백
router.post("/game/snapshot/:snapshotId/rollback", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const raw = Array.isArray(req.params.snapshotId) ? req.params.snapshotId[0] : req.params.snapshotId;
  const snapshotId = parseInt(raw, 10);

  const [snapshot] = await db.select().from(snapshotsTable)
    .where(eq(snapshotsTable.id, snapshotId));

  if (!snapshot || snapshot.userId !== user.id) {
    res.status(404).json({ error: "스냅샷을 찾을 수 없습니다" });
    return;
  }

  const data = snapshot.data as any;
  await db.update(gameStatesTable)
    .set({
      level: data.level,
      currency: data.currency,
      upgrades: data.upgrades,
      position: data.position,
      stats: data.stats,
    })
    .where(eq(gameStatesTable.userId, user.id));

  res.json({ message: "스냅샷으로 복구되었습니다" });
});

export default router;
