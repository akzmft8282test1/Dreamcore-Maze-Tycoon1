FROM node:22-slim

WORKDIR /app

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PATH}:${PNPM_HOME}"
RUN npm install -g pnpm@latest

COPY . .

# 빌드 스크립트 허용 옵션 추가
RUN pnpm install --no-frozen-lockfile --unsafe-perm
RUN pnpm --filter @workspace/api-spec run codegen
RUN pnpm --filter @workspace/db run push
RUN pnpm build

EXPOSE 5000

CMD ["node", "artifacts/api-server/dist/index.mjs"]
