FROM node:22-slim

WORKDIR /app

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PATH}:${PNPM_HOME}"
# pnpm이 esbuild의 빌드 스크립트를 허용하도록 환경변수 추가
ENV PNPM_ALLOW_BUILD=esbuild

RUN npm install -g pnpm@latest

COPY . .

# config를 통해 빌드 스크립트 강제 허용 후 설치
RUN pnpm config set only-built-dependencies esbuild
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/api-spec run codegen
RUN pnpm --filter @workspace/db run push
RUN pnpm build

EXPOSE 5000

CMD ["node", "artifacts/api-server/dist/index.mjs"]
