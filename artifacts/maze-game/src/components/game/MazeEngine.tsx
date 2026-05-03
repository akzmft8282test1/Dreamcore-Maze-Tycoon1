// 드림코어 미로 엔진 v2 — 2차원, 분홍 출구 문, 꽃-눈 엔티티
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { FLASHLIGHT_PRESETS } from "./flashlight-presets";

// ─── Props ──────────────────────────────────────────────────────────────────
interface MazeEngineProps {
  serverId?: number | null;
  complexity?: number;
  equippedFlashlight?: string | null;
  pointerSensitivity?: number;
  onPositionChange?: (pos: { x: number; y: number; z: number; mapId: string }) => void;
  onFlashlightChange?: (on: boolean) => void;
}

// ─── 상수 ───────────────────────────────────────────────────────────────────
const CELL     = 4;
const H_WALL   = 2.8;
const T_WALL   = 0.18;
const P_HEIGHT = 1.55;
const P_RADIUS = 0.28;
const SPEED    = 5.5;
const BASE_SENS = 0.002;
const MAX_PITCH = Math.PI / 2 - 0.04;
const GAZE_DEATH_TIME = 7.25; // 초

// ─── 미로 생성 ───────────────────────────────────────────────────────────────
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
  const DIRS = [[0,-1,"top"],[1,0,"right"],[0,1,"bottom"],[-1,0,"left"]] as [number,number,string][];
  const stack: [number,number][] = [];
  let [cx, cz] = [0, 0];
  grid[cz][cx].visited = true;
  stack.push([cx, cz]);
  while (stack.length > 0) {
    const nb = DIRS
      .map(([dx,dz,d]) => [cx+dx, cz+dz, d] as [number,number,string])
      .filter(([nx,nz]) => nx>=0 && nx<w && nz>=0 && nz<h && !grid[nz as number][nx as number].visited);
    if (nb.length > 0) {
      const [nx,nz,d] = nb[Math.floor(Math.random()*nb.length)];
      grid[cz][cx].walls[d as keyof MazeCell["walls"]] = false;
      grid[nz][nx].walls[opp[d] as keyof MazeCell["walls"]] = false;
      grid[nz][nx].visited = true;
      stack.push([cx, cz]);
      cx = nx; cz = nz;
    } else {
      [cx,cz] = stack.pop()!;
    }
  }
  return grid;
}

interface WallBox { minX: number; maxX: number; minZ: number; maxZ: number; }

function buildWallBoxes(maze: MazeCell[][], mw: number, mh: number): WallBox[] {
  const boxes: WallBox[] = [];
  const t = T_WALL / 2;
  for (let z = 0; z < mh; z++) for (let x = 0; x < mw; x++) {
    const cell = maze[z][x];
    const wx = x * CELL, wz = z * CELL;
    if (cell.walls.top)    boxes.push({ minX: wx-t, maxX: wx+CELL+t, minZ: wz-t,      maxZ: wz+t });
    if (cell.walls.left)   boxes.push({ minX: wx-t, maxX: wx+t,      minZ: wz-t,      maxZ: wz+CELL+t });
    if (z===mh-1 && cell.walls.bottom) boxes.push({ minX: wx-t, maxX: wx+CELL+t, minZ: wz+CELL-t, maxZ: wz+CELL+t });
    if (x===mw-1 && cell.walls.right)  boxes.push({ minX: wx+CELL-t, maxX: wx+CELL+t, minZ: wz-t,      maxZ: wz+CELL+t });
  }
  return boxes;
}

function hitsWall(boxes: WallBox[], px: number, pz: number): boolean {
  const r = P_RADIUS;
  for (const b of boxes)
    if (px+r>b.minX && px-r<b.maxX && pz+r>b.minZ && pz-r<b.maxZ) return true;
  return false;
}

// ─── 텍스처 ──────────────────────────────────────────────────────────────────
function makeDataTex(fn: (x: number, y: number, s: number) => [number,number,number], size = 128): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y*size+x)*4;
    const [r,g,b] = fn(x,y,size);
    data[i]=r; data[i+1]=g; data[i+2]=b; data[i+3]=255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function makeWallTex(): THREE.DataTexture {
  return makeDataTex((x,y,s) => {
    const stripe = Math.floor(y/(s/8))%2===0;
    const n = ((Math.sin(x*0.4+y*0.3)*0.5+0.5)*18)|0;
    return stripe ? [180+n,168+n,100+n] : [165+n,155+n,88+n];
  });
}

function makeCheckerTex(dark: number, light: number): THREE.DataTexture {
  const dc = [(dark>>16)&0xff,(dark>>8)&0xff,dark&0xff];
  const lc = [(light>>16)&0xff,(light>>8)&0xff,light&0xff];
  return makeDataTex((x,y,s) => {
    const c = (Math.floor(x/(s/8))+Math.floor(y/(s/8)))%2===0 ? dc : lc;
    return [c[0],c[1],c[2]];
  });
}

