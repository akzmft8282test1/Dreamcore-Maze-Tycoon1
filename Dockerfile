FROM node:22-slim

WORKDIR /app

# [방어 1] pnpm v9으로 버전 다운그레이드 고정 (v10의 무조건적인 빌드 스크립트 블로킹 차단)
RUN npm install -g pnpm@9.15.4

# [방어 2] 모든 종류의 빌드 허용 관련 환경변수 선언
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PATH}:${PNPM_HOME}"
ENV COREPACK_ENABLE_STRICT=0
ENV PNPM_ALLOW_BUILD="*"

COPY . .

# [방어 3] pnpm-workspace.yaml에 esbuild 및 모든 패키지 빌드 스크립트 허용 추가
RUN echo "onlyBuiltDependencies:\n  - esbuild\n  - '@esbuild-kit/esm-loader'" >> pnpm-workspace.yaml || true

# [방어 4] pnpm approve-builds 및 ignore-scripts 무력화로 안전하게 설치
RUN pnpm config set ignore-scripts false || true
RUN pnpm install --no-frozen-lockfile --unsafe-perm

# 프로젝트 빌드 진행
RUN pnpm --filter @workspace/api-spec run codegen
RUN pnpm --filter @workspace/db run push
RUN pnpm build

EXPOSE 5000

CMD ["node", "artifacts/api-server/dist/index.mjs"]
