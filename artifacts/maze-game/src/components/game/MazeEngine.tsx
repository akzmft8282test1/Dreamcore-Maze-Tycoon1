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
  default: { color: 0xffffff, intensity: 4, distance: 18, angle: Math.PI / 7, penumbra: 0.5 },
  flashlight_basic: { color: 0xfff9c4, intensity: 3.5, distance: 14, angle: Math.PI / 8, penumbra: 0.6 },
  flashlight_wide: { color: 0xfff3e0, intensity: 4.5, distance: 22, angle: Math.PI / 4.5, penumbra: 0.3 },
  flashlight_uv: { color: 0xce93d8, intensity: 5, distance: 16, angle: Math.PI / 7, penumbra: 0.2 },
  flashlight_dreamcore: { color: 0xffe57f, intensity: 6, distance: 28, angle: Math.PI / 6, penumbra: 0.4 },
};

const LOOK_SPEED = 0.0024;

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
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
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
      if (nx >= 0 && nx < width && nz >= 0 && nz < height && !grid[nz][nx].visited) neighbors.push([nx, nz, dir]);
    }
    if (neighbors.length > 0) {
      const [nx, nz, dir] = neighbors[Math.floor(Math.random() * neighbors.length)];
      const opp: Record<string, string> = { top: "bottom", bottom: "top", left: "right", right: "left" };
      grid[cz][cx].walls[dir as keyof MazeCell["walls"]] = false;
      grid[nz][nx].walls[opp[dir] as keyof MazeCell["walls"]] = false;
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

const CELL_SIZE = 4;
const WALL_HEIGHT = 3.2;
const WALL_THICKNESS = 0.2;
const PLAYER_HEIGHT = 1.65;
const PLAYER_RADIUS = 0.28;
const MOVE_SPEED = 0.085;
const GRAVITY = -0.018;
const JUMP_POWER = 0.16;
const MOUSE_SENS = 0.0022;
const MAX_PITCH = Math.PI / 2 - 0.05;

function buildWallBoxes(maze: MazeCell[][], mazeW: number, mazeH: number): WallBox[] {
  const boxes: WallBox[] = [];
  const t = WALL_THICKNESS / 2;
  for (let z = 0; z < mazeH; z++) {
    for (let x = 0; x < mazeW; x++) {
      const cell = maze[z][x];
      const cx = x * CELL_SIZE;
      const cz = z * CELL_SIZE;
      if (cell.walls.top) boxes.push({ minX: cx - t, maxX: cx + CELL_SIZE + t, minZ: cz - t, maxZ: cz + t });
      if (cell.walls.left) boxes.push({ minX: cx - t, maxX: cx + t, minZ: cz - t, maxZ: cz + CELL_SIZE + t });
      if (z === mazeH - 1 && cell.walls.bottom) boxes.push({ minX: cx - t, maxX: cx + CELL_SIZE + t, minZ: cz + CELL_SIZE - t, maxZ: cz + CELL_SIZE + t });
      if (x === mazeW - 1 && cell.walls.right) boxes.push({ minX: cx + CELL_SIZE - t, maxX: cx + CELL_SIZE + t, minZ: cz - t, maxZ: cz + CELL_SIZE + t });
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

export default function MazeEngine({ serverId, complexity = 5, equippedFlashlight, onPositionChange, onFlashlightChange }: MazeEngineProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef = useRef<number>(0);
  const lockedRef = useRef(false);
  const [locked, setLocked] = useState(false);

  const playerRef = useRef({ x: CELL_SIZE / 2, y: PLAYER_HEIGHT, z: CELL_SIZE / 2, yaw: 0, pitch: 0, velY: 0, onGround: true });
  const lookStateRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const keysRef = useRef<Record<string, boolean>>({});
  const flickerRef = useRef<THREE.PointLight[]>([]);
  const entityRef = useRef<THREE.Mesh[]>([]);
  const flashlightRef = useRef<THREE.SpotLight | null>(null);
  const flashlightOnRef = useRef(true);
  const wallBoxesRef = useRef<WallBox[]>([]);
  const bobRef = useRef(0);
  const jumpPressedRef = useRef(false);
  const hasLookFocus = () => lockedRef.current || lookStateRef.current.dragging;

  const initScene = useCallback(() => {
    if (!mountRef.current) return;
    const W = mountRef.current.clientWidth;
    const H = mountRef.current.clientHeight;
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

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f1e7);
    scene.fog = new THREE.FogExp2(0xf8f1e7, 0.018);
    const camera = new THREE.PerspectiveCamera(80, W / H, 0.05, 120);
    camera.rotation.order = "YXZ";

    const mazeW = 8 + complexity * 2;
    const mazeH = 8 + complexity * 2;
    const maze = generateMaze(mazeW, mazeH);
    wallBoxesRef.current = buildWallBoxes(maze, mazeW, mazeH);
    const totalW = mazeW * CELL_SIZE;
    const totalH = mazeH * CELL_SIZE;

    const floorMat = new THREE.MeshStandardMaterial({ color: 0xe9dcc7, roughness: 0.9, metalness: 0.02 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 1.0, metalness: 0.0 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xd9c8ab, roughness: 0.85, metalness: 0.04 });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(totalW + 2, totalH + 2), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(totalW / 2, 0, totalH / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(totalW + 2, totalH + 2), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(totalW / 2, WALL_HEIGHT, totalH / 2);
    scene.add(ceiling);

    const wallGeoH = new THREE.BoxGeometry(CELL_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS);
    const wallGeoV = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, CELL_SIZE + WALL_THICKNESS);
    for (let z = 0; z < mazeH; z++) {
      for (let x = 0; x < mazeW; x++) {
        const cell = maze[z][x];
        const cx = x * CELL_SIZE;
        const cz = z * CELL_SIZE;
        if (cell.walls.top) { const w = new THREE.Mesh(wallGeoH, wallMat); w.position.set(cx + CELL_SIZE / 2, WALL_HEIGHT / 2, cz); w.castShadow = true; w.receiveShadow = true; scene.add(w); }
        if (cell.walls.left) { const w = new THREE.Mesh(wallGeoV, wallMat); w.position.set(cx, WALL_HEIGHT / 2, cz + CELL_SIZE / 2); w.castShadow = true; w.receiveShadow = true; scene.add(w); }
        if (z === mazeH - 1 && cell.walls.bottom) { const w = new THREE.Mesh(wallGeoH, wallMat); w.position.set(cx + CELL_SIZE / 2, WALL_HEIGHT / 2, cz + CELL_SIZE); w.castShadow = true; scene.add(w); }
        if (x === mazeW - 1 && cell.walls.right) { const w = new THREE.Mesh(wallGeoV, wallMat); w.position.set(cx + CELL_SIZE, WALL_HEIGHT / 2, cz + CELL_SIZE / 2); w.castShadow = true; scene.add(w); }
      }
    }

    const flickerLights: THREE.PointLight[] = [];
    const lightCount = Math.min(30, Math.floor(mazeW * mazeH * 0.12));
    for (let i = 0; i < lightCount; i++) {
      const lx = Math.floor(Math.random() * mazeW) * CELL_SIZE + CELL_SIZE / 2;
      const lz = Math.floor(Math.random() * mazeH) * CELL_SIZE + CELL_SIZE / 2;
      const light = new THREE.PointLight(0xaa88ff, 2.0, 15);
      light.position.set(lx, WALL_HEIGHT - 0.18, lz);
      scene.add(light);
      flickerLights.push(light);
    }
    flickerRef.current = flickerLights;
    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    scene.add(new THREE.HemisphereLight(0xfff4d9, 0xe7dcc8, 1.2));

    const entityCount = Math.floor(complexity * 0.6);
    for (let i = 0; i < entityCount; i++) {
      const ex = (Math.floor(Math.random() * (mazeW - 2)) + 2) * CELL_SIZE - CELL_SIZE / 2;
      const ez = (Math.floor(Math.random() * (mazeH - 2)) + 2) * CELL_SIZE - CELL_SIZE / 2;
      const entity = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), new THREE.MeshBasicMaterial({ color: 0x440066, transparent: true, opacity: 0.85 }));
      entity.position.set(ex, 1.5, ez);
      scene.add(entity);
      entityRef.current.push(entity);
    }

    const preset = FLASHLIGHT_PRESETS[equippedFlashlight ?? "default"] ?? FLASHLIGHT_PRESETS.default;
    const flashlight = new THREE.SpotLight(preset.color, preset.intensity, preset.distance, preset.angle, preset.penumbra, 1.5);
    scene.add(flashlight);
    scene.add(flashlight.target);
    flashlightRef.current = flashlight;
    const isUV = equippedFlashlight === "flashlight_uv";

    let t = 0;
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      t += 0.016;
      flickerLights.forEach((light, i) => {
        const flicker = 0.85 + Math.sin(t * (3 + i * 0.7)) * 0.1 + (Math.random() < 0.015 ? -0.5 : 0);
        light.intensity = Math.max(0.2, flicker * 2.0);
      });
      const keys = keysRef.current;
      const player = playerRef.current;
      const sinY = Math.sin(player.yaw);
      const cosY = Math.cos(player.yaw);
      let moveX = 0, moveZ = 0;
      if (keys["w"] || keys["arrowup"]) { moveX -= sinY; moveZ -= cosY; }
      if (keys["s"] || keys["arrowdown"]) { moveX += sinY; moveZ += cosY; }
      if (keys["a"] || keys["arrowleft"]) { moveX -= cosY; moveZ += sinY; }
      if (keys["d"] || keys["arrowright"]) { moveX += cosY; moveZ -= sinY; }
      const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
      if (moveLen > 0) { moveX = (moveX / moveLen) * MOVE_SPEED; moveZ = (moveZ / moveLen) * MOVE_SPEED; }
      const walls = wallBoxesRef.current;
      if (moveX !== 0 || moveZ !== 0) {
        const nx = player.x + moveX;
        const nz = player.z + moveZ;
        if (!collidesWithWalls(walls, nx, nz)) { player.x = nx; player.z = nz; }
        else if (!collidesWithWalls(walls, nx, player.z)) player.x = nx;
        else if (!collidesWithWalls(walls, player.x, nz)) player.z = nz;
      }
      player.velY += GRAVITY;
      player.y += player.velY;
      if (player.y <= PLAYER_HEIGHT) { player.y = PLAYER_HEIGHT; player.velY = 0; player.onGround = true; } else { player.onGround = false; }
      const wantJump = keys["shift"] || keys["shiftleft"] || keys["shiftright"];
      if (wantJump && player.onGround && !jumpPressedRef.current) { player.velY = JUMP_POWER; player.onGround = false; jumpPressedRef.current = true; }
      if (!wantJump) jumpPressedRef.current = false;
      const isMoving = moveLen > 0 && player.onGround;
      if (isMoving) bobRef.current += 0.1;
      const bobY = isMoving ? Math.sin(bobRef.current) * 0.035 : 0;
      const bobX = isMoving ? Math.sin(bobRef.current * 0.5) * 0.012 : 0;
      camera.position.set(player.x, player.y + bobY, player.z);
      camera.rotation.y = player.yaw;
      camera.rotation.x = player.pitch + bobX;
      camera.rotation.z = 0;
      const fl = flashlightRef.current;
      if (fl) {
        fl.intensity = flashlightOnRef.current ? preset.intensity : 0;
        fl.position.copy(camera.position);
        const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation).normalize();
        fl.target.position.copy(camera.position).addScaledVector(dir, 12);
        fl.target.updateMatrixWorld();
      }
      entityRef.current.forEach((entity) => {
        const dx = player.x - entity.position.x;
        const dz = player.z - entity.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 22 && dist > 1.5) {
          entity.position.x += (dx / dist) * 0.012;
          entity.position.z += (dz / dist) * 0.012;
        }
        const mat = entity.material as THREE.MeshBasicMaterial;
        if (isUV && dist < preset.distance) { mat.color.set(0xff00ff); mat.opacity = 0.9; }
        else { mat.color.set(0xa97d4f); mat.opacity = dist < 12 ? 0.55 + Math.sin(t * 3.5) * 0.25 : 0; }
      });
      if (Math.round(t * 60) % 60 === 0 && onPositionChange) onPositionChange({ x: player.x, y: player.y, z: player.z, mapId: `server_${serverId || "solo"}` });
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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.pointerLockElement === canvasRef.current) document.exitPointerLock();
        lookStateRef.current.dragging = false;
        return;
      }
      keysRef.current[e.key.toLowerCase()] = true;
      keysRef.current[e.key] = true;
      if (e.key.toLowerCase() === "f") {
        flashlightOnRef.current = !flashlightOnRef.current;
        onFlashlightChange?.(flashlightOnRef.current);
      }
      if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Shift", "ShiftLeft", "ShiftRight"].includes(e.key)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
      keysRef.current[e.key] = false;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!hasLookFocus()) return;
      const dx = lockedRef.current ? e.movementX : e.clientX - lookStateRef.current.lastX;
      const dy = lockedRef.current ? e.movementY : e.clientY - lookStateRef.current.lastY;
      lookStateRef.current.lastX = e.clientX;
      lookStateRef.current.lastY = e.clientY;
      playerRef.current.yaw -= dx * LOOK_SPEED;
      playerRef.current.pitch -= dy * LOOK_SPEED;
      playerRef.current.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, playerRef.current.pitch));
    };
    const onPointerLockChange = () => {
      const isLocked = document.pointerLockElement === canvasRef.current;
      lockedRef.current = isLocked;
      setLocked(isLocked);
      if (canvasRef.current) canvasRef.current.style.cursor = isLocked ? "none" : "default";
    };
    const onMouseDown = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      lookStateRef.current.dragging = true;
      lookStateRef.current.lastX = e.clientX;
      lookStateRef.current.lastY = e.clientY;
      canvas.requestPointerLock?.();
      canvas.style.cursor = "none";
    };
    const onMouseUp = () => {
      lookStateRef.current.dragging = false;
      if (canvasRef.current && document.pointerLockElement !== canvasRef.current) canvasRef.current.style.cursor = "default";
    };
    const onBlur = () => {
      lookStateRef.current.dragging = false;
      if (canvasRef.current) canvasRef.current.style.cursor = "default";
    };
    document.addEventListener("pointerlockchange", onPointerLockChange);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouseMove);
    mountRef.current?.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("mouseleave", onMouseUp);
    return () => {
      if (cleanup) cleanup();
      cancelAnimationFrame(animFrameRef.current);
      if (document.pointerLockElement === canvasRef.current) document.exitPointerLock();
      rendererRef.current?.dispose();
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMouseMove);
      mountRef.current?.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("mouseleave", onMouseUp);
      if (mountRef.current && rendererRef.current) mountRef.current.removeChild(rendererRef.current.domElement);
    };
  }, [initScene, onFlashlightChange]);

    return (
    <div ref={mountRef} data-testid="maze-canvas" className="w-full h-full relative select-none" style={{ touchAction: "none", cursor: locked ? "none" : "default" }}>
      {locked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10" style={{ mixBlendMode: "difference" }}>
          <div style={{ position: "relative", width: 20, height: 20 }}>
            <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 2, height: 14, background: "rgba(255,255,255,0.95)" }} />
            <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 14, height: 2, background: "rgba(255,255,255,0.95)" }} />
          </div>
        </div>
      )}
    </div>
  );
}
