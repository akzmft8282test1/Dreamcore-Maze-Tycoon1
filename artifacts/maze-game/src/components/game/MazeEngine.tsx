// Three.js 기반 마인크래프트 스타일 3D 미로 엔진
import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";

export interface FlashlightConfig {
  color: number;
  intensity: number;
  distance: number;
  angle: number;
  penumbra: number;
}

export const FLASHLIGHT_PRESETS: Record<string, FlashlightConfig> = {
  default:              { color: 0xffffff, intensity: 4,   distance: 18, angle: Math.PI / 7,  penumbra: 0.5 },
  flashlight_basic:     { color: 0xfff9c4, intensity: 3.5, distance: 14, angle: Math.PI / 8,  penumbra: 0.6 },
  flashlight_wide:      { color: 0xfff3e0, intensity: 4.5, distance: 22, angle: Math.PI / 4.5, penumbra: 0.3 },
  flashlight_uv:        { color: 0xce93d8, intensity: 5,   distance: 16, angle: Math.PI / 7,  penumbra: 0.2 },
  flashlight_dreamcore: { color: 0xffe57f, intensity: 6,   distance: 28, angle: Math.PI / 6,  penumbra: 0.4 },
};

interface MazeEngineProps {
  serverId?: number | null;
  complexity?: number;
  equippedFlashlight?: string | null;
  onPositionChange?: (pos: { x: number; y: number; z: number; mapId: string }) => void;
  onFlashlightChange?: (on: boolean) => void;
}

interface MazeCell {
  x: number;
  z: number;
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  visited: boolean;
}

