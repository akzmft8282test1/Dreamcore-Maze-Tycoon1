// 드림코어/백룸 1인칭 미로 엔진 — Pointer Lock API 가이드 기반으로 전면 재작성
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FLASHLIGHT_PRESETS } from "./flashlight-presets";

// ─── Props ───────────────────────────────────────────────────────────────────
interface MazeEngineProps {
  serverId?: number | null;
  complexity?: number;
  equippedFlashlight?: string | null;
  pointerSensitivity?: number;
  onPositionChange?: (pos: { x: number; y: number; z: number; mapId: string }) => void;
  onFlashlightChange?: (on: boolean) => void;
}

// ─── 상수 ────────────────────────────────────────────────────────────────────
const CELL       = 4;      // 미로 셀 크기 (월드 단위)
const H_WALL     = 2.8;    // 벽 높이
const T_WALL     = 0.18;   // 벽 두께
const P_HEIGHT   = 1.55;   // 눈 높이
const P_RADIUS   = 0.28;   // 충돌 반지름
const SPEED      = 5.5;    // 이동 속도 (units/sec) — clock.getDelta() 기반
const BASE_SENS  = 0.002;  // 기본 감도 (가이드 권장값)
const MAX_PITCH  = Math.PI / 2 - 0.04;

// ─── 미로 생성 (Recursive Backtracker) ───────────────────────────────────────
interface MazeCell {
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  visited: boolean;
}

function generateMaze(w: number, h: number): MazeCell[][] {
  const grid: MazeCell[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({
      walls: { top: true, right: true, bottom: true, left: true },
      visited: false,
    }))
  );
  const opp: Record<string, string> = { top: "bottom", bottom: "top", left: "right", right: "left" };
  const DIRS = [
    [0, -1, "top"],
    [1,  0, "right"],
    [0,  1, "bottom"],
    [-1, 0, "left"],
  ] as [number, number, string][];

  const stack: [number, number][] = [];
  let [cx, cz] = [0, 0];
  grid[cz][cx].visited = true;
  stack.push([cx, cz]);

  while (stack.length > 0) {
    const nb = DIRS
      .map(([dx, dz, d]) => [cx + dx, cz + dz, d] as [number, number, string])
      .filter(([nx, nz]) => nx >= 0 && nx < w && nz >= 0 && nz < h && !grid[nz][nx].visited);
    if (nb.length > 0) {
      const [nx, nz, d] = nb[Math.floor(Math.random() * nb.length)];
      grid[cz][cx].walls[d as keyof MazeCell["walls"]] = false;
      grid[nz][nx].walls[opp[d] as keyof MazeCell["walls"]] = false;
      grid[nz][nx].visited = true;
      stack.push([cx, cz]);
      cx = nx; cz = nz;
    } else {
      [cx, cz] = stack.pop()!;
    }
  }
  return grid;
}

// ─── 충돌 박스 빌드 ──────────────────────────────────────────────────────────
interface WallBox { minX: number; maxX: number; minZ: number; maxZ: number; }

function buildWallBoxes(maze: MazeCell[][], mw: number, mh: number): WallBox[] {
  const boxes: WallBox[] = [];
  const t = T_WALL / 2;
  for (let z = 0; z < mh; z++) {
    for (let x = 0; x < mw; x++) {
      const cell = maze[z][x];
      const wx = x * CELL;
      const wz = z * CELL;
      if (cell.walls.top)    boxes.push({ minX: wx - t,        maxX: wx + CELL + t, minZ: wz - t,        maxZ: wz + t });
      if (cell.walls.left)   boxes.push({ minX: wx - t,        maxX: wx + t,        minZ: wz - t,        maxZ: wz + CELL + t });
      if (z === mh - 1 && cell.walls.bottom)
        boxes.push({ minX: wx - t, maxX: wx + CELL + t, minZ: wz + CELL - t, maxZ: wz + CELL + t });
      if (x === mw - 1 && cell.walls.right)
        boxes.push({ minX: wx + CELL - t, maxX: wx + CELL + t, minZ: wz - t, maxZ: wz + CELL + t });
    }
  }
  return boxes;
}

function hitsWall(boxes: WallBox[], px: number, pz: number): boolean {
  const r = P_RADIUS;
  for (const b of boxes)
    if (px + r > b.minX && px - r < b.maxX && pz + r > b.minZ && pz - r < b.maxZ) return true;
  return false;
}

