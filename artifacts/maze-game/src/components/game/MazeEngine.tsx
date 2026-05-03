// 백룸/리미널 스페이스 스타일 3D 미로 엔진
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
  default:              { color: 0xfff5cc, intensity: 3,   distance: 16, angle: Math.PI / 7,   penumbra: 0.5 },
  flashlight_basic:     { color: 0xfff9c4, intensity: 2.5, distance: 13, angle: Math.PI / 8,   penumbra: 0.6 },
  flashlight_wide:      { color: 0xfff3e0, intensity: 3.5, distance: 20, angle: Math.PI / 4.5, penumbra: 0.3 },
  flashlight_uv:        { color: 0xce93d8, intensity: 4,   distance: 14, angle: Math.PI / 7,   penumbra: 0.2 },
  flashlight_dreamcore: { color: 0xffe57f, intensity: 5,   distance: 26, angle: Math.PI / 6,   penumbra: 0.4 },
};

interface MazeEngineProps {
  serverId?: number | null;
  complexity?: number;
  equippedFlashlight?: string | null;
  onPositionChange?: (pos: { x: number; y: number; z: number; mapId: string }) => void;
  onFlashlightChange?: (on: boolean) => void;
}

interface MazeCell {
  x: number; z: number;
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  visited: boolean;
}

interface WallBox { minX: number; maxX: number; minZ: number; maxZ: number; }

function generateMaze(w: number, h: number): MazeCell[][] {
  const grid: MazeCell[][] = Array.from({ length: h }, (_, z) =>
    Array.from({ length: w }, (_, x) => ({ x, z, walls: { top: true, right: true, bottom: true, left: true }, visited: false }))
  );
  const stack: [number, number][] = [];
  let cx = 0, cz = 0;
  grid[cz][cx].visited = true;
  stack.push([cx, cz]);
  while (stack.length > 0) {
    const dirs = [[0,-1,"top"],[1,0,"right"],[0,1,"bottom"],[-1,0,"left"]] as [number,number,string][];
    const nb = dirs.filter(([dx,dz]) => { const nx=cx+dx,nz=cz+dz; return nx>=0&&nx<w&&nz>=0&&nz<h&&!grid[nz][nx].visited; }).map(([dx,dz,d]) => [cx+dx,cz+dz,d] as [number,number,string]);
    if (nb.length > 0) {
      const [nx,nz,d] = nb[Math.floor(Math.random()*nb.length)];
      const opp: Record<string,string> = { top:"bottom", bottom:"top", left:"right", right:"left" };
      grid[cz][cx].walls[d as keyof MazeCell["walls"]] = false;
      grid[nz][nx].walls[opp[d] as keyof MazeCell["walls"]] = false;
      grid[nz][nx].visited = true;
      stack.push([cx,cz]);
      cx=nx; cz=nz;
    } else {
      const [px,pz] = stack.pop()!;
      cx=px; cz=pz;
    }
  }
  return grid;
}

const CELL    = 4;
const H_WALL  = 2.8;
const T_WALL  = 0.18;
const P_HEIGHT = 1.55;
const P_RADIUS = 0.26;
const SPEED   = 0.072;
const SENS    = 0.0018;
const MAX_PITCH = Math.PI / 2 - 0.04;

function buildBoxes(maze: MazeCell[][], mw: number, mh: number): WallBox[] {
  const boxes: WallBox[] = [];
  const t = T_WALL / 2;
  for (let z=0; z<mh; z++) for (let x=0; x<mw; x++) {
    const cell=maze[z][x], cx=x*CELL, cz=z*CELL;
    if (cell.walls.top)    boxes.push({ minX:cx-t, maxX:cx+CELL+t, minZ:cz-t,      maxZ:cz+t });
    if (cell.walls.left)   boxes.push({ minX:cx-t, maxX:cx+t,      minZ:cz-t,      maxZ:cz+CELL+t });
    if (z===mh-1&&cell.walls.bottom) boxes.push({ minX:cx-t, maxX:cx+CELL+t, minZ:cz+CELL-t, maxZ:cz+CELL+t });
    if (x===mw-1&&cell.walls.right)  boxes.push({ minX:cx+CELL-t, maxX:cx+CELL+t, minZ:cz-t, maxZ:cz+CELL+t });
  }
  return boxes;
}