function makeGrassTex(): THREE.DataTexture {
  return makeDataTex((x,y,s) => {
    const n = ((Math.sin(x*0.7+y*0.4)*0.5+0.5)*28)|0;
    const v = ((Math.cos(x*0.3+y*0.9)*0.5+0.5)*18)|0;
    return [40+n, 160+v, 50+n];
  });
}

// ─── 차원1 씬 빌드 ──────────────────────────────────────────────────────────
interface Dim1Data {
  scene: THREE.Scene;
  wallBoxes: WallBox[];
  doorGroup: THREE.Group | null;
  doorWorldPos: THREE.Vector3 | null;
  doorNormal: THREE.Vector3 | null;
}

function buildDim1(complexity: number, equippedFlashlight: string | null): Dim1Data & { flashlight: THREE.SpotLight; ambientLight: THREE.AmbientLight } {
  const mw = 8 + complexity * 2;
  const mh = 8 + complexity * 2;
  const maze = generateMaze(mw, mh);
  const wallBoxes = buildWallBoxes(maze, mw, mh);
  const TW = mw * CELL, TH = mh * CELL;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc8b87a);
  scene.fog = new THREE.FogExp2(0xc0aa62, 0.052);

  // 바닥/천장
  const floorTex = makeCheckerTex(0x8b7355, 0x9e8462); floorTex.repeat.set(TW/2, TH/2);
  const ceilTex  = makeCheckerTex(0xb0a070, 0xbfaa7a); ceilTex.repeat.set(TW/1.5, TH/1.5);
  const wallTex  = makeWallTex(); wallTex.repeat.set(1.5, 0.8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(TW+4,TH+4), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI/2; floor.position.set(TW/2,0,TH/2); scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(TW+4,TH+4), new THREE.MeshLambertMaterial({ map: ceilTex }));
  ceil.rotation.x = Math.PI/2; ceil.position.set(TW/2,H_WALL,TH/2); scene.add(ceil);

  // 벽
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
  const wallGeoH = new THREE.BoxGeometry(CELL+T_WALL, H_WALL, T_WALL);
  const wallGeoV = new THREE.BoxGeometry(T_WALL, H_WALL, CELL+T_WALL);
  const mH: THREE.Matrix4[] = [], mV: THREE.Matrix4[] = [];
  const m4 = new THREE.Matrix4();
  for (let z = 0; z < mh; z++) for (let x = 0; x < mw; x++) {
    const cell = maze[z][x]; const wx = x*CELL, wz = z*CELL;
    if (cell.walls.top)   mH.push(m4.clone().makeTranslation(wx+CELL/2, H_WALL/2, wz));
    if (cell.walls.left)  mV.push(m4.clone().makeTranslation(wx, H_WALL/2, wz+CELL/2));
    if (z===mh-1&&cell.walls.bottom) mH.push(m4.clone().makeTranslation(wx+CELL/2,H_WALL/2,wz+CELL));
    if (x===mw-1&&cell.walls.right)  mV.push(m4.clone().makeTranslation(wx+CELL,H_WALL/2,wz+CELL/2));
  }
  if (mH.length>0){ const im=new THREE.InstancedMesh(wallGeoH,wallMat,mH.length); mH.forEach((m,i)=>im.setMatrixAt(i,m)); im.instanceMatrix.needsUpdate=true; scene.add(im); }
  if (mV.length>0){ const im=new THREE.InstancedMesh(wallGeoV,wallMat,mV.length); mV.forEach((m,i)=>im.setMatrixAt(i,m)); im.instanceMatrix.needsUpdate=true; scene.add(im); }

  // 조명
  const ambientLight = new THREE.AmbientLight(0xd4c47a, 0.6);
  scene.add(ambientLight);
  for (let z = 0; z < mh; z+=3) for (let x = 0; x < mw; x+=3) {
    const pl = new THREE.PointLight(0xf5e8a0,1.6,CELL*4,1.8);
    pl.position.set(x*CELL+CELL/2, H_WALL-0.1, z*CELL+CELL/2);
    scene.add(pl);
  }

  // 손전등
  const preset = FLASHLIGHT_PRESETS[equippedFlashlight ?? "default"] ?? FLASHLIGHT_PRESETS.default;
  const flashlight = new THREE.SpotLight(preset.color, preset.intensity, preset.distance, preset.angle, preset.penumbra, 1.2);
  flashlight.userData.baseIntensity = preset.intensity;
  scene.add(flashlight); scene.add(flashlight.target);

  // ── 분홍 출구 문 ──────────────────────────────────────────────────────────
  let doorGroup: THREE.Group | null = null;
  let doorWorldPos: THREE.Vector3 | null = null;
  let doorNormal: THREE.Vector3 | null = null;

  // 5% 확률로 문 생성 (dev: 강제 true)
  if (Math.random() < 0.05 || true) {
    // 실제 내부 벽(wall === true)에서 후보 선택
    // 방향 'h' = cell의 top 벽(수평, Z 축 방향으로 면), 'v' = cell의 right 벽(수직, X 축 방향으로 면)
    const candidates: { wallX: number; wallZ: number; dir: 'h'|'v' }[] = [];
    for (let z = 1; z < mh - 1; z++) {
      for (let x = 1; x < mw - 2; x++) {
        if (maze[z][x].walls.top)   candidates.push({ wallX: x, wallZ: z, dir: 'h' });
        if (maze[z][x].walls.right) candidates.push({ wallX: x, wallZ: z, dir: 'v' });
      }
    }

    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];

      // 벽 중앙 월드 좌표
      // top 벽: x*CELL+CELL/2, z*CELL
      // right 벽: (x+1)*CELL, z*CELL+CELL/2
      const wx = pick.dir === 'h'
        ? pick.wallX * CELL + CELL / 2
        : (pick.wallX + 1) * CELL;
      const wz = pick.dir === 'h'
        ? pick.wallZ * CELL
        : pick.wallZ * CELL + CELL / 2;

      const DW   = 1.2;   // 문 너비
      const DH   = 2.4;   // 문 높이
      const DTH  = 0.10;  // 문짝 두께
      const FRAME = 0.13; // 프레임 폭

      const frameMat = new THREE.MeshLambertMaterial({ color: 0xff8fb0, emissive: 0x220010, emissiveIntensity: 0.2 });
      const bodyMat  = new THREE.MeshLambertMaterial({ color: 0xff4d9e, emissive: 0x2a0018, emissiveIntensity: 0.18 });
      const trimMat  = new THREE.MeshLambertMaterial({ color: 0xffbcd6 });
      const goldMat  = new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0x996600, emissiveIntensity: 0.4 });

      doorGroup    = new THREE.Group();
      doorWorldPos = new THREE.Vector3(wx, 0, wz);
      doorNormal   = pick.dir === 'h'
        ? new THREE.Vector3(0, 0, -1)
        : new THREE.Vector3(1, 0, 0);

      // wallAnchor: 벽 중앙을 원점으로, 로컬 +Z = 벽의 법선(플레이어 쪽)
      const wallAnchor = new THREE.Group();
      wallAnchor.position.set(wx, 0, wz);
      if (pick.dir === 'v') wallAnchor.rotation.y = Math.PI / 2;
      doorGroup.add(wallAnchor);

      // 문 프레임 — 벽 앞면에 살짝 돌출
      const ED = 0.0; // 벽 정중앙에서 법선 방향 오프셋 (0 = 정중앙 = 벽 속에 박힘)
      const frameL = new THREE.Mesh(new THREE.BoxGeometry(FRAME, DH + FRAME, T_WALL + 0.04), frameMat);
      frameL.position.set(-DW / 2 - FRAME / 2, DH / 2, ED);
      wallAnchor.add(frameL);
      const frameR = new THREE.Mesh(new THREE.BoxGeometry(FRAME, DH + FRAME, T_WALL + 0.04), frameMat);
      frameR.position.set(DW / 2 + FRAME / 2, DH / 2, ED);
      wallAnchor.add(frameR);
      const frameT = new THREE.Mesh(new THREE.BoxGeometry(DW + FRAME * 2, FRAME, T_WALL + 0.04), frameMat);
      frameT.position.set(0, DH + FRAME / 2, ED);
      wallAnchor.add(frameT);

      // 문짝 힌지 그룹 — 왼쪽 끝이 회전 축
      const doorHinge = new THREE.Group();
      doorHinge.position.set(-DW / 2, 0, ED + DTH / 2 + 0.01);
      wallAnchor.add(doorHinge);

      const doorBody = new THREE.Mesh(new THREE.BoxGeometry(DW, DH, DTH), bodyMat);
      doorBody.position.set(DW / 2, DH / 2, 0);
      doorHinge.add(doorBody);

      // 몰딩 장식 두 개
      const molA = new THREE.Mesh(new THREE.BoxGeometry(DW * 0.7, DH * 0.35, 0.025), trimMat);
      molA.position.set(0, DH * 0.25, DTH / 2 + 0.013);
      doorBody.add(molA);
      const molB = new THREE.Mesh(new THREE.BoxGeometry(DW * 0.7, DH * 0.28, 0.025), trimMat);
      molB.position.set(0, -DH * 0.22, DTH / 2 + 0.013);
      doorBody.add(molB);

      // 금색 손잡이
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), goldMat);
      knob.position.set(DW * 0.38, -DH * 0.04, DTH / 2 + 0.07);
      doorBody.add(knob);

      // 열쇠구멍 장식
      const keyShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.26, 8), goldMat);
      keyShaft.rotation.z = Math.PI / 2;
      keyShaft.position.set(DW * 0.38, DH * 0.06, DTH / 2 + 0.07);
      doorBody.add(keyShaft);
      const keyBow = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.016, 8, 14), goldMat);
      keyBow.position.set(DW * 0.38 - 0.17, DH * 0.06, DTH / 2 + 0.07);
      doorBody.add(keyBow);
      const keyT1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.065, 0.012), goldMat);
      keyT1.position.set(DW * 0.38 + 0.07, DH * 0.06 - 0.05, DTH / 2 + 0.07);
      doorBody.add(keyT1);
      const keyT2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.012), goldMat);
      keyT2.position.set(DW * 0.38 + 0.035, DH * 0.06 - 0.085, DTH / 2 + 0.07);
      doorBody.add(keyT2);

      // 분홍 분위기 조명
      const doorGlow = new THREE.PointLight(0xff69b4, 2.0, 9, 1.3);
      doorGlow.position.set(0, DH * 0.5, 1.2);
      wallAnchor.add(doorGlow);

      // 피봇 저장 (애니메이션용)
      (doorGroup as any)._panel    = doorHinge;
      (doorGroup as any)._angle    = 0;
      (doorGroup as any)._keyAngle = 0;
      (doorGroup as any)._key      = keyShaft;
      (doorGroup as any)._keyBow   = keyBow;

      scene.add(doorGroup);
    }
  }

  return { scene, wallBoxes, doorGroup, doorWorldPos, doorNormal, flashlight, ambientLight };
}

