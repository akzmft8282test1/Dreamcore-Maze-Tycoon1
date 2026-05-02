// 방명록 벽 라우트
import { Router } from "express";
import type { IRouter } from "express";
import { db, guestbookTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// GET /api/guestbook — 방명록 메시지 조회
router.get("/guestbook", async (req, res): Promise<void> => {
  const wallId = (req.query.wallId as string) || "main";

  const messages = await db.select().from(guestbookTable)
    .where(eq(guestbookTable.wallId, wallId))
    .orderBy(desc(guestbookTable.createdAt))
    .limit(100);

  res.json(messages.reverse());
});

// POST /api/guestbook — 방명록 작성
router.post("/guestbook", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { message, wallId = "main" } = req.body;

  if (!message || message.trim().length === 0) {
    res.status(400).json({ error: "메시지를 입력해주세요" });
    return;
  }

  const [entry] = await db.insert(guestbookTable).values({
    userId: user.id,
    nickname: user.nickname,
    message: message.slice(0, 200),
    wallId,
  }).returning();

  res.status(201).json(entry);
});

export default router;
