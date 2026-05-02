// Three.js 기반 3D 미로 엔진
import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

export interface FlashlightConfig {
  color: number;
  intensity: number;
  distance: number;
  angle: number;
  penumbra: number;
}

// 손전등 종류별 속성 정의
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

const CELL_SIZE = 4;
const WALL_HEIGHT = 3;
const WALL_THICKNESS = 0.15;

export default function MazeEngine({
  serverId,
  complexity = 5,
  equippedFlashlight,
  onPositionChange,
  onFlashlightChange,
}: MazeEngineProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef = useRef<number>(0);
  const keysRef = useRef<Record<string, boolean>>({});
  const playerRef = useRef({ x: CELL_SIZE / 2, y: 1.6, z: CELL_SIZE / 2, yaw: 0 });
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const flickerRef = useRef<THREE.PointLight[]>([]);
  const entityRef = useRef<THREE.Mesh[]>([]);
  const flashlightRef = useRef<THREE.SpotLight | null>(null);
  const flashlightOnRef = useRef<boolean>(true);

  const initScene = useCallback(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.0; // 밝기 상향 (0.5 → 1.0)
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060012);
    scene.fog = new THREE.FogExp2(0x060012, 0.045); // 안개 완화 (0.08 → 0.045)

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 100);
    camera.position.set(CELL_SIZE / 2, 1.6, CELL_SIZE / 2);

    const mazeW = 8 + complexity * 2;
    const mazeH = 8 + complexity * 2;
    const maze = generateMaze(mazeW, mazeH);

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0d0b20, roughness: 0.9, metalness: 0.1 });
    const ceilMat  = new THREE.MeshStandardMaterial({ color: 0x080615, roughness: 1.0, metalness: 0.0 });
    const wallMat  = new THREE.MeshStandardMaterial({ color: 0x13103a, roughness: 0.85, metalness: 0.05 });

    const totalW = mazeW * CELL_SIZE;
    const totalH = mazeH * CELL_SIZE;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(totalW, totalH), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(totalW / 2, 0, totalH / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(totalW, totalH), ceilMat);
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

    // 형광등 — 더 밝게
    const flickerLights: THREE.PointLight[] = [];
    const lightCount = Math.min(25, Math.floor(mazeW * mazeH * 0.1));
    for (let i = 0; i < lightCount; i++) {
      const lx = Math.floor(Math.random() * mazeW) * CELL_SIZE + CELL_SIZE / 2;
      const lz = Math.floor(Math.random() * mazeH) * CELL_SIZE + CELL_SIZE / 2;
      const light = new THREE.PointLight(0xaa88ff, 2.2, 14); // 밝기 상향 (1.2 → 2.2)
      light.position.set(lx, WALL_HEIGHT - 0.2, lz);
      scene.add(light);
      flickerLights.push(light);
      const tube = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.05, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xccaaff })
      );
      tube.position.set(lx, WALL_HEIGHT - 0.05, lz);
      scene.add(tube);
    }
    flickerRef.current = flickerLights;

    // 기본 주변광 — 대폭 강화 (손전등 없이도 보임)
    scene.add(new THREE.AmbientLight(0x1a1040, 1.5)); // 밝기 상향 (0.3 → 1.5)

    // 반구광 추가 (자연스러운 fill light)
    const hemi = new THREE.HemisphereLight(0x2a1060, 0x080418, 0.8);
    scene.add(hemi);

    // 엔티티
    const entityCount = Math.floor(complexity * 0.5);
    for (let i = 0; i < entityCount; i++) {
      const ex = (Math.floor(Math.random() * mazeW) + 1) * CELL_SIZE;
      const ez = (Math.floor(Math.random() * mazeH) + 1) * CELL_SIZE;
      const geo = new THREE.SphereGeometry(0.3, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0x440066, transparent: true, opacity: 0.8 });
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

    let t = 0;
    const SPEED = 0.06;

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      t += 0.016;

      flickerLights.forEach((light, i) => {
        const flicker = 0.85 + Math.sin(t * (3 + i * 0.7)) * 0.1 + (Math.random() < 0.02 ? -0.4 : 0);
        light.intensity = Math.max(0.3, flicker * 2.2);
      });

      const keys = keysRef.current;
      const player = playerRef.current;
      const cos = Math.cos(player.yaw);
      const sin = Math.sin(player.yaw);

      if (keys["w"] || keys["arrowup"])    { player.x += cos * SPEED; player.z += sin * SPEED; }
      if (keys["s"] || keys["arrowdown"])  { player.x -= cos * SPEED; player.z -= sin * SPEED; }
      if (keys["a"] || keys["arrowleft"])  { player.x += sin * SPEED; player.z -= cos * SPEED; }
      if (keys["d"] || keys["arrowright"]) { player.x -= sin * SPEED; player.z += cos * SPEED; }

      camera.position.set(player.x, player.y, player.z);
      camera.rotation.order = "YXZ";
      camera.rotation.y = -player.yaw;
      camera.rotation.x = 0;

      const fl = flashlightRef.current;
      if (fl) {
        fl.intensity = flashlightOnRef.current ? preset.intensity : 0;
        fl.position.copy(camera.position);
        const dir = new THREE.Vector3(-sin, -0.1, -cos).normalize();
        fl.target.position.copy(camera.position).addScaledVector(dir, 10);
        fl.target.updateMatrixWorld();
      }

      entityRef.current.forEach((entity) => {
        const dx = player.x - entity.position.x;
        const dz = player.z - entity.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 20 && dist > 2) {
          entity.position.x += (dx / dist) * 0.01;
          entity.position.z += (dz / dist) * 0.01;
        }
        const mat = entity.material as THREE.MeshBasicMaterial;
        if (isUV && dist < preset.distance) {
          mat.color.set(0xff00ff);
          mat.opacity = 0.9;
        } else {
          mat.color.set(0x440066);
          mat.opacity = dist < 10 ? 0.6 + Math.sin(t * 3) * 0.2 : 0;
        }
      });

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

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysRef.current[key] = true;
      if (key === "f") {
        flashlightOnRef.current = !flashlightOnRef.current;
        onFlashlightChange?.(flashlightOnRef.current);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { keysRef.current[e.key.toLowerCase()] = false; };
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      playerRef.current.yaw += (e.clientX - lastMouseRef.current.x) * 0.003;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { isDraggingRef.current = false; };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    mountRef.current?.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      if (cleanup) cleanup();
      cancelAnimationFrame(animFrameRef.current);
      rendererRef.current?.dispose();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (mountRef.current && rendererRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, [initScene, onFlashlightChange]);

  return (
    <div
      ref={mountRef}
      data-testid="maze-canvas"
      className="w-full h-full cursor-crosshair"
      style={{ touchAction: "none" }}
    />
  );
}