interface WallBox {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

function generateMaze(width: number, height: number): MazeCell[][] {
  const grid: MazeCell[][] = [];
  for (let z = 0; z < height; z++) {
    grid[z] = [];
    for (let x = 0; x < width; x++) {
      grid[z][x] = { x, z, walls: { top: true, right: true, bottom: true, left: true }, visited: false };
    }
  }
  const stack: [number, number][] = [];
  let cx = 0, cz = 0;
  grid[cz][cx].visited = true;
  stack.push([cx, cz]);
  while (stack.length > 0) {
    const neighbors: [number, number, string][] = [];
    const dirs = [[0, -1, "top"], [1, 0, "right"], [0, 1, "bottom"], [-1, 0, "left"]] as [number, number, string][];
    for (const [dx, dz, dir] of dirs) {
      const nx = cx + dx, nz = cz + dz;
      if (nx >= 0 && nx < width && nz >= 0 && nz < height && !grid[nz][nx].visited) {
        neighbors.push([nx, nz, dir]);
      }
    }
    if (neighbors.length > 0) {
      const [nx, nz, dir] = neighbors[Math.floor(Math.random() * neighbors.length)];
      const opp: Record<string, string> = { top: "bottom", bottom: "top", left: "right", right: "left" };
      grid[cz][cx].walls[dir as keyof typeof grid[0][0]["walls"]] = false;
      grid[nz][nx].walls[opp[dir] as keyof typeof grid[0][0]["walls"]] = false;
      grid[nz][nx].visited = true;
      stack.push([cx, cz]);
      cx = nx; cz = nz;
    } else {
      const [px, pz] = stack.pop()!;
      cx = px; cz = pz;
    }
  }
  return grid;
}

const CELL_SIZE      = 4;
const WALL_HEIGHT    = 3.2;
const WALL_THICKNESS = 0.2;
const PLAYER_HEIGHT  = 1.65;
const PLAYER_RADIUS  = 0.28;
const MOVE_SPEED     = 0.085;
const GRAVITY        = -0.018;
const JUMP_POWER     = 0.16;
const MOUSE_SENS     = 0.0022;
const MAX_PITCH      = Math.PI / 2 - 0.05;

function buildWallBoxes(maze: MazeCell[][], mazeW: number, mazeH: number): WallBox[] {
  const boxes: WallBox[] = [];
  const T = WALL_THICKNESS / 2;

  for (let z = 0; z < mazeH; z++) {
    for (let x = 0; x < mazeW; x++) {
      const cell = maze[z][x];
      const cx = x * CELL_SIZE;
      const cz = z * CELL_SIZE;

      if (cell.walls.top) {
        boxes.push({ minX: cx - T, maxX: cx + CELL_SIZE + T, minZ: cz - T, maxZ: cz + T });
      }
      if (cell.walls.left) {
        boxes.push({ minX: cx - T, maxX: cx + T, minZ: cz - T, maxZ: cz + CELL_SIZE + T });
      }
      if (z === mazeH - 1 && cell.walls.bottom) {
        boxes.push({ minX: cx - T, maxX: cx + CELL_SIZE + T, minZ: cz + CELL_SIZE - T, maxZ: cz + CELL_SIZE + T });
      }
      if (x === mazeW - 1 && cell.walls.right) {
        boxes.push({ minX: cx + CELL_SIZE - T, maxX: cx + CELL_SIZE + T, minZ: cz - T, maxZ: cz + CELL_SIZE + T });
      }
    }
  }
  return boxes;
}

function collidesWithWalls(boxes: WallBox[], px: number, pz: number): boolean {
  const r = PLAYER_RADIUS;
  for (const b of boxes) {
    if (px + r > b.minX && px - r < b.maxX && pz + r > b.minZ && pz - r < b.maxZ) return true;
  }
  return false;
}

export default function MazeEngine({
  serverId,
  complexity = 5,
  equippedFlashlight,
  onPositionChange,
  onFlashlightChange,
}: MazeEngineProps) {
  const mountRef      = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement | null>(null);
  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef  = useRef<number>(0);
  const [locked, setLocked] = useState(false);
  const lockedRef     = useRef(false);

  // 플레이어 상태
  const playerRef = useRef({
    x: CELL_SIZE / 2,
    y: PLAYER_HEIGHT,
    z: CELL_SIZE / 2,
    yaw: 0,
    pitch: 0,
    velY: 0,
    onGround: true,
  });

  const keysRef         = useRef<Record<string, boolean>>({});
  const flickerRef      = useRef<THREE.PointLight[]>([]);
  const entityRef       = useRef<THREE.Mesh[]>([]);
  const flashlightRef   = useRef<THREE.SpotLight | null>(null);
  const flashlightOnRef = useRef<boolean>(true);
  const wallBoxesRef    = useRef<WallBox[]>([]);
  const bobRef          = useRef(0);
  const jumpPressedRef  = useRef(false);

  const initScene = useCallback(() => {
    if (!mountRef.current) return;

    const W = mountRef.current.clientWidth;
    const H = mountRef.current.clientHeight;

    // 렌더러
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    canvasRef.current = renderer.domElement;

    // 씬
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04000f);
    scene.fog = new THREE.FogExp2(0x04000f, 0.042);

    // 카메라
    const camera = new THREE.PerspectiveCamera(80, W / H, 0.05, 120);
    camera.rotation.order = "YXZ";

    // 미로 생성
    const mazeW = 8 + complexity * 2;
    const mazeH = 8 + complexity * 2;
    const maze = generateMaze(mazeW, mazeH);
    wallBoxesRef.current = buildWallBoxes(maze, mazeW, mazeH);

    const totalW = mazeW * CELL_SIZE;
    const totalH = mazeH * CELL_SIZE;

    // 재질
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b0921, roughness: 0.95, metalness: 0.05,
    });
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0x07051a, roughness: 1.0, metalness: 0.0,
    });
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x100d30, roughness: 0.85, metalness: 0.08,
    });

    // 바닥 & 천장
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(totalW + 2, totalH + 2), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(totalW / 2, 0, totalH / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(totalW + 2, totalH + 2), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(totalW / 2, WALL_HEIGHT, totalH / 2);
    scene.add(ceiling);

    // 벽 생성
    const wallGeoH = new THREE.BoxGeometry(CELL_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS);
    const wallGeoV = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, CELL_SIZE + WALL_THICKNESS);

    for (let z = 0; z < mazeH; z++) {
      for (let x = 0; x < mazeW; x++) {
        const cell = maze[z][x];
        const cx = x * CELL_SIZE;
        const cz = z * CELL_SIZE;
        if (cell.walls.top) {
          const w = new THREE.Mesh(wallGeoH, wallMat);
          w.position.set(cx + CELL_SIZE / 2, WALL_HEIGHT / 2, cz);
          w.castShadow = true; w.receiveShadow = true;
          scene.add(w);
        }
        if (cell.walls.left) {
          const w = new THREE.Mesh(wallGeoV, wallMat);
          w.position.set(cx, WALL_HEIGHT / 2, cz + CELL_SIZE / 2);
          w.castShadow = true; w.receiveShadow = true;
          scene.add(w);
        }
        if (z === mazeH - 1 && cell.walls.bottom) {
          const w = new THREE.Mesh(wallGeoH, wallMat);
          w.position.set(cx + CELL_SIZE / 2, WALL_HEIGHT / 2, cz + CELL_SIZE);
          w.castShadow = true; scene.add(w);
        }
        if (x === mazeW - 1 && cell.walls.right) {
          const w = new THREE.Mesh(wallGeoV, wallMat);
          w.position.set(cx + CELL_SIZE, WALL_HEIGHT / 2, cz + CELL_SIZE / 2);
          w.castShadow = true; scene.add(w);
        }
      }
    }

    // 형광등
    const flickerLights: THREE.PointLight[] = [];
    const lightCount = Math.min(30, Math.floor(mazeW * mazeH * 0.12));
    for (let i = 0; i < lightCount; i++) {
      const lx = Math.floor(Math.random() * mazeW) * CELL_SIZE + CELL_SIZE / 2;
      const lz = Math.floor(Math.random() * mazeH) * CELL_SIZE + CELL_SIZE / 2;
      const light = new THREE.PointLight(0xaa88ff, 2.0, 15);
      light.position.set(lx, WALL_HEIGHT - 0.18, lz);
      scene.add(light);
      flickerLights.push(light);
      const tube = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.05, 0.12),
        new THREE.MeshBasicMaterial({ color: 0xccaaff })
      );
      tube.position.set(lx, WALL_HEIGHT - 0.04, lz);
      scene.add(tube);
    }
    flickerRef.current = flickerLights;

    // 주변광
    scene.add(new THREE.AmbientLight(0x1a1040, 1.4));
    scene.add(new THREE.HemisphereLight(0x2a1060, 0x080418, 0.7));

    // 엔티티
    const entityCount = Math.floor(complexity * 0.6);
    for (let i = 0; i < entityCount; i++) {
      const ex = (Math.floor(Math.random() * (mazeW - 2)) + 2) * CELL_SIZE - CELL_SIZE / 2;
      const ez = (Math.floor(Math.random() * (mazeH - 2)) + 2) * CELL_SIZE - CELL_SIZE / 2;
      const geo = new THREE.SphereGeometry(0.32, 10, 10);
      const mat = new THREE.MeshBasicMaterial({ color: 0x440066, transparent: true, opacity: 0.85 });
      const entity = new THREE.Mesh(geo, mat);
      entity.position.set(ex, 1.5, ez);
      scene.add(entity);
      entityRef.current.push(entity);
    }

    // 손전등
    const preset = FLASHLIGHT_PRESETS[equippedFlashlight ?? "default"] ?? FLASHLIGHT_PRESETS["default"];
    const flashlight = new THREE.SpotLight(
      preset.color, preset.intensity, preset.distance, preset.angle, preset.penumbra, 1.5
    );
    flashlight.castShadow = false;
    scene.add(flashlight);
    scene.add(flashlight.target);
    flashlightRef.current = flashlight;

    const isUV = equippedFlashlight === "flashlight_uv";

    // 애니메이션 루프
    let t = 0;
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      t += 0.016;

      // 형광등 깜박임
      flickerLights.forEach((light, i) => {
        const flicker = 0.85 + Math.sin(t * (3 + i * 0.7)) * 0.1 + (Math.random() < 0.015 ? -0.5 : 0);
        light.intensity = Math.max(0.2, flicker * 2.0);
      });

      const keys = keysRef.current;
      const player = playerRef.current;

      // 이동 방향 계산 (yaw 기준, XZ 평면)
      const cosY = Math.cos(player.yaw);
      const sinY = Math.sin(player.yaw);

      let moveX = 0, moveZ = 0;
      if (keys["w"] || keys["arrowup"])    { moveX += cosY; moveZ += sinY; }
      if (keys["s"] || keys["arrowdown"])  { moveX -= cosY; moveZ -= sinY; }
      if (keys["a"] || keys["arrowleft"])  { moveX += sinY; moveZ -= cosY; }
      if (keys["d"] || keys["arrowright"]) { moveX -= sinY; moveZ += cosY; }

      // 이동 벡터 정규화
      const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
      if (moveLen > 0) {
        moveX = (moveX / moveLen) * MOVE_SPEED;
        moveZ = (moveZ / moveLen) * MOVE_SPEED;
      }

      // 슬라이딩 충돌 처리
      const walls = wallBoxesRef.current;
      if (moveX !== 0 || moveZ !== 0) {
        const nx = player.x + moveX;
        const nz = player.z + moveZ;
        if (!collidesWithWalls(walls, nx, nz)) {
          player.x = nx; player.z = nz;
        } else if (!collidesWithWalls(walls, nx, player.z)) {
          player.x = nx;
        } else if (!collidesWithWalls(walls, player.x, nz)) {
          player.z = nz;
        }
      }

      // 중력 & 점프
      player.velY += GRAVITY;
      player.y += player.velY;
      if (player.y <= PLAYER_HEIGHT) {
        player.y = PLAYER_HEIGHT;
        player.velY = 0;
        player.onGround = true;
      } else {
        player.onGround = false;
      }

      // 점프 (스페이스)
      const wantJump = keys[" "] || keys["space"];
      if (wantJump && player.onGround && !jumpPressedRef.current) {
        player.velY = JUMP_POWER;
        player.onGround = false;
        jumpPressedRef.current = true;
      }
      if (!wantJump) jumpPressedRef.current = false;

      // 헤드 밥
      const isMoving = moveLen > 0 && player.onGround;
      if (isMoving) bobRef.current += 0.1;
      const bobY = isMoving ? Math.sin(bobRef.current) * 0.035 : 0;
      const bobX = isMoving ? Math.sin(bobRef.current * 0.5) * 0.012 : 0;

      // 카메라 적용
      camera.position.set(player.x, player.y + bobY, player.z);
      camera.rotation.y   = player.yaw;
      camera.rotation.x   = player.pitch + bobX;
      camera.rotation.z   = 0;

      // 손전등
      const fl = flashlightRef.current;
      if (fl) {
        fl.intensity = flashlightOnRef.current ? preset.intensity : 0;
        fl.position.copy(camera.position);
        const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation).normalize();
        fl.target.position.copy(camera.position).addScaledVector(dir, 12);
        fl.target.updateMatrixWorld();
      }

      // 엔티티 AI
      entityRef.current.forEach((entity) => {
        const dx = player.x - entity.position.x;
        const dz = player.z - entity.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 22 && dist > 1.5) {
          entity.position.x += (dx / dist) * 0.012;
          entity.position.z += (dz / dist) * 0.012;
        }
        const mat = entity.material as THREE.MeshBasicMaterial;
        if (isUV && dist < preset.distance) {
          mat.color.set(0xff00ff);
          mat.opacity = 0.9;
        } else {
          mat.color.set(0x440066);
          mat.opacity = dist < 12 ? 0.55 + Math.sin(t * 3.5) * 0.25 : 0;
        }
      });

      // 위치 콜백 (1초마다)
      if (Math.round(t * 60) % 60 === 0 && onPositionChange) {
        onPositionChange({ x: player.x, y: player.y, z: player.z, mapId: `server_${serverId || "solo"}` });
      }

      renderer.render(scene, camera);
    }

    animate();

    const onResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [complexity, serverId, equippedFlashlight, onPositionChange]);

  useEffect(() => {
    const cleanup = initScene();

    // ─── 키 입력 ───
    const onKeyDown = (e: KeyboardEvent) => {
      // ESC는 포인터 락 해제 (브라우저가 자동 처리)
      if (e.key === "Escape") return;
      keysRef.current[e.key.toLowerCase()] = true;
      keysRef.current[e.key] = true;
      if (e.key.toLowerCase() === "f") {
        flashlightOnRef.current = !flashlightOnRef.current;
        onFlashlightChange?.(flashlightOnRef.current);
      }
      // WASD/Space는 스크롤 방지
      if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
      keysRef.current[e.key] = false;
    };

    // ─── Pointer Lock 마우스 이동 ───
    const onMouseMove = (e: MouseEvent) => {
      if (!lockedRef.current) return;
      playerRef.current.yaw   -= e.movementX * MOUSE_SENS;
      playerRef.current.pitch -= e.movementY * MOUSE_SENS;
      playerRef.current.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, playerRef.current.pitch));
    };

    // ─── Pointer Lock 상태 감지 ───
    const onPointerLockChange = () => {
      const isLocked = document.pointerLockElement === canvasRef.current;
      lockedRef.current = isLocked;
      setLocked(isLocked);
    };

    // ─── 클릭 시 포인터 락 ───
    const onClick = () => {
      if (!lockedRef.current && canvasRef.current) {
        canvasRef.current.requestPointerLock();
      }
    };

    document.addEventListener("pointerlockchange", onPointerLockChange);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouseMove);
    mountRef.current?.addEventListener("click", onClick);

    return () => {
      if (cleanup) cleanup();
      cancelAnimationFrame(animFrameRef.current);
      if (document.pointerLockElement === canvasRef.current) {
        document.exitPointerLock();
      }
      rendererRef.current?.dispose();
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMouseMove);
      if (mountRef.current && rendererRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, [initScene, onFlashlightChange]);

  return (
    <div
      ref={mountRef}
      data-testid="maze-canvas"
      className="w-full h-full relative"
      style={{ touchAction: "none" }}
    >
      {/* 조준점 (항상 표시) */}
      {locked && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          style={{ mixBlendMode: "difference" }}
        >
          <div style={{ position: "relative", width: 20, height: 20 }}>
            <div style={{
              position: "absolute", left: "50%", top: "50%",
              transform: "translate(-50%, -50%)",
              width: 2, height: 14, background: "rgba(255,255,255,0.85)",
            }} />
            <div style={{
              position: "absolute", left: "50%", top: "50%",
              transform: "translate(-50%, -50%)",
              width: 14, height: 2, background: "rgba(255,255,255,0.85)",
            }} />
          </div>
        </div>
      )}

      {/* 클릭 유도 오버레이 */}
      {!locked && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none"
          style={{ background: "rgba(4,0,15,0.72)", backdropFilter: "blur(3px)" }}
        >
          <div className="text-center px-8 py-6 rounded-2xl border border-purple-500/25"
            style={{ background: "rgba(16,8,48,0.8)" }}>
            <p className="text-2xl font-bold mb-1 text-white/90">클릭하여 게임 시작</p>
            <p className="text-sm text-purple-300/70 mb-4">마우스로 시점을 조정합니다</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs text-white/50 text-left">
              <span><span className="text-white/80 font-mono bg-white/10 px-1.5 py-0.5 rounded mr-1">WASD</span> 이동</span>
              <span><span className="text-white/80 font-mono bg-white/10 px-1.5 py-0.5 rounded mr-1">마우스</span> 시점</span>
              <span><span className="text-white/80 font-mono bg-white/10 px-1.5 py-0.5 rounded mr-1">Space</span> 점프</span>
              <span><span className="text-white/80 font-mono bg-white/10 px-1.5 py-0.5 rounded mr-1">F</span> 손전등</span>
              <span><span className="text-white/80 font-mono bg-white/10 px-1.5 py-0.5 rounded mr-1">ESC</span> 해제</span>
              <span><span className="text-white/80 font-mono bg-white/10 px-1.5 py-0.5 rounded mr-1">V</span> 2D 맵</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
