FROM node:20-slim

WORKDIR /app

# npm 경고 방지 및 pnpm 설치
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PATH}:${PNPM_HOME}"
RUN npm install -g pnpm@latest

# 전체 프로젝트 파일 복사
COPY . .

# 의존성 설치, API spec 생성, DB 스키마 업데이트, 빌드 진행
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/api-spec run codegen
RUN pnpm --filter @workspace/db run push
RUN pnpm build

EXPOSE 5000

CMD ["node", "artifacts/api-server/dist/index.mjs"]
