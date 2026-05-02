// 유저 관련 라우트 (관리자용 유저 관리 포함)
import { Router } from "express";
import type { IRouter } from "express";
import { db, usersTable, inventoryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

// GET /api/users — 전체 유저 목록 (관리자용, 비밀번호 포함)
router.get("/users", requireAdmin, async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(users);
});

// GET /api/users/:id — 특정 유저 조회
router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "유저를 찾을 수 없습니다" });
    return;
  }

  res.json({
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    role: user.role,
    currency: user.currency,
    equippedSkin: user.equippedSkin,
    isBanned: user.isBanned,
    totalScore: user.totalScore,
    playtime: user.playtime,
    createdAt: user.createdAt,
  });
});

// PATCH /api/users/:id — 유저 정보 수정 (관리자)
router.patch("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { nickname, role, currency } = req.body;

  const updateData: Record<string, unknown> = {};
  if (nickname !== undefined) updateData.nickname = nickname;
  if (role !== undefined) updateData.role = role;
  if (currency !== undefined) updateData.currency = currency;

  const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
  if (!user) {
    res.status(404).json({ error: "유저를 찾을 수 없습니다" });
    return;
  }

  res.json({
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    role: user.role,
    currency: user.currency,
    equippedSkin: user.equippedSkin,
    isBanned: user.isBanned,
    totalScore: user.totalScore,
    playtime: user.playtime,
    createdAt: user.createdAt,
  });
});

// DELETE /api/users/:id — 유저 삭제 (관리자)
router.delete("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

// POST /api/users/:id/ban — 채팅 금지/해제
router.post("/users/:id/ban", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { banned } = req.body;

  await db.update(usersTable).set({ isBanned: !!banned }).where(eq(usersTable.id, id));
  res.json({ message: banned ? "채팅 금지 처리되었습니다" : "채팅 금지가 해제되었습니다" });
});

// GET /api/users/:id/inventory — 인벤토리 조회
router.get("/users/:id/inventory", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const currentUser = (req as any).user;

  // 본인이거나 관리자만 조회 가능
  if (currentUser.id !== id && currentUser.role !== "admin" && currentUser.role !== "master") {
    res.status(403).json({ error: "권한이 없습니다" });
    return;
  }

  const items = await db.select().from(inventoryTable).where(eq(inventoryTable.userId, id));
  res.json(items);
});

// DELETE /api/users/:id/inventory — 인벤토리 초기화 (관리자)
router.delete("/users/:id/inventory", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  await db.delete(inventoryTable).where(eq(inventoryTable.userId, id));
  res.json({ message: "인벤토리가 초기화되었습니다" });
});

export default router;
