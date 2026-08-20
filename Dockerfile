# 1. Build Stage
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 패키지 매니저 락파일 및 설정 복사
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/maze-game/package.json ./artifacts/maze-game/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/
COPY scripts/package.json ./scripts/

# esbuild 승인 후 설치 실행
RUN pnpm approve-builds esbuild && \
    pnpm install --no-frozen-lockfile

# 소스코드 전체 복사 및 빌드
COPY . .
RUN pnpm run build

# 2. Production Stage
FROM node:22-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV NODE_ENV=production

# 빌드 결과물 및 필수 설정 파일 복사
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/artifacts ./artifacts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 5000

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]