FROM node:22-slim

WORKDIR /app

# pnpm v9 고정
RUN npm install -g pnpm@9.15.4

# 빌드 타임 필수 환경변수 선언
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PATH}:${PNPM_HOME}"
ENV PORT=5000
ENV BASE_PATH="/"

COPY . .

# 1. 의존성 전체 설치 (devDependencies 포함)
RUN pnpm install --no-frozen-lockfile

# 2. 코드 생성 및 앱 빌드 진행
RUN pnpm --filter @workspace/api-spec run codegen
RUN pnpm build

# 3. 런타임 환경변수 설정
ENV NODE_ENV=production

EXPOSE 5000

# 컨테이너 시작 시 DB 마이그레이션 후 서버 실행
CMD ["sh", "-c", "pnpm --filter @workspace/db run push && node artifacts/api-server/dist/index.mjs"]