// ─── 텍스처 생성 ─────────────────────────────────────────────────────────────
function makeCheckerTex(dark: number, light: number, size = 64): THREE.DataTexture {
  const s = size;
  const data = new Uint8Array(s * s * 4);
  const dc = [(dark >> 16) & 0xff, (dark >> 8) & 0xff, dark & 0xff];
  const lc = [(light >> 16) & 0xff, (light >> 8) & 0xff, light & 0xff];
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4;
    const col = (Math.floor(x / (s / 8)) + Math.floor(y / (s / 8))) % 2 === 0 ? dc : lc;
    data[i] = col[0]; data[i + 1] = col[1]; data[i + 2] = col[2]; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, s, s, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function makeWallTex(size = 128): THREE.DataTexture {
  const s = size;
  const data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4;
    const stripe = Math.floor(y / (s / 8)) % 2 === 0;
    const noise = ((Math.sin(x * 0.4 + y * 0.3) * 0.5 + 0.5) * 18) | 0;
    const base = stripe
      ? [180 + noise, 168 + noise, 100 + noise]
      : [165 + noise, 155 + noise,  88 + noise];
    data[i] = base[0]; data[i + 1] = base[1]; data[i + 2] = base[2]; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, s, s, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────
export default function MazeEngine({
  serverId,
  complexity = 5,
  equippedFlashlight,
  pointerSensitivity = 1,
  onPositionChange,
  onFlashlightChange,
}: MazeEngineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);

  // 가이드 패턴: ref에 가변 상태 저장 (렌더 루프에서 안전하게 읽기 위해)
  const yawRef        = useRef(0);
  const pitchRef      = useRef(0);
  const lockedRef     = useRef(false);
  const keysRef       = useRef<Record<string, boolean>>({});
  const flashOnRef    = useRef(true);
  const flashRef      = useRef<THREE.SpotLight | null>(null);
  const wallBoxRef    = useRef<WallBox[]>([]);
  const posRef        = useRef({ x: CELL / 2, z: CELL / 2 });
  const bobRef        = useRef(0);
  const posTickRef    = useRef(0);
  const sensRef       = useRef(BASE_SENS * pointerSensitivity);

  // pointerSensitivity prop 변경 시 ref 동기화 (effect re-run 없이)
  sensRef.current = BASE_SENS * pointerSensitivity;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const W = container.clientWidth || window.innerWidth;
    const H = container.clientHeight || window.innerHeight;

    // ── Three.js 초기화 ──────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.LinearToneMapping;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc8b87a);
    scene.fog = new THREE.FogExp2(0xc0aa62, 0.052);

    // 가이드: PerspectiveCamera — 회전은 quaternion으로만 (YXZ Euler)
    const camera = new THREE.PerspectiveCamera(75, W / H, 0.05, 80);
    camera.position.set(CELL / 2, P_HEIGHT, CELL / 2);

    // ── 미로 생성 ────────────────────────────────────────────────────────────
    const mw = 8 + complexity * 2;
    const mh = 8 + complexity * 2;
    const maze = generateMaze(mw, mh);
    wallBoxRef.current = buildWallBoxes(maze, mw, mh);
    const TW = mw * CELL;
    const TH = mh * CELL;

    // ── 텍스처 ──────────────────────────────────────────────────────────────
    const wallTex  = makeWallTex(128); wallTex.repeat.set(1.5, 0.8);
    const floorTex = makeCheckerTex(0x8b7355, 0x9e8462, 128); floorTex.repeat.set(TW / 2, TH / 2);
    const ceilTex  = makeCheckerTex(0xb0a070, 0xbfaa7a, 64);  ceilTex.repeat.set(TW / 1.5, TH / 1.5);

    const wallMat  = new THREE.MeshLambertMaterial({ map: wallTex });
    const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
    const ceilMat  = new THREE.MeshLambertMaterial({ map: ceilTex });

    // 바닥 / 천장
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(TW + 4, TH + 4), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(TW / 2, 0, TH / 2);
    scene.add(floor);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(TW + 4, TH + 4), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(TW / 2, H_WALL, TH / 2);
    scene.add(ceil);

    // 벽 — InstancedMesh
    const wallGeoH = new THREE.BoxGeometry(CELL + T_WALL, H_WALL, T_WALL);
    const wallGeoV = new THREE.BoxGeometry(T_WALL, H_WALL, CELL + T_WALL);
    const mH: THREE.Matrix4[] = [];
    const mV: THREE.Matrix4[] = [];
    const m4 = new THREE.Matrix4();
    for (let z = 0; z < mh; z++) for (let x = 0; x < mw; x++) {
      const cell = maze[z][x];
      const wx = x * CELL; const wz = z * CELL;
      if (cell.walls.top)    mH.push(m4.clone().makeTranslation(wx + CELL / 2, H_WALL / 2, wz));
      if (cell.walls.left)   mV.push(m4.clone().makeTranslation(wx, H_WALL / 2, wz + CELL / 2));
      if (z === mh - 1 && cell.walls.bottom) mH.push(m4.clone().makeTranslation(wx + CELL / 2, H_WALL / 2, wz + CELL));
      if (x === mw - 1 && cell.walls.right)  mV.push(m4.clone().makeTranslation(wx + CELL, H_WALL / 2, wz + CELL / 2));
    }
    if (mH.length > 0) { const im = new THREE.InstancedMesh(wallGeoH, wallMat, mH.length); mH.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; scene.add(im); }
    if (mV.length > 0) { const im = new THREE.InstancedMesh(wallGeoV, wallMat, mV.length); mV.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; scene.add(im); }

    // ── 조명 ────────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xd4c47a, 0.6));
    for (let z = 0; z < mh; z += 3) for (let x = 0; x < mw; x += 3) {
      const pl = new THREE.PointLight(0xf5e8a0, 1.6, CELL * 4, 1.8);
      pl.position.set(x * CELL + CELL / 2, H_WALL - 0.1, z * CELL + CELL / 2);
      scene.add(pl);
    }

    // 손전등 (SpotLight)
    const preset = FLASHLIGHT_PRESETS[equippedFlashlight ?? "default"] ?? FLASHLIGHT_PRESETS.default;
    const flashlight = new THREE.SpotLight(preset.color, preset.intensity, preset.distance, preset.angle, preset.penumbra, 1.2);
    scene.add(flashlight);
    scene.add(flashlight.target);
    flashRef.current = flashlight;

    // ── 엔티티 (배회하는 그림자) ─────────────────────────────────────────────
    const entityCount = Math.max(1, Math.floor(complexity * 0.5));
    const entities: { mesh: THREE.Mesh; ox: number; oz: number }[] = [];
    for (let i = 0; i < entityCount; i++) {
      const ex = (Math.floor(Math.random() * (mw - 4)) + 3) * CELL - CELL / 2;
      const ez = (Math.floor(Math.random() * (mh - 4)) + 3) * CELL - CELL / 2;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.28, 1.8, 8),
        new THREE.MeshBasicMaterial({ color: 0x1a0f00, transparent: true, opacity: 0 })
      );
      mesh.position.set(ex, 0.9, ez);
      scene.add(mesh);
      entities.push({ mesh, ox: ex, oz: ez });
    }

    // ════════════════════════════════════════════════════════════════════════
    // Pointer Lock — 가이드 패턴 그대로 구현
    // ════════════════════════════════════════════════════════════════════════

    // ① 클릭 → 잠금 요청 (반드시 사용자 이벤트 핸들러 안에서)
    const onClick = () => {
      container.requestPointerLock();
    };
    container.addEventListener("click", onClick);

    // ④ 잠금 상태 변화 감지
    const onLockChange = () => {
      const isLocked = document.pointerLockElement === container; // ③ 핵심 구문
      lockedRef.current = isLocked;
      setLocked(isLocked);
    };
    document.addEventListener("pointerlockchange", onLockChange);

    // ⑤ 잠금 실패
    const onLockError = () => {
      console.warn("[MazeEngine] pointerlockerror — iframe에 allow=\"pointer-lock\" 필요할 수 있음");
    };
    document.addEventListener("pointerlockerror", onLockError);

    // ⑥ 마우스 이동량 읽기 — 잠금 중일 때만 yaw/pitch 누적
    const onMouseMove = (e: MouseEvent) => {
      if (!lockedRef.current) return;
      yawRef.current   -= e.movementX * sensRef.current; // 오른쪽 = yaw 감소
      pitchRef.current -= e.movementY * sensRef.current; // 아래 = pitch 감소
      pitchRef.current  = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitchRef.current));
    };
    document.addEventListener("mousemove", onMouseMove);

    // ── 키보드 ──────────────────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysRef.current[k] = true;
      if (k === "f") {
        flashOnRef.current = !flashOnRef.current;
        onFlashlightChange?.(flashOnRef.current);
      }
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    // ── 리사이즈 ────────────────────────────────────────────────────────────
    const onResize = () => {
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh);
    };
    window.addEventListener("resize", onResize);

    // ════════════════════════════════════════════════════════════════════════
    // 애니메이션 루프 — THREE.Clock으로 delta time 기반 이동
    // ════════════════════════════════════════════════════════════════════════
    const clock = new THREE.Clock();
    let t = 0;
    let raf: number;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05); // 최대 50ms cap (탭 전환 등 대비)
      t += dt;

      const keys = keysRef.current;
      const pos  = posRef.current;

      // ① 카메라 회전 — YXZ Euler → quaternion (가이드 필수 패턴)
      camera.quaternion.setFromEuler(
        new THREE.Euler(pitchRef.current, yawRef.current, 0, "YXZ")
        //               ↑상하              ↑좌우              ↑순서 필수
      );

      // ② 이동 방향 벡터 (yaw 기반, y 성분 없음)
      const yaw     = yawRef.current;
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right   = new THREE.Vector3( Math.cos(yaw), 0, -Math.sin(yaw));
      const move    = new THREE.Vector3();
      if (keys["w"] || keys["arrowup"])    move.addScaledVector(forward,  1);
      if (keys["s"] || keys["arrowdown"])  move.addScaledVector(forward, -1);
      if (keys["a"] || keys["arrowleft"])  move.addScaledVector(right,   -1);
      if (keys["d"] || keys["arrowright"]) move.addScaledVector(right,    1);

      const moving = move.lengthSq() > 0;
      if (moving) {
        move.normalize().multiplyScalar(SPEED * dt);
        const wb = wallBoxRef.current;

        // ③ X, Z 독립 충돌 처리 (슬라이딩 허용) — 가이드 핵심 패턴
        const nx = pos.x + move.x;
        if (!hitsWall(wb, nx, pos.z)) pos.x = nx;

        const nz = pos.z + move.z;
        if (!hitsWall(wb, pos.x, nz)) pos.z = nz;
      }

      // 걷기 흔들림 (머리 bob)
      if (moving) bobRef.current += 8 * dt;
      const bobY = moving ? Math.sin(bobRef.current) * 0.028 : 0;

      camera.position.set(pos.x, P_HEIGHT + bobY, pos.z);

      // 손전등 업데이트
      const fl = flashRef.current;
      if (fl) {
        fl.intensity = flashOnRef.current ? preset.intensity : 0;
        fl.position.copy(camera.position);
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        fl.target.position.copy(camera.position).addScaledVector(dir, 10);
        fl.target.updateMatrixWorld();
      }

      // 엔티티 (그림자 존재) 업데이트
      entities.forEach(({ mesh, ox, oz }) => {
        const dx = pos.x - mesh.position.x;
        const dz = pos.z - mesh.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const mat = mesh.material as THREE.MeshBasicMaterial;
        if (dist < 18 && dist > 1.2) {
          mesh.position.x += (dx / dist) * 0.3 * dt;
          mesh.position.z += (dz / dist) * 0.3 * dt;
        }
        mesh.position.x += Math.sin(t * 0.3 + ox + oz) * 0.008 * dt / 0.016;
        mesh.position.z += Math.cos(t * 0.25 + ox + oz) * 0.008 * dt / 0.016;
        mat.opacity = dist < 14 ? Math.min(0.75, (14 - dist) / 14 * 0.8 + Math.sin(t * 4) * 0.1) : 0;
      });

      // 위치 전송 (60프레임마다 한 번)
      posTickRef.current++;
      if (posTickRef.current >= 60 && onPositionChange) {
        posTickRef.current = 0;
        onPositionChange({ x: pos.x, y: P_HEIGHT, z: pos.z, mapId: `server_${serverId ?? "solo"}` });
      }

      renderer.render(scene, camera);
    };
    animate();

    // ════════════════════════════════════════════════════════════════════════
    // 정리 (컴포넌트 언마운트 시) — 가이드 패턴
    // ════════════════════════════════════════════════════════════════════════
    return () => {
      cancelAnimationFrame(raf);
      if (document.pointerLockElement === container) document.exitPointerLock(); // ② 잠금 해제
      container.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("pointerlockerror", onLockError);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
      lockedRef.current = false;
    };
  }, [complexity, equippedFlashlight, serverId]); // onPositionChange/onFlashlightChange은 ref로 접근

  return (
    <div
      ref={containerRef}
      data-testid="maze-canvas"
      className="w-full h-full relative select-none"
      style={{ touchAction: "none", cursor: locked ? "none" : "crosshair" }}
    >
      {/* 조준선 — 잠금 중일 때만 표시 */}
      {locked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <line x1="11" y1="2"  x2="11" y2="8"  stroke="rgba(255,255,200,0.9)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="11" y1="14" x2="11" y2="20" stroke="rgba(255,255,200,0.9)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2"  y1="11" x2="8"  y2="11" stroke="rgba(255,255,200,0.9)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="14" y1="11" x2="20" y2="11" stroke="rgba(255,255,200,0.9)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {/* 잠금 안내 — 잠금 해제 상태일 때만 표시 */}
      {!locked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 gap-2">
          <div
            className="px-5 py-2.5 rounded-2xl text-sm font-medium tracking-wider"
            style={{
              background: "rgba(0,0,0,0.55)",
              color: "rgba(255,245,180,0.92)",
              border: "1px solid rgba(255,240,160,0.18)",
              backdropFilter: "blur(6px)",
            }}
          >
            화면을 클릭하면 마우스가 잠깁니다
          </div>
          <div className="text-xs" style={{ color: "rgba(255,245,180,0.45)" }}>
            WASD 이동 · F 손전등 · ESC 해제
          </div>
        </div>
      )}
    </div>
  );
}
