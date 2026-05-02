// 라우터 인덱스: 모든 라우트를 하나로 합침
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import gameRouter from "./game";
import serversRouter from "./servers";
import shopRouter from "./shop";
import leaderboardRouter from "./leaderboard";
import adminRouter from "./admin";
import reportsRouter from "./reports";
import chatRouter from "./chat";
import guestbookRouter from "./guestbook";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(gameRouter);
router.use(serversRouter);
router.use(shopRouter);
router.use(leaderboardRouter);
router.use(adminRouter);
router.use(reportsRouter);
router.use(chatRouter);
router.use(guestbookRouter);

export default router;
