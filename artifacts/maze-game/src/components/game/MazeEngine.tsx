// Three.js 기반 3D 미로 엔진
import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

interface MazeEngineProps {
  serverId?: number | null;
  complexity?: number;
  onPositionChange?: (pos: { x: number; y: number; z: number; mapId: string }) => void;
}

interface MazeCell {
  x: number;
  z: number;
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  visited: boolean;
}

// Recursive Backtracking 미로 생성
function generateMaze(width: number, height: number): MazeCell[][] {
  const grid: MazeCell[][] = [];

  for (let z = 0; z < height; z++) {
    grid[z] = [];
    for (let x = 0; x < width; x++) {
      grid[z][x] = {
        x, z,
        walls: { top: true, right: true, bottom: true, left: true },
        visited: false,
      };
    }
  }

  const stack: [number, number][] = [];
  let cx = 0, cz = 0;
  grid[cz][cx].visited = true;
  stack.push([cx, cz]);

  while (stack.length > 0) {
    const neighbors: [number, number, string][] = [];
    const dirs = [
      [0, -1, "top"], [1, 0, "right"], [0, 1, "bottom"], [-1, 0, "left"]
    ] as [number, number, string][];

    for (const [dx, dz, dir] of dirs) {
      const nx = cx + dx, nz = cz + dz;
      if (nx >= 0 && nx < width && nz >= 0 && nz < height && !grid[nz][nx].visited) {
        neighbors.push([nx, nz, dir]);
      }
    }

    if (neighbors.length > 0) {
      const [nx, nz, dir] = neighbors[Math.floor(Math.random() * neighbors.length)];
      const opposite: Record<string, string> = { top: "bottom", bottom: "top", left: "right", right: "left" };

      grid[cz][cx].walls[dir as keyof typeof grid[0][0]["walls"]] = false;
      grid[nz][nx].walls[opposite[dir] as keyof typeof grid[0][0]["walls"]] = false;
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

export default function MazeEngine({ serverId, complexity = 5, onPositionChange }: MazeEngineProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animFrameRef = useRef<number>(0);
  const keysRef = useRef<Record<string, boolean>>({});
  const playerRef = useRef({ x: CELL_SIZE / 2, y: 1.6, z: CELL_SIZE / 2, yaw: 0 });
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const flickerRef = useRef<THREE.PointLight[]>([]);
  const entityRef = useRef<THREE.Mesh[]>([]);

  const initScene = useCallback(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // 렌더러 생성
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 0.5;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 씬
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020008);
    scene.fog = new THREE.FogExp2(0x020008, 0.08);
    sceneRef.current = scene;

    // 카메라
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 100);
    camera.position.set(CELL_SIZE / 2, 1.6, CELL_SIZE / 2);
    cameraRef.current = camera;

    // 미로 크기 계산 (복잡도 기반)
    const mazeW = 8 + complexity * 2;
    const mazeH = 8 + complexity * 2;
    const maze = generateMaze(mazeW, mazeH);

    // 재료들
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a0818,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0x060410,
      roughness: 1.0,
      metalness: 0.0,
    });
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0f0b1e,
      roughness: 0.85,
      metalness: 0.05,
    });

    // 바닥 & 천장
    const totalW = mazeW * CELL_SIZE;
    const totalH = mazeH * CELL_SIZE;
    const floorGeo = new THREE.PlaneGeometry(totalW, totalH);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(totalW / 2, 0, totalH / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(totalW, totalH), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(totalW / 2, WALL_HEIGHT, totalH / 2);
    scene.add(ceiling);

    // 벽 생성
    const wallGeo = {
      horizontal: new THREE.BoxGeometry(CELL_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS),
      vertical: new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, CELL_SIZE + WALL_THICKNESS),
    };

    for (let z = 0; z < mazeH; z++) {
      for (let x = 0; x < mazeW; x++) {
        const cell = maze[z][x];
        const cx = x * CELL_SIZE;
        const cz = z * CELL_SIZE;

        if (cell.walls.top) {
          const wall = new THREE.Mesh(wallGeo.horizontal, wallMat);
          wall.position.set(cx + CELL_SIZE / 2, WALL_HEIGHT / 2, cz);
          wall.castShadow = true;
          wall.receiveShadow = true;
          scene.add(wall);
        }
        if (cell.walls.left) {
          const wall = new THREE.Mesh(wallGeo.vertical, wallMat);
          wall.position.set(cx, WALL_HEIGHT / 2, cz + CELL_SIZE / 2);
          wall.castShadow = true;
          wall.receiveShadow = true;
          scene.add(wall);
        }
        // 마지막 행/열 닫기
        if (z === mazeH - 1 && cell.walls.bottom) {
          const wall = new THREE.Mesh(wallGeo.horizontal, wallMat);
          wall.position.set(cx + CELL_SIZE / 2, WALL_HEIGHT / 2, cz + CELL_SIZE);
          wall.castShadow = true;
          scene.add(wall);
        }
        if (x === mazeW - 1 && cell.walls.right) {
          const wall = new THREE.Mesh(wallGeo.vertical, wallMat);
          wall.position.set(cx + CELL_SIZE, WALL_HEIGHT / 2, cz + CELL_SIZE / 2);
          wall.castShadow = true;
          scene.add(wall);
        }
      }
    }

    // 형광등 배치
    const flickerLights: THREE.PointLight[] = [];
    const lightCount = Math.min(20, Math.floor(mazeW * mazeH * 0.08));
    for (let i = 0; i < lightCount; i++) {
      const lx = Math.floor(Math.random() * mazeW) * CELL_SIZE + CELL_SIZE / 2;
      const lz = Math.floor(Math.random() * mazeH) * CELL_SIZE + CELL_SIZE / 2;

      const light = new THREE.PointLight(0x9966ff, 1.2, 12);
      light.position.set(lx, WALL_HEIGHT - 0.2, lz);
      light.castShadow = false;
      scene.add(light);
      flickerLights.push(light);

      // 형광등 메시
      const tubeGeo = new THREE.BoxGeometry(0.8, 0.05, 0.1);
      const tubeMat = new THREE.MeshBasicMaterial({ color: 0xccaaff });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      tube.position.set(lx, WALL_HEIGHT - 0.05, lz);
      scene.add(tube);
    }
    flickerRef.current = flickerLights;

    // 약한 주변광
    const ambient = new THREE.AmbientLight(0x0a0520, 0.3);
    scene.add(ambient);

    // 엔티티 (Peeker)
    const entityCount = Math.floor(complexity * 0.5);
    for (let i = 0; i < entityCount; i++) {
      const ex = (Math.floor(Math.random() * mazeW) + 1) * CELL_SIZE;
      const ez = (Math.floor(Math.random() * mazeH) + 1) * CELL_SIZE;
      const geo = new THREE.SphereGeometry(0.3, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0x220033, transparent: true, opacity: 0.8 });
      const entity = new THREE.Mesh(geo, mat);
      entity.position.set(ex, 1.5, ez);
      scene.add(entity);
      entityRef.current.push(entity);
    }

    // 손전등 (플레이어 부착)
    const flashlight = new THREE.SpotLight(0xffffff, 3, 15, Math.PI / 8, 0.5, 1.5);
    flashlight.castShadow = false;
    scene.add(flashlight);
    scene.add(flashlight.target);

    // 애니메이션 루프
    let t = 0;
    const SPEED = 0.06;

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      t += 0.016;

      // 형광등 깜빡임
      flickerLights.forEach((light, i) => {
        const flicker = 0.8 + Math.sin(t * (3 + i * 0.7)) * 0.1 + (Math.random() < 0.02 ? -0.5 : 0);
        light.intensity = Math.max(0.1, flicker * 1.2);
      });

      // 플레이어 이동
      const keys = keysRef.current;
      const player = playerRef.current;
      const cos = Math.cos(player.yaw);
      const sin = Math.sin(player.yaw);

      if (keys["w"] || keys["arrowup"]) {
        player.x += cos * SPEED;
        player.z += sin * SPEED;
      }
      if (keys["s"] || keys["arrowdown"]) {
        player.x -= cos * SPEED;
        player.z -= sin * SPEED;
      }
      if (keys["a"] || keys["arrowleft"]) {
        player.x += sin * SPEED;
        player.z -= cos * SPEED;
      }
      if (keys["d"] || keys["arrowright"]) {
        player.x -= sin * SPEED;
        player.z += cos * SPEED;
      }

      // 카메라 업데이트
      camera.position.set(player.x, player.y, player.z);
      camera.rotation.order = "YXZ";
      camera.rotation.y = -player.yaw;
      camera.rotation.x = 0;

      // 손전등 위치
      flashlight.position.copy(camera.position);
      const dir = new THREE.Vector3(-sin, -0.1, -cos).normalize();
      flashlight.target.position.copy(camera.position).addScaledVector(dir, 10);
      flashlight.target.updateMatrixWorld();

      // 엔티티 스토킹 (Stalker AI)
      entityRef.current.forEach((entity, i) => {
        const dx = player.x - entity.position.x;
        const dz = player.z - entity.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 20 && dist > 2) {
          entity.position.x += (dx / dist) * 0.01;
          entity.position.z += (dz / dist) * 0.01;
        }
        (entity.material as THREE.MeshBasicMaterial).opacity = dist < 8 ? 0.5 + Math.sin(t * 3) * 0.2 : 0;
      });

      // 위치 콜백 (매 60프레임마다)
      if (Math.round(t * 60) % 60 === 0 && onPositionChange) {
        onPositionChange({ x: player.x, y: player.y, z: player.z, mapId: `server_${serverId || "solo"}` });
      }

      renderer.render(scene, camera);
    }

    animate();

    // 리사이즈 핸들러
    const onResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [complexity, serverId, onPositionChange]);

  useEffect(() => {
    const cleanup = initScene();

    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastMouseRef.current.x;
      playerRef.current.yaw += dx * 0.003;
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
      if (mountRef.current && rendererRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, [initScene]);

  return (
    <div
      ref={mountRef}
      data-testid="maze-canvas"
      className="w-full h-full cursor-crosshair"
      style={{ touchAction: "none" }}
    />
  );
}
