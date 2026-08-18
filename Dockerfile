FROM node:22-slim

WORKDIR /app

# pnpm v9 고정
RUN npm install -g pnpm@9.15.4

# 빌드 및 실행 시 필요한 기본 환경변수 정의 (mockup-sandbox 빌드 오류 방지)
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PATH}:${PNPM_HOME}"
ENV PORT=5000
ENV NODE_ENV=production

COPY . .

# 빌드 진행
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/api-spec run codegen
RUN pnpm build

EXPOSE 5000

# 컨테이너 시작 시 DB 마이그레이션 수행 후 서버 실행
CMD ["sh", "-c", "pnpm --filter @workspace/db run push && node artifacts/api-server/dist/index.mjs"]