function hits(boxes: WallBox[], px: number, pz: number): boolean {
  const r = P_RADIUS;
  for (const b of boxes)
    if (px+r>b.minX && px-r<b.maxX && pz+r>b.minZ && pz-r<b.maxZ) return true;
  return false;
}

// Procedural checkerboard texture for floor/ceiling (backroom carpet feel)
function makeCheckerTex(dark: number, light: number, size = 64): THREE.DataTexture {
  const s = size, data = new Uint8Array(s*s*4);
  const dc=[((dark>>16)&0xff),((dark>>8)&0xff),(dark&0xff)];
  const lc=[((light>>16)&0xff),((light>>8)&0xff),(light&0xff)];
  for (let y=0;y<s;y++) for (let x=0;x<s;x++) {
    const i=(y*s+x)*4;
    const col = ((Math.floor(x/(s/8))+Math.floor(y/(s/8)))%2===0) ? dc : lc;
    data[i]=col[0]; data[i+1]=col[1]; data[i+2]=col[2]; data[i+3]=255;
  }
  const tex = new THREE.DataTexture(data,s,s,THREE.RGBAFormat);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.needsUpdate=true;
  return tex;
}

// Wallpaper stripe texture (backrooms yellow wallpaper)
function makeWallTex(size=128): THREE.DataTexture {
  const s=size, data=new Uint8Array(s*s*4);
  for (let y=0;y<s;y++) for (let x=0;x<s;x++) {
    const i=(y*s+x)*4;
    // horizontal stripe every 16px
    const stripe = Math.floor(y/(s/8)) % 2 === 0;
    const noise  = (Math.sin(x*0.4+y*0.3)*0.5+0.5)*18 | 0;
    const base   = stripe ? [180+noise, 168+noise, 100+noise] : [165+noise, 155+noise, 88+noise];
    data[i]=base[0]; data[i+1]=base[1]; data[i+2]=base[2]; data[i+3]=255;
  }
  const tex = new THREE.DataTexture(data,s,s,THREE.RGBAFormat);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.needsUpdate=true;
  return tex;
}

