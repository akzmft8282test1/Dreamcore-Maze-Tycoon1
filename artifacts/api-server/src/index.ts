// 서버 진입점: Express + Socket.io HTTP 서버 초기화
import { createServer } from "http";
import app from "./app";
import { initSocket } from "./lib/socket";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT 환경 변수가 필요합니다.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`잘못된 PORT 값: "${rawPort}"`);
}

// HTTP 서버 생성 (Socket.io 연결을 위해 필요)
const httpServer = createServer(app);

// Socket.io 초기화
initSocket(httpServer);

httpServer.listen(port, () => {
  logger.info({ port }, "드림코어 미로 타이쿤 서버 시작");
});
