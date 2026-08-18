#!/usr/bin/env bash
set -e

# npx로 pnpm 구동
npx pnpm install --no-frozen-lockfile
npx pnpm --filter @workspace/api-spec run codegen
npx pnpm --filter @workspace/db run push
npx pnpm build