export default function MazeEngine({ serverId, complexity=5, equippedFlashlight, onPositionChange, onFlashlightChange }: MazeEngineProps) {
  const mountRef      = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement|null>(null);
  const rendererRef   = useRef<THREE.WebGLRenderer|null>(null);
  const animFrameRef  = useRef<number>(0);
  const lockedRef     = useRef(false);
  const [locked, setLocked] = useState(false);

  const playerRef     = useRef({ x: CELL/2, y: P_HEIGHT, z: CELL/2, yaw: 0, pitch: 0 });
  const keysRef       = useRef<Record<string,boolean>>({});
  const flashOnRef    = useRef(true);
  const flashRef      = useRef<THREE.SpotLight|null>(null);
  const wallBoxRef    = useRef<WallBox[]>([]);
  const bobRef        = useRef(0);
  const posTickRef    = useRef(0);

  const initScene = useCallback(() => {
    if (!mountRef.current) return;
    const W = mountRef.current.clientWidth;
    const H = mountRef.current.clientHeight;

    // --- Renderer (performance: no shadows, pixel ratio capped at 1) ---
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.LinearToneMapping;
    renderer.toneMappingExposure = 1.0;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    canvasRef.current   = renderer.domElement;

    // --- Scene ---
    const scene = new THREE.Scene();
    // Backrooms: sickly yellow-beige background, dense fog
    scene.background = new THREE.Color(0xc8b87a);
    scene.fog = new THREE.FogExp2(0xc0aa62, 0.055);

    const camera = new THREE.PerspectiveCamera(75, W/H, 0.05, 80);
    camera.rotation.order = "YXZ";

    // --- Maze ---
    const mw = 8 + complexity*2;
    const mh = 8 + complexity*2;
    const maze = generateMaze(mw, mh);
    wallBoxRef.current = buildBoxes(maze, mw, mh);
    const TW = mw*CELL, TH = mh*CELL;

    // --- Textures ---
    const wallTex   = makeWallTex(128);
    wallTex.repeat.set(1.5, 0.8);
    const floorTex  = makeCheckerTex(0x8b7355, 0x9e8462, 128);
    floorTex.repeat.set(TW/2, TH/2);
    const ceilTex   = makeCheckerTex(0xb0a070, 0xbfaa7a, 64);
    ceilTex.repeat.set(TW/1.5, TH/1.5);

    const wallMat  = new THREE.MeshLambertMaterial({ map: wallTex });
    const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
    const ceilMat  = new THREE.MeshLambertMaterial({ map: ceilTex });

    // floor + ceiling (single plane each for performance)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(TW+4, TH+4), floorMat);
    floor.rotation.x = -Math.PI/2; floor.position.set(TW/2,0,TH/2); scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(TW+4, TH+4), ceilMat);
    ceil.rotation.x = Math.PI/2; ceil.position.set(TW/2, H_WALL, TH/2); scene.add(ceil);

    // --- Walls (instanced for performance) ---
    const wallGeoH = new THREE.BoxGeometry(CELL+T_WALL, H_WALL, T_WALL);
    const wallGeoV = new THREE.BoxGeometry(T_WALL, H_WALL, CELL+T_WALL);
    const wallsH: THREE.Matrix4[] = [], wallsV: THREE.Matrix4[] = [];
    const mat4 = new THREE.Matrix4();
    for (let z=0; z<mh; z++) for (let x=0; x<mw; x++) {
      const cell=maze[z][x], cx=x*CELL, cz=z*CELL;
      if (cell.walls.top)    wallsH.push(mat4.clone().makeTranslation(cx+CELL/2, H_WALL/2, cz));
      if (cell.walls.left)   wallsV.push(mat4.clone().makeTranslation(cx, H_WALL/2, cz+CELL/2));
      if (z===mh-1&&cell.walls.bottom) wallsH.push(mat4.clone().makeTranslation(cx+CELL/2, H_WALL/2, cz+CELL));
      if (x===mw-1&&cell.walls.right)  wallsV.push(mat4.clone().makeTranslation(cx+CELL, H_WALL/2, cz+CELL/2));
    }
    if (wallsH.length > 0) {
      const inst = new THREE.InstancedMesh(wallGeoH, wallMat, wallsH.length);
      wallsH.forEach((m,i) => inst.setMatrixAt(i,m));
      inst.instanceMatrix.needsUpdate=true; scene.add(inst);
    }
    if (wallsV.length > 0) {
      const inst = new THREE.InstancedMesh(wallGeoV, wallMat, wallsV.length);
      wallsV.forEach((m,i) => inst.setMatrixAt(i,m));
      inst.instanceMatrix.needsUpdate=true; scene.add(inst);
    }

    // --- Lighting: backrooms fluorescent feel ---
    // Dim global ambient (yellow-green tint)
    scene.add(new THREE.AmbientLight(0xd4c47a, 0.6));

    // Fluorescent ceiling strips (point lights, no shadow, cheap)
    const lightColor = 0xf5e8a0;
    const gridStep = 3; // every 3 cells
    for (let z=0; z<mh; z+=gridStep) for (let x=0; x<mw; x+=gridStep) {
      const pl = new THREE.PointLight(lightColor, 1.6, CELL*gridStep*1.4, 1.8);
      pl.position.set(x*CELL+CELL/2, H_WALL-0.1, z*CELL+CELL/2);
      scene.add(pl);
    }

    // --- Flashlight (SpotLight, no shadow) ---
    const preset = FLASHLIGHT_PRESETS[equippedFlashlight ?? "default"] ?? FLASHLIGHT_PRESETS.default;
    const flashlight = new THREE.SpotLight(preset.color, preset.intensity, preset.distance, preset.angle, preset.penumbra, 1.2);
    scene.add(flashlight); scene.add(flashlight.target);
    flashRef.current = flashlight;

    // --- Entities (backrooms entities: shadowy blobs) ---
    const entityCount = Math.max(1, Math.floor(complexity*0.5));
    const entities: { mesh: THREE.Mesh; ox: number; oz: number }[] = [];
    const eMat = new THREE.MeshBasicMaterial({ color: 0x1a0f00, transparent: true, opacity: 0.0 });
    for (let i=0; i<entityCount; i++) {
      const ex=(Math.floor(Math.random()*(mw-4))+3)*CELL-CELL/2;
      const ez=(Math.floor(Math.random()*(mh-4))+3)*CELL-CELL/2;
      const geo = new THREE.CylinderGeometry(0.22, 0.28, 1.8, 8);
      const mesh = new THREE.Mesh(geo, eMat.clone());
      mesh.position.set(ex, 0.9, ez); scene.add(mesh);
      entities.push({ mesh, ox: ex, oz: ez });
    }

    // --- Animation loop ---
    let t = 0;
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      t += 0.016;

      const keys = keysRef.current;
      const pl   = playerRef.current;
      const sinY = Math.sin(pl.yaw);
      const cosY = Math.cos(pl.yaw);

      // Movement
      let mx=0, mz=0;
      if (keys["w"]||keys["arrowup"])    { mx -= sinY; mz -= cosY; }
      if (keys["s"]||keys["arrowdown"])  { mx += sinY; mz += cosY; }
      if (keys["a"]||keys["arrowleft"])  { mx -= cosY; mz += sinY; }
      if (keys["d"]||keys["arrowright"]) { mx += cosY; mz -= sinY; }
      const len = Math.sqrt(mx*mx+mz*mz);
      if (len>0) { mx=(mx/len)*SPEED; mz=(mz/len)*SPEED; }
      const wb = wallBoxRef.current;
      if (mx!==0||mz!==0) {
        const nx=pl.x+mx, nz=pl.z+mz;
        if (!hits(wb,nx,nz))         { pl.x=nx; pl.z=nz; }
        else if (!hits(wb,nx,pl.z))  { pl.x=nx; }
        else if (!hits(wb,pl.x,nz))  { pl.z=nz; }
      }

      // Head bob
      const isMoving = len>0;
      if (isMoving) bobRef.current += 0.12;
      const bobY = isMoving ? Math.sin(bobRef.current)*0.028 : 0;

      // Camera
      camera.position.set(pl.x, P_HEIGHT+bobY, pl.z);
      camera.rotation.y = pl.yaw;
      camera.rotation.x = pl.pitch;
      camera.rotation.z = 0;

      // Flashlight
      const fl = flashRef.current;
      if (fl) {
        fl.intensity = flashOnRef.current ? preset.intensity : 0;
        fl.position.copy(camera.position);
        const dir = new THREE.Vector3(0,0,-1).applyEuler(camera.rotation).normalize();
        fl.target.position.copy(camera.position).addScaledVector(dir,10);
        fl.target.updateMatrixWorld();
      }

      // Entities
      entities.forEach(({ mesh, ox, oz }) => {
        const dx=pl.x-mesh.position.x, dz=pl.z-mesh.position.z;
        const dist=Math.sqrt(dx*dx+dz*dz);
        const mat = mesh.material as THREE.MeshBasicMaterial;
        if (dist < 18 && dist > 1.2) {
          mesh.position.x += (dx/dist)*0.007;
          mesh.position.z += (dz/dist)*0.007;
        }
        // Wander slightly
        mesh.position.x += Math.sin(t*0.3+(ox+oz))*0.003;
        mesh.position.z += Math.cos(t*0.25+(ox+oz))*0.003;
        mat.opacity = dist < 14 ? Math.min(0.75, (14-dist)/14*0.8+Math.sin(t*4)*0.1) : 0;
      });

      // Position reporting (throttled)
      posTickRef.current++;
      if (posTickRef.current >= 60 && onPositionChange) {
        posTickRef.current=0;
        onPositionChange({ x:pl.x, y:pl.y, z:pl.z, mapId:`server_${serverId||"solo"}` });
      }

      renderer.render(scene, camera);
    }
    animate();

    const onResize = () => {
      if (!mountRef.current) return;
      const w=mountRef.current.clientWidth, h=mountRef.current.clientHeight;
      camera.aspect=w/h; camera.updateProjectionMatrix();
      renderer.setSize(w,h);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [complexity, serverId, equippedFlashlight, onPositionChange]);

  useEffect(() => {
    const cleanup = initScene();

    // --- Input ---
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.pointerLockElement === canvasRef.current) document.exitPointerLock();
        return;
      }
      keysRef.current[e.key.toLowerCase()] = true;
      if (e.key.toLowerCase() === "f") {
        flashOnRef.current = !flashOnRef.current;
        onFlashlightChange?.(flashOnRef.current);
      }
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => { keysRef.current[e.key.toLowerCase()] = false; };

    // Mouse look — pointer lock only
    const onMouseMove = (e: MouseEvent) => {
      if (!lockedRef.current) return;
      const pl = playerRef.current;
      pl.yaw   -= e.movementX * SENS;
      pl.pitch -= e.movementY * SENS;
      pl.pitch  = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pl.pitch));
    };

    const onLockChange = () => {
      const canvas = canvasRef.current;
      const isLocked = document.pointerLockElement === canvas;
      lockedRef.current = isLocked;
      setLocked(isLocked);
      if (canvas) canvas.style.cursor = isLocked ? "none" : "crosshair";
    };

    const onPointerDown = (e: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.requestPointerLock();
    };

    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("pointerlockerror", onLockChange);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup",   onKeyUp);
    document.addEventListener("mousemove", onMouseMove);
    canvasRef.current?.addEventListener("pointerdown", onPointerDown);

    return () => {
      if (cleanup) cleanup();
      cancelAnimationFrame(animFrameRef.current);
      if (document.pointerLockElement === canvasRef.current) document.exitPointerLock();
      rendererRef.current?.dispose();
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("pointerlockerror", onLockChange);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup",   onKeyUp);
      document.removeEventListener("mousemove", onMouseMove);
      canvasRef.current?.removeEventListener("pointerdown", onPointerDown);
      if (mountRef.current && rendererRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, [initScene, onFlashlightChange]);

  return (
    <div
      ref={mountRef}
      data-testid="maze-canvas"
      className="w-full h-full relative select-none"
      style={{ touchAction: "none", cursor: locked ? "none" : "crosshair" }}
    >
      {/* 조준점 — 포인터락 중일 때만 */}
      {locked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <line x1="10" y1="3"  x2="10" y2="8"  stroke="rgba(255,255,200,0.85)" strokeWidth="1.5"/>
            <line x1="10" y1="12" x2="10" y2="17" stroke="rgba(255,255,200,0.85)" strokeWidth="1.5"/>
            <line x1="3"  y1="10" x2="8"  y2="10" stroke="rgba(255,255,200,0.85)" strokeWidth="1.5"/>
            <line x1="12" y1="10" x2="17" y2="10" stroke="rgba(255,255,200,0.85)" strokeWidth="1.5"/>
          </svg>
        </div>
      )}

      {/* 클릭 안내 — 잠금 해제 상태 */}
      {!locked && (
        <div className="absolute inset-0 flex items-end justify-center pb-10 pointer-events-none z-10">
          <p className="text-xs px-3 py-1.5 rounded-full" style={{ background:"rgba(0,0,0,0.45)", color:"rgba(255,245,180,0.85)", letterSpacing:"0.05em" }}>
            클릭하여 시점 조작 · ESC로 해제
          </p>
        </div>
      )}
    </div>
  );
}
