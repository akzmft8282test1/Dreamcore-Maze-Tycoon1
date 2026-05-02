// 상점 라우트: 아이템 구매 및 스킨 장착
import { Router } from "express";
import type { IRouter } from "express";
import { db, usersTable, inventoryTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { SHOP_ITEMS } from "../lib/shop-data";

const router: IRouter = Router();

// GET /api/shop/items — 상점 아이템 목록
router.get("/shop/items", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const isAdmin = user.role === "admin" || user.role === "master";
  // 관리자 전용 아이템은 관리자에게만 표시
  const items = isAdmin ? SHOP_ITEMS : SHOP_ITEMS.filter(i => !i.adminOnly);
  res.json(items);
});

// POST /api/shop/buy — 아이템 구매
router.post("/shop/buy", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { itemId } = req.body;

  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) {
    res.status(400).json({ error: "존재하지 않는 아이템입니다" });
    return;
  }

  if (item.adminOnly && user.role !== "admin" && user.role !== "master") {
    res.status(403).json({ error: "관리자 전용 아이템입니다" });
    return;
  }

  // 이미 보유 중인지 확인
  const [existing] = await db.select().from(inventoryTable)
    .where(and(eq(inventoryTable.userId, user.id), eq(inventoryTable.itemId, itemId)));

  if (existing) {
    res.status(400).json({ error: "이미 보유 중인 아이템입니다" });
    return;
  }

  // 잔액 확인 (관리자 전용 아이템은 무료)
  const cost = item.adminOnly ? 0 : item.price;
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));

  if (currentUser.currency < cost) {
    res.status(400).json({ error: `재화가 부족합니다 (필요: ${cost}, 보유: ${currentUser.currency})` });
    return;
  }

  // 구매 처리
  await db.update(usersTable).set({ currency: currentUser.currency - cost }).where(eq(usersTable.id, user.id));
  await db.insert(inventoryTable).values({
    userId: user.id,
    itemId,
    itemType: item.type,
  });

  res.json({ message: `${item.name}을(를) 구매했습니다` });
});

// POST /api/shop/equip — 스킨 또는 손전등 장착
router.post("/shop/equip", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { itemId } = req.body;

  // 해제 처리 (itemId: null 또는 "none")
  if (!itemId || itemId === "none") {
    await db.update(usersTable).set({ equippedSkin: null }).where(eq(usersTable.id, user.id));
    res.json({ message: "스킨을 해제했습니다" });
    return;
  }

  // 손전등 해제
  if (itemId === "flashlight_none") {
    await db.update(usersTable).set({ equippedFlashlight: null }).where(eq(usersTable.id, user.id));
    res.json({ message: "손전등을 해제했습니다" });
    return;
  }

  // 인벤토리에 있는지 확인
  const [invItem] = await db.select().from(inventoryTable)
    .where(and(eq(inventoryTable.userId, user.id), eq(inventoryTable.itemId, itemId)));

  if (!invItem) {
    res.status(400).json({ error: "보유하지 않은 아이템입니다" });
    return;
  }

  // 손전등이면 equippedFlashlight, 스킨이면 equippedSkin에 저장
  if (invItem.itemType === "flashlight") {
    await db.update(usersTable).set({ equippedFlashlight: itemId }).where(eq(usersTable.id, user.id));
    res.json({ message: "손전등이 장착되었습니다" });
  } else {
    await db.update(usersTable).set({ equippedSkin: itemId }).where(eq(usersTable.id, user.id));
    res.json({ message: "스킨이 장착되었습니다" });
  }
});

export default router;