// ─── 차원2 씬 빌드 (드림코어 다른 차원) ────────────────────────────────────
interface Dim2Data {
  scene: THREE.Scene;
  wallBoxes: WallBox[];
  entitySprites: THREE.Sprite[];
}

function buildDim2(entityTex: THREE.Texture | null): Dim2Data {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffe4f0); // 연한 핑크/라벤더 하늘
  scene.fog = new THREE.FogExp2(0xffcce8, 0.025);

  // 밝은 조명
  scene.add(new THREE.AmbientLight(0xfff0f5, 1.8));
  const sun = new THREE.DirectionalLight(0xfffde7, 1.2);
  sun.position.set(20, 40, 10); scene.add(sun);

  // ── 초록 잔디 바닥 ──────────────────────────────────────────────────────
  const grassTex = makeGrassTex(); grassTex.repeat.set(25, 25);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshLambertMaterial({ map: grassTex })
  );
  floor.rotation.x = -Math.PI/2; floor.position.set(0, 0, 0); scene.add(floor);

  // 하단 절벽 (낮은 지면 — 이 아래는 안개로 보이지 않음)
  const cliffFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshLambertMaterial({ color: 0x1a1a2e })
  );
  cliffFloor.rotation.x = -Math.PI/2; cliffFloor.position.set(0, -12, 0); scene.add(cliffFloor);

  // ── 한쪽에서만 보이는 벽 패널 ──────────────────────────────────────────
  const wallBoxes: WallBox[] = [];
  const oneSideMat = new THREE.MeshLambertMaterial({ color: 0xf5f0ff, side: THREE.FrontSide });
  const wallPositions = [
    [-15, 0, -10, 0], [8, Math.PI/4, -20, 0], [-5, Math.PI/6, -30, 0],
    [20, -Math.PI/5, -15, 0], [-25, Math.PI/3, -25, 0], [0, 0, -40, 0],
    [15, Math.PI/2, -5, 0], [-10, Math.PI/4, -45, 0],
  ];
  for (const [wx, ry, wz] of wallPositions) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.5), oneSideMat);
    panel.position.set(wx, 1.75, wz);
    panel.rotation.y = ry;
    scene.add(panel);
    // 반대면 동일 위치 (다른 색으로 — 뒤에서 보면 그냥 벽 패널처럼 보임)
    const backMat = new THREE.MeshLambertMaterial({ color: 0xffe0ef, side: THREE.BackSide });
    const backPanel = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.5), backMat);
    backPanel.position.copy(panel.position); backPanel.rotation.copy(panel.rotation); scene.add(backPanel);
    // 충돌 박스
    const hw = 3, hd = 0.1;
    const cx2 = wx + Math.cos(ry) * hd;
    const cz2 = wz + Math.sin(ry) * hd;
    wallBoxes.push({ minX: cx2-hw, maxX: cx2+hw, minZ: cz2-hd, maxZ: cz2+hd });
  }

  // ── 비치볼 ──────────────────────────────────────────────────────────────
  const ballColors = [0xff4444, 0x4444ff, 0xffcc00, 0xff88cc, 0x44ff88];
  const ballPositions = [
    [-8,-20], [5,-15], [-3,-35], [12,-28], [-18,-22], [7,-42], [-12,-38], [20,-10],
  ];
  for (const [bx, bz] of ballPositions) {
    const ball = new THREE.Group();
    const radius = 0.35 + Math.random() * 0.2;
    const baseCol = ballColors[Math.floor(Math.random()*ballColors.length)];
    const geo = new THREE.SphereGeometry(radius, 16, 16);
    // 줄무늬 색 두 개 교차 — 간단히 MeshLambertMaterial 두 개로 반쪽씩
    const mainMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: baseCol }));
    ball.add(mainMesh);
    // 흰 줄무늬 (작은 토러스)
    for (let i = 0; i < 3; i++) {
      const stripe = new THREE.Mesh(
        new THREE.TorusGeometry(radius*1.01, 0.015, 6, 24),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
      );
      stripe.rotation.x = (i * Math.PI / 3);
      ball.add(stripe);
    }
    ball.position.set(bx, radius, bz);
    ball.rotation.y = Math.random() * Math.PI * 2;
    scene.add(ball);
  }

  // ── 갑작스런 절벽 ────────────────────────────────────────────────────────
  // 잔디 바닥 가장자리에 절벽 벽면 추가
  const cliffMat = new THREE.MeshLambertMaterial({ color: 0x8fbc5a });
  const cliffPositions = [
    { x: 0, z: -55, rx: Math.PI/2, w: 80, rY: 0 },
    { x: 35, z: -30, rx: Math.PI/2, w: 60, rY: Math.PI/2 },
    { x: -35, z: -30, rx: Math.PI/2, w: 60, rY: -Math.PI/2 },
  ];
  for (const cp of cliffPositions) {
    const cliffFace = new THREE.Mesh(
      new THREE.PlaneGeometry(cp.w, 12),
      cliffMat
    );
    cliffFace.rotation.x = -Math.PI/2 + cp.rx;
    cliffFace.rotation.z = cp.rY;
    cliffFace.position.set(cp.x, -6, cp.z);
    scene.add(cliffFace);
  }
  // 절벽 장벽 (플레이어 낙하 방지용 투명 박스)
  wallBoxes.push(
    { minX: -100, maxX: 100, minZ: -57, maxZ: -56 },
    { minX: 37, maxX: 38, minZ: -70, maxZ: 10 },
    { minX: -38, maxX: -37, minZ: -70, maxZ: 10 },
  );

  // ── 꽃-눈 엔티티 (스프라이트) ────────────────────────────────────────────
  const entitySprites: THREE.Sprite[] = [];
  const spawnPoints = [
    [-5,-12], [15,-30], [-20,-18], [8,-45], [-15,-40], [25,-20], [-8,-50],
  ];
  for (const [ex, ez] of spawnPoints) {
    const mat = new THREE.SpriteMaterial({
      map: entityTex ?? null,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.8, 2.6, 1);
    sprite.position.set(ex, 1.3, ez);
    (sprite as any)._gazeTime = 0;
    scene.add(sprite);
    entitySprites.push(sprite);
  }

  return { scene, wallBoxes, entitySprites };
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
  const [dimension, setDimension] = useState<1|2>(1);
  const [doorState, setDoorState] = useState<'closed'|'unlocking'|'opening'|'open'>('closed');
  const [showDoorHint, setShowDoorHint] = useState(false);
  const [dead, setDead] = useState(false);
  const [gazeProgress, setGazeProgress] = useState(0); // 0~1

  // refs
  const yawRef      = useRef(0);
  const pitchRef    = useRef(0);
  const lockedRef   = useRef(false);
  const keysRef     = useRef<Record<string,boolean>>({});
  const flashOnRef  = useRef(true);
  const flashRef    = useRef<THREE.SpotLight|null>(null);
  const wallBoxRef  = useRef<WallBox[]>([]);
  const posRef      = useRef({ x: CELL/2, z: CELL/2 });
  const bobRef      = useRef(0);
  const posTickRef  = useRef(0);
  const sensRef     = useRef(BASE_SENS * pointerSensitivity);
  const dimRef      = useRef<1|2>(1);
  const deadRef     = useRef(false);
  const dim2DataRef = useRef<Dim2Data|null>(null);
  const dim1DataRef = useRef<Dim1Data&{flashlight:THREE.SpotLight;ambientLight:THREE.AmbientLight}|null>(null);
  const activeCameraRef = useRef<THREE.PerspectiveCamera|null>(null);
  const activeSceneRef  = useRef<THREE.Scene|null>(null);
  const doorStateRef    = useRef<'closed'|'unlocking'|'opening'|'open'>('closed');
  const gazeRef         = useRef({ time: 0, spriteIdx: -1 });
  const keyPressBuf     = useRef<Set<string>>(new Set());

  sensRef.current = BASE_SENS * pointerSensitivity;

  const resetToDim1 = useCallback(() => {
    dimRef.current = 1;
    setDimension(1);
    deadRef.current = false;
    setDead(false);
    gazeRef.current = { time:0, spriteIdx:-1 };
    setGazeProgress(0);
    posRef.current = { x: CELL/2, z: CELL/2 };
    yawRef.current = 0; pitchRef.current = 0;
    if (dim1DataRef.current) {
      activeSceneRef.current = dim1DataRef.current.scene;
      wallBoxRef.current = dim1DataRef.current.wallBoxes;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const W = container.clientWidth || window.innerWidth;
    const H = container.clientHeight || window.innerHeight;

    // ── 렌더러 ──────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(W, H);
    container.appendChild(renderer.domElement);

    // ── 카메라 ──────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(75, W/H, 0.05, 120);
    camera.position.set(CELL/2, P_HEIGHT, CELL/2);
    activeCameraRef.current = camera;

    // ── 엔티티 텍스처 로드 ──────────────────────────────────────────────────
    const texLoader = new THREE.TextureLoader();
    let entityTex: THREE.Texture | null = null;
    texLoader.load("/entity-eye.png", (tex) => {
      entityTex = tex;
      // 텍스처 로드 후 dim2 엔티티에 적용
      if (dim2DataRef.current) {
        dim2DataRef.current.entitySprites.forEach(s => {
          (s.material as THREE.SpriteMaterial).map = tex;
          (s.material as THREE.SpriteMaterial).needsUpdate = true;
        });
      }
    });

    // ── 두 차원 씬 빌드 ─────────────────────────────────────────────────────
    const d1 = buildDim1(complexity, equippedFlashlight ?? null);
    dim1DataRef.current = d1;
    const d2 = buildDim2(entityTex);
    dim2DataRef.current = d2;

    // 초기 활성 씬 = 차원1
    activeSceneRef.current = d1.scene;
    wallBoxRef.current = d1.wallBoxes;
    flashRef.current = d1.flashlight;

    // ── Pointer Lock ─────────────────────────────────────────────────────────
    const onClick = () => { container.requestPointerLock(); };
    container.addEventListener("click", onClick);

    const onLockChange = () => {
      const isLocked = document.pointerLockElement === container;
      lockedRef.current = isLocked;
      setLocked(isLocked);
    };
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("pointerlockerror", () => {});

    const onMouseMove = (e: MouseEvent) => {
      if (!lockedRef.current) return;
      yawRef.current   -= e.movementX * sensRef.current;
      pitchRef.current -= e.movementY * sensRef.current;
      pitchRef.current  = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitchRef.current));
    };
    document.addEventListener("mousemove", onMouseMove);

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysRef.current[k] = true;
      keyPressBuf.current.add(k);
      if (k === "f") {
        flashOnRef.current = !flashOnRef.current;
        onFlashlightChange?.(flashOnRef.current);
      }
      if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => { keysRef.current[e.key.toLowerCase()] = false; };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    const onResize = () => {
      const rw = container.clientWidth, rh = container.clientHeight;
      camera.aspect = rw/rh; camera.updateProjectionMatrix();
      renderer.setSize(rw, rh);
    };
    window.addEventListener("resize", onResize);

    // ── 레이캐스터 (문/엔티티 감지) ─────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const centerNDC = new THREE.Vector2(0, 0);

    // ── 애니메이션 루프 ──────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let t = 0, raf: number;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (!activeSceneRef.current) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      t += dt;

      const keys = keysRef.current;
      const pos  = posRef.current;
      const xKey = keyPressBuf.current.has("x");
      keyPressBuf.current.clear();

      const curDim = dimRef.current;

      // 카메라 회전
      camera.quaternion.setFromEuler(new THREE.Euler(pitchRef.current, yawRef.current, 0, "YXZ"));

      // 이동
      const yaw = yawRef.current;
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right   = new THREE.Vector3( Math.cos(yaw), 0, -Math.sin(yaw));
      const move = new THREE.Vector3();
      if (keys["w"]||keys["arrowup"])    move.addScaledVector(forward,  1);
      if (keys["s"]||keys["arrowdown"])  move.addScaledVector(forward, -1);
      if (keys["a"]||keys["arrowleft"])  move.addScaledVector(right,   -1);
      if (keys["d"]||keys["arrowright"]) move.addScaledVector(right,    1);

      const moving = move.lengthSq() > 0;
      if (moving && !deadRef.current) {
        move.normalize().multiplyScalar(SPEED * dt);
        const wb = wallBoxRef.current;
        const nx = pos.x + move.x;
        if (!hitsWall(wb, nx, pos.z)) pos.x = nx;
        const nz = pos.z + move.z;
        if (!hitsWall(wb, pos.x, nz)) pos.z = nz;
      }

      if (moving) bobRef.current += 8*dt;
      const bobY = moving ? Math.sin(bobRef.current)*0.028 : 0;
      camera.position.set(pos.x, P_HEIGHT+bobY, pos.z);

      // ── 차원1 전용 로직 ────────────────────────────────────────────────────
      if (curDim === 1 && d1.doorGroup && d1.doorWorldPos) {
        const dstate = doorStateRef.current;

        // XZ 평면 2D 거리 — Y 축 차이(카메라 높이)를 제외해야 정확함
        const dx2d = pos.x - d1.doorWorldPos.x;
        const dz2d = pos.z - d1.doorWorldPos.z;
        const distToDoor2D = Math.sqrt(dx2d * dx2d + dz2d * dz2d);

        const nearDoor = distToDoor2D < 2.5;
        setShowDoorHint(nearDoor);

        // 손전등
        const fl = flashRef.current;
        if (fl) {
          fl.intensity = flashOnRef.current ? d1.flashlight.userData.baseIntensity : 0;
          fl.position.copy(camera.position);
          const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
          fl.target.position.copy(camera.position).addScaledVector(dir,10);
          fl.target.updateMatrixWorld();
        }

        // 문 상호작용
        if (nearDoor && xKey && dstate === 'closed') {
          doorStateRef.current = 'unlocking';
          setDoorState('unlocking');
        }

        // 문 애니메이션
        const panel = (d1.doorGroup as any)._panel as THREE.Group;
        const keyMesh = (d1.doorGroup as any)._key as THREE.Mesh;
        if (dstate === 'unlocking') {
          (d1.doorGroup as any)._keyAngle = ((d1.doorGroup as any)._keyAngle ?? 0) + dt * 1.8;
          if (keyMesh) keyMesh.rotation.z = Math.sin((d1.doorGroup as any)._keyAngle) * 0.6;
          if ((d1.doorGroup as any)._keyAngle > Math.PI) {
            doorStateRef.current = 'opening';
            setDoorState('opening');
          }
        } else if (dstate === 'opening') {
          (d1.doorGroup as any)._angle = Math.min(
            (d1.doorGroup as any)._angle + dt * 1.5,
            Math.PI / 2
          );
          panel.rotation.y = -(d1.doorGroup as any)._angle;
          if ((d1.doorGroup as any)._angle >= Math.PI/2 - 0.05) {
            doorStateRef.current = 'open';
            setDoorState('open');
          }
        }

        // 문 통과 → 차원2 진입 (문이 열린 뒤 플레이어가 벽을 향해 걸어가면)
        if (dstate === 'open' && distToDoor2D < 1.8) {
          const fwd   = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
          const toDoor = new THREE.Vector3(d1.doorWorldPos.x - pos.x, 0, d1.doorWorldPos.z - pos.z).normalize();
          if (fwd.dot(toDoor) > 0.35) {
            dimRef.current = 2;
            setDimension(2);
            setShowDoorHint(false);
            pos.x = 0; pos.z = -8;
            yawRef.current = 0; pitchRef.current = 0;
            activeSceneRef.current = d2.scene;
            wallBoxRef.current = d2.wallBoxes;
          }
        }
      }

      // ── 차원2 전용 로직 ────────────────────────────────────────────────────
      if (curDim === 2 && !deadRef.current) {
        const sprites = d2.entitySprites;
        raycaster.setFromCamera(centerNDC, camera);
        const hits = raycaster.intersectObjects(sprites, false);

        if (hits.length > 0) {
          const hitSprite = hits[0].object;
          const idx = sprites.indexOf(hitSprite as THREE.Sprite);
          if (idx !== -1) {
            if (gazeRef.current.spriteIdx === idx) {
              gazeRef.current.time += dt;
            } else {
              gazeRef.current = { time: dt, spriteIdx: idx };
            }
            setGazeProgress(Math.min(gazeRef.current.time / GAZE_DEATH_TIME, 1));
            // 7.25초 응시 → 사망
            if (gazeRef.current.time >= GAZE_DEATH_TIME) {
              deadRef.current = true;
              setDead(true);
              gazeRef.current = { time:0, spriteIdx:-1 };
              setGazeProgress(0);
              // 3초 후 차원1로 복귀
              setTimeout(() => {
                resetToDim1();
              }, 3000);
            }
          }
        } else {
          if (gazeRef.current.spriteIdx !== -1) {
            gazeRef.current = { time:0, spriteIdx:-1 };
            setGazeProgress(0);
          }
        }

        // 엔티티 흔들림
        sprites.forEach((s, i) => {
          s.position.x += Math.sin(t*0.4 + i*1.3)*0.004;
          s.position.z += Math.cos(t*0.3 + i*0.9)*0.004;
          // 가까울수록 천천히 플레이어에게 접근
          const dx = pos.x - s.position.x;
          const dz = pos.z - s.position.z;
          const dist = Math.sqrt(dx*dx+dz*dz);
          if (dist < 20 && dist > 1.5) {
            s.position.x += (dx/dist)*0.015*dt;
            s.position.z += (dz/dist)*0.015*dt;
          }
        });
      }

      // 위치 전송
      posTickRef.current++;
      if (posTickRef.current >= 60 && onPositionChange) {
        posTickRef.current = 0;
        onPositionChange({ x:pos.x, y:P_HEIGHT, z:pos.z, mapId:`server_${serverId??'solo'}_dim${curDim}` });
      }

      renderer.render(activeSceneRef.current!, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      if (document.pointerLockElement === container) document.exitPointerLock();
      container.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
      lockedRef.current = false;
    };
  }, [complexity, equippedFlashlight, serverId, resetToDim1]);

  return (
    <div
      ref={containerRef}
      data-testid="maze-canvas"
      className="w-full h-full relative select-none"
      style={{ touchAction:"none", cursor: locked ? "none" : "crosshair" }}
    >
      {/* 조준선 */}
      {locked && !dead && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <line x1="11" y1="2"  x2="11" y2="8"  stroke="rgba(255,255,200,0.9)" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="11" y1="14" x2="11" y2="20" stroke="rgba(255,255,200,0.9)" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="2"  y1="11" x2="8"  y2="11" stroke="rgba(255,255,200,0.9)" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="14" y1="11" x2="20" y2="11" stroke="rgba(255,255,200,0.9)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
      )}

      {/* 클릭 안내 */}
      {!locked && !dead && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 gap-2">
          <div className="px-5 py-2.5 rounded-2xl text-sm font-medium tracking-wider"
            style={{ background:"rgba(0,0,0,0.55)", color:"rgba(255,245,180,0.92)", border:"1px solid rgba(255,240,160,0.18)", backdropFilter:"blur(6px)" }}>
            화면을 클릭하면 마우스가 잠깁니다
          </div>
          <div className="text-xs" style={{ color:"rgba(255,245,180,0.45)" }}>
            WASD 이동 · F 손전등 · ESC 해제{dimension===1 ? " · X 상호작용" : ""}
          </div>
        </div>
      )}

      {/* 차원 표시 */}
      {locked && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none z-10">
          <div className="px-3 py-1 rounded-full text-[10px] tracking-widest"
            style={{
              background: dimension===1 ? "rgba(180,140,60,0.4)" : "rgba(255,120,200,0.35)",
              color: dimension===1 ? "rgba(255,240,160,0.8)" : "rgba(255,180,230,0.9)",
              border: dimension===1 ? "1px solid rgba(255,220,100,0.2)" : "1px solid rgba(255,150,220,0.3)",
            }}>
            {dimension===1 ? "◈ 1차원 — 리미널 미로" : "◈ 2차원 — 드림코어"}
          </div>
        </div>
      )}

      {/* 문 상호작용 힌트 */}
      {showDoorHint && locked && dimension===1 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-20">
          <div className="px-4 py-2 rounded-xl text-xs tracking-wide animate-pulse"
            style={{ background:"rgba(255,100,180,0.3)", color:"rgba(255,200,230,0.95)", border:"1px solid rgba(255,100,180,0.4)", backdropFilter:"blur(4px)" }}>
            {doorState==='closed' && "[ X ] 열쇠를 돌려 문을 여세요"}
            {doorState==='unlocking' && "🔑 열쇠가 돌아가고 있습니다..."}
            {doorState==='opening' && "삐걱— 문이 열립니다..."}
            {doorState==='open' && "✦ 다른 차원이 보입니다 — 들어가세요"}
          </div>
        </div>
      )}

      {/* 응시 게이지 (차원2) */}
      {dimension===2 && gazeProgress > 0 && !dead && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 pointer-events-none z-20 flex flex-col items-center gap-1">
          <span className="text-[10px] tracking-widest" style={{ color:"rgba(255,100,150,0.8)" }}>눈을 마주치고 있습니다</span>
          <div className="w-48 h-2 rounded-full overflow-hidden" style={{ background:"rgba(80,0,30,0.5)" }}>
            <div className="h-full rounded-full transition-all" style={{
              width: `${gazeProgress*100}%`,
              background: `linear-gradient(90deg, #ff4488, #ff0066)`,
              boxShadow: "0 0 8px #ff4488",
            }} />
          </div>
          <span className="text-[9px]" style={{ color:"rgba(255,80,120,0.6)" }}>{(gazeProgress*GAZE_DEATH_TIME).toFixed(1)}s / {GAZE_DEATH_TIME}s</span>
        </div>
      )}

      {/* 사망 오버레이 */}
      {dead && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none"
          style={{ background:"rgba(60,0,20,0.85)", backdropFilter:"blur(2px)" }}>
          <div className="text-center space-y-3">
            <p className="text-4xl" style={{ color:"#ff3366", textShadow:"0 0 30px #ff0044" }}>
              👁
            </p>
            <p className="text-xl font-bold tracking-widest" style={{ color:"rgba(255,100,130,0.95)" }}>
              눈을 마주쳤습니다
            </p>
            <p className="text-sm" style={{ color:"rgba(255,160,180,0.7)" }}>
              1차원으로 돌아갑니다...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
