# 드림코어 미로 타이쿤

오픈월드 무한 미로 타이쿤 게임. 드림코어 감성의 리미널 스페이스를 탐험하는 풀스택 멀티플레이어 게임.

## 아키텍처

- **프론트엔드**: React + Vite (`artifacts/maze-game`, 경로 `/`)
- **백엔드**: Express + Socket.io (`artifacts/api-server`, 경로 `/api`)
- **데이터베이스**: PostgreSQL + Drizzle ORM (`lib/db`)
- **API 클라이언트**: Orval 생성 React Query 훅 (`lib/api-client-react`)

## 핵심 기능

### 게임
- Three.js 기반 3D 1인칭 미로 (Recursive Backtracking 알고리즘)
- 2D 미니맵 뷰 (V키 전환)
- 드림코어 이벤트: 글리치, 팝업 메시지, 형광등 깜빡임
- 엔티티 AI: Peeker(구석에서 나타남), Stalker(추적)

### 멀티플레이어 (Socket.io)
- 실시간 채팅: 전체/서버/팀/파티/관리자 채널
- 플레이어 위치 동기화
- 서버 입장/퇴장

### 타이쿤 시스템
- 업그레이드: 이동속도, 기억추출기, 시야강화, 체력강화, 루팅범위
- 상점: 스킨(7종+관리자전용2), 손전등(4종)
- 게임 상태 스냅샷 저장/롤백

### 관리자 콘솔 (`/admin`)
- 진입 시퀀스: ↑↓↑←↑→↑ (잘못 입력하면 리셋)
- 탭: 대시보드/유저관리/월드제어/서버제어/터미널/로그/신고
- 유저 관리: 비밀번호 확인, 채팅금지/해제, 삭제
- 월드 제어: 복잡도/함정비율/어둠/맵워프 슬라이더
- 웹 터미널: Tab자동완성, 히스토리(↑↓), 다양한 관리 명령어
- 첫 번째 가입자가 마스터 관리자

## 페이지 구조

| 경로 | 설명 |
|------|------|
| `/` | 로그인/회원가입 |
| `/lobby` | 서버 목록 + 서버 생성 |
| `/game` | 3D 미로 게임 화면 |
| `/shop` | 스킨/장비/업그레이드 상점 |
| `/leaderboard` | 명예의 전당 |
| `/profile` | 내 프로필/인벤토리/스냅샷 |
| `/admin` | 관리자 콘솔 (시퀀스 진입) |

## 인증

- JWT Bearer 토큰 (localStorage `token` 키)
- `SESSION_SECRET` 환경 변수로 서명
- 첫 번째 가입자 → `master` 역할

## DB 스키마 (`lib/db/src/schema/`)

- `users`: 유저 정보, 역할(master/admin/user), 재화, 스킨
- `game_states`: 레벨, 재화, 업그레이드, 위치, 통계
- `inventory`: 보유 아이템
- `game_servers`: 서버 정보, 게임 모드
- `chat_messages`: 채팅 로그 (채널별)
- `reports`: 신고 내역
- `logs` / `anomaly_logs`: 서버 로그, 이상 현상
- `snapshots`: 게임 상태 스냅샷
- `guestbook`: 방명록
- `world_settings`: 월드 전역 설정

## 환경 변수

- `DATABASE_URL` — Replit PostgreSQL (자동 설정)
- `SESSION_SECRET` — JWT 시크릿 (Replit Secret)
- `PORT` — 서버 포트 (워크플로우 자동 설정)
- `NODE_ENV` — development/production

## 주요 의존성

### 백엔드
- express, socket.io, drizzle-orm, pg
- bcryptjs, jsonwebtoken
- pino (구조화된 로깅)

### 프론트엔드
- three.js (3D 미로 렌더링)
- socket.io-client (실시간 통신)
- framer-motion (애니메이션)
- @tanstack/react-query (서버 상태)
- wouter (라우팅)
- shadcn/ui + tailwindcss (UI)
- howler.js (사운드, 미래 확장)

## 개발 명령어

```bash
# API 서버 시작
pnpm --filter @workspace/api-server run dev

# 프론트엔드 시작
pnpm --filter @workspace/maze-game run dev

# DB 스키마 푸시
pnpm --filter @workspace/db run push

# API 코드젠 (OpenAPI → React Query 훅)
pnpm --filter @workspace/api-spec run codegen
```
