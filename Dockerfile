FROM node:22-slim

WORKDIR /app

# pnpm v9 안정 버전 사용
RUN npm install -g pnpm@9.15.4

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PATH}:${PNPM_HOME}"

COPY . .

# 1. 의존성 설치 및 앱 빌드 (DB 연결 불필요한 빌드 작업만 진행)
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/api-spec run codegen
RUN pnpm build

EXPOSE 5000

# 2. 컨테이너가 실제로 켜질 때 DB 마이그레이션 실행 후 서버 스타트
CMD ["sh", "-c", "pnpm --filter @workspace/db run push && node artifacts/api-server/dist/index.mjs"]
