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
const GAZE_DEATH_TIME = 2.25; // 초 (눈 응시 사망 시간)
const DIM2_MW = 8; // 차원2 미로 너비
const DIM2_MH = 8; // 차원2 미로 높이
const BALL_FRICTION = 0.88; // 비치볼 마찰 계수 (프레임당)
const ENTITY_SPEED  = 0.9;  // 엔티티 이동 속도

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

function makeCloudSkyTex(): THREE.DataTexture {
  const SIZE = 256;
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const ty = y / SIZE;
      const r = Math.round(100 + ty * 55);
      const g = Math.round(170 + ty * 50);
      const b = 255;
      const cx = x / SIZE, cy = y / SIZE;
      const c1 = Math.max(0, 1 - Math.sqrt(Math.pow((cx-0.18)*2.8, 2) + Math.pow((cy-0.25)*5.5, 2)));
      const c2 = Math.max(0, 1 - Math.sqrt(Math.pow((cx-0.55)*3.2, 2) + Math.pow((cy-0.18)*6.0, 2)));
      const c3 = Math.max(0, 1 - Math.sqrt(Math.pow((cx-0.78)*2.5, 2) + Math.pow((cy-0.62)*5.8, 2)));
      const c4 = Math.max(0, 1 - Math.sqrt(Math.pow((cx-0.35)*2.2, 2) + Math.pow((cy-0.72)*6.5, 2)));
      const cloud = Math.min(1, (c1 + c2 + c3 + c4) * 1.1);
      data[i]   = Math.min(255, Math.round(r + cloud * (255 - r)));
      data[i+1] = Math.min(255, Math.round(g + cloud * (255 - g)));
      data[i+2] = Math.min(255, Math.round(b + cloud * (255 - b)));
      data[i+3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ─── 꽃-눈 엔티티 3D 모델 빌드 ───────────────────────────────────────────────
function buildFlowerEntity(): { group: THREE.Group; eyeMesh: THREE.Mesh; legL: THREE.Mesh; legR: THREE.Mesh; flowerHead: THREE.Group } {
  const darkMat   = new THREE.MeshLambertMaterial({ color: 0x1a1a28 });
  const darkPMat  = new THREE.MeshLambertMaterial({ color: 0x252538 });
  const skinMat   = new THREE.MeshLambertMaterial({ color: 0xf0d0b8 });
  const petalMatA = new THREE.MeshLambertMaterial({ color: 0xff79b8, emissive: 0x220010, emissiveIntensity: 0.12 });
  const petalMatB = new THREE.MeshLambertMaterial({ color: 0xdd5090, emissive: 0x1a000c, emissiveIntensity: 0.08 });
  const sepalMat  = new THREE.MeshLambertMaterial({ color: 0x3a9a44 });
  const irisMatG  = new THREE.MeshLambertMaterial({ color: 0x22cc55, emissive: 0x006622, emissiveIntensity: 0.5 });
  const pupilMat  = new THREE.MeshLambertMaterial({ color: 0x050510 });
  const whiteMat  = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const yellowMat = new THREE.MeshLambertMaterial({ color: 0xffd700 });
  const sockMat   = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
  const shoeMat   = new THREE.MeshLambertMaterial({ color: 0x222222 });

  const group = new THREE.Group();

  // ── 몸통(재킷) ────────────────────────────────────────
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.28), darkMat);
  torso.position.set(0, 0.95, 0); group.add(torso);

  // 깃/넥타이 (흰색)
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.29), whiteMat);
  collar.position.set(0, 1.28, 0); group.add(collar);

  // 주머니/배지 (노란 직사각형)
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.06), yellowMat);
  badge.position.set(0, 0.88, 0.17); group.add(badge);

  // 치마 (플리츠 — 원기둥으로 근사)
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.35, 0.48, 10), darkPMat);
  skirt.position.set(0, 0.49, 0); group.add(skirt);

  // ── 팔 (X자로 교차) ────────────────────────────────────
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.44, 6), darkMat);
  armL.rotation.z = -Math.PI * 0.3;
  armL.position.set(-0.3, 0.94, 0.1); group.add(armL);
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.44, 6), darkMat);
  armR.rotation.z = Math.PI * 0.3;
  armR.position.set(0.3, 0.94, 0.1); group.add(armR);

  // ── 다리 ─────────────────────────────────────────────
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.58, 6), skinMat);
  legL.position.set(-0.12, 0.13, 0); group.add(legL);
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.58, 6), skinMat);
  legR.position.set(0.12, 0.13, 0); group.add(legR);

  // ── 양말 + 신발 ──────────────────────────────────────
  for (const sx of [-0.12, 0.12]) {
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.072, 0.18, 6), sockMat);
    sock.position.set(sx, -0.16, 0); group.add(sock);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), shoeMat);
    shoe.position.set(sx, -0.29, 0.03); group.add(shoe);
  }

  // ── 꽃 머리 ─────────────────────────────────────────
  const flowerHead = new THREE.Group();
  flowerHead.position.set(0, 1.72, 0);
  group.add(flowerHead);

  // 꽃받침 (녹색 원판)
  const sepal = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16), sepalMat);
  sepal.rotation.x = Math.PI / 2;
  sepal.position.set(0, 0, -0.02);
  flowerHead.add(sepal);

  // 꽃잎 (16장)
  const NPETALS = 16;
  for (let i = 0; i < NPETALS; i++) {
    const ang = (i / NPETALS) * Math.PI * 2;
    const pg = new THREE.Group();
    pg.rotation.z = ang;
    flowerHead.add(pg);
    const isLong = i % 2 === 0;
    const pl = isLong ? 0.46 : 0.38;
    const pw = isLong ? 0.12 : 0.09;
    const petal = new THREE.Mesh(new THREE.BoxGeometry(pw, pl, 0.055), i % 3 < 2 ? petalMatA : petalMatB);
    petal.position.set(0, 0.22 + pl / 2, 0);
    pg.add(petal);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(pw * 0.5, 6, 4), i % 3 < 2 ? petalMatA : petalMatB);
    tip.scale.y = 0.6;
    tip.position.set(0, 0.22 + pl, 0);
    pg.add(tip);
  }

  // 눈 흰자 (흰 원)
  const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), whiteMat);
  eyeWhite.position.set(0, 0, 0.08);
  flowerHead.add(eyeWhite);

  // 홍채 (초록)
  const eyeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), irisMatG);
  eyeMesh.position.set(0, 0, 0.25);
  flowerHead.add(eyeMesh);

  // 동공 (검정)
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), pupilMat);
  pupil.position.set(0, 0, 0.39);
  flowerHead.add(pupil);

  // 눈빛 하이라이트
  const hl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), whiteMat);
  hl.position.set(0.06, 0.07, 0.46);
  flowerHead.add(hl);

  return { group, eyeMesh, legL, legR, flowerHead };
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

// ─── 차원2 씬 데이터 타입 ────────────────────────────────────────────────────
interface BeachBallData {
  group: THREE.Group;
  vel: THREE.Vector3;
  radius: number;
  collected: boolean;
}

interface EntityDim2Data {
  group: THREE.Group;
  eyeMesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  phase: number;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  flowerHead: THREE.Group;
}

interface Dim2Data {
  scene: THREE.Scene;
  wallBoxes: WallBox[];
  entityGroups: EntityDim2Data[];
  balls: BeachBallData[];
}

// ─── 차원2 씬 빌드 (백룸식 미로 — 드림코어 차원) ─────────────────────────────
function buildDim2(): Dim2Data {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0xb8e4ff, 0.016);

  // 조명
  scene.add(new THREE.AmbientLight(0xfff8f0, 2.4));
  const sun = new THREE.DirectionalLight(0xfffde7, 1.6);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  // 미로 생성 (DIM2_MW×DIM2_MH)
  const maze = generateMaze(DIM2_MW, DIM2_MH);
  const mazeW = DIM2_MW * CELL;
  const mazeH = DIM2_MH * CELL;

  // ── 잔디 바닥 (미로 플레이 영역만) ─────────────────────────────────────
  const grassTex = makeGrassTex();
  grassTex.repeat.set(DIM2_MW * 2, DIM2_MH * 2);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(mazeW + 0.5, mazeH + 0.5),
    new THREE.MeshLambertMaterial({ map: grassTex })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(mazeW / 2, 0, mazeH / 2);
  scene.add(floor);

  // 절벽 아래 어두운 지면 (void)
  const voidMat = new THREE.MeshLambertMaterial({ color: 0x080810 });
  const voidFloor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), voidMat);
  voidFloor.rotation.x = -Math.PI / 2;
  voidFloor.position.set(mazeW / 2, -18, mazeH / 2);
  scene.add(voidFloor);

  // 절벽 경계 어두운 테두리 (경고 표시)
  const edgeMat = new THREE.MeshLambertMaterial({ color: 0x182410 });
  const edgeW = 4;
  for (const [ex, ew, ez, eeh] of [
    [mazeW / 2, mazeW + edgeW * 2, -edgeW / 2, edgeW],
    [mazeW / 2, mazeW + edgeW * 2, mazeH + edgeW / 2, edgeW],
    [-edgeW / 2, edgeW, mazeH / 2, mazeH],
    [mazeW + edgeW / 2, edgeW, mazeH / 2, mazeH],
  ] as [number,number,number,number][]) {
    const ep = new THREE.Mesh(new THREE.PlaneGeometry(ew, eeh), edgeMat);
    ep.rotation.x = -Math.PI / 2;
    ep.position.set(ex, -0.01, ez);
    scene.add(ep);
  }

  // ── 벽 재료 ─────────────────────────────────────────────────────────────
  const skyTex = makeCloudSkyTex();
  const skyMat  = new THREE.MeshLambertMaterial({ map: skyTex, side: THREE.FrontSide });
  const glassMat = new THREE.MeshBasicMaterial({
    color: 0xddf0ff, transparent: true, opacity: 0.09,
    side: THREE.FrontSide, depthWrite: false,
  });
  const outLineMat = new THREE.LineBasicMaterial({ color: 0xff99cc });

  const wallBoxes: WallBox[] = [];

  function addWall(
    cx: number, cz: number,
    width: number, height: number,
    rotY: number,
    glassOnPlus: boolean
  ) {
    const planeGeo = new THREE.PlaneGeometry(width, height);

    const glassRotY = rotY + (glassOnPlus ? 0 : Math.PI);
    const skyRotY   = rotY + (glassOnPlus ? Math.PI : 0);

    const glassPlane = new THREE.Mesh(planeGeo, glassMat);
    glassPlane.rotation.y = glassRotY;
    glassPlane.position.set(cx, height / 2, cz);
    scene.add(glassPlane);

    const edgesGeo = new THREE.EdgesGeometry(planeGeo);
    const outline  = new THREE.LineSegments(edgesGeo, outLineMat);
    outline.rotation.y = glassRotY;
    outline.position.set(cx, height / 2 + 0.002, cz);
    scene.add(outline);

    const skyPlane = new THREE.Mesh(planeGeo, skyMat);
    skyPlane.rotation.y = skyRotY;
    skyPlane.position.set(cx, height / 2, cz);
    scene.add(skyPlane);
  }

  // ── 미로 벽 배치 ─────────────────────────────────────────────────────────
  for (let r = 0; r < DIM2_MH; r++) {
    for (let c = 0; c < DIM2_MW; c++) {
      const cell = maze[r][c];
      const wx = c * CELL;
      const wz = r * CELL;

      // 위쪽 벽 (수평, X 방향)
      if (cell.walls.top) {
        const cx = wx + CELL / 2;
        const cz = wz;
        addWall(cx, cz, CELL, H_WALL, 0, true);
        wallBoxes.push({ minX: cx - CELL / 2, maxX: cx + CELL / 2, minZ: cz - T_WALL / 2, maxZ: cz + T_WALL / 2 });
      }
      // 왼쪽 벽 (수직, Z 방향)
      if (cell.walls.left) {
        const cx = wx;
        const cz = wz + CELL / 2;
        addWall(cx, cz, CELL, H_WALL, Math.PI / 2, true);
        wallBoxes.push({ minX: cx - T_WALL / 2, maxX: cx + T_WALL / 2, minZ: cz - CELL / 2, maxZ: cz + CELL / 2 });
      }
      // 마지막 행: 아래쪽 벽
      if (r === DIM2_MH - 1 && cell.walls.bottom) {
        const cx = wx + CELL / 2;
        const cz = wz + CELL;
        addWall(cx, cz, CELL, H_WALL, 0, false);
        wallBoxes.push({ minX: cx - CELL / 2, maxX: cx + CELL / 2, minZ: cz - T_WALL / 2, maxZ: cz + T_WALL / 2 });
      }
      // 마지막 열: 오른쪽 벽
      if (c === DIM2_MW - 1 && cell.walls.right) {
        const cx = wx + CELL;
        const cz = wz + CELL / 2;
        addWall(cx, cz, CELL, H_WALL, Math.PI / 2, false);
        wallBoxes.push({ minX: cx - T_WALL / 2, maxX: cx + T_WALL / 2, minZ: cz - CELL / 2, maxZ: cz + CELL / 2 });
      }
    }
  }

  // ── 비치볼 ───────────────────────────────────────────────────────────────
  const BALL_COLORS = [0xff3344, 0x2255ee, 0xffcc00, 0xff66bb, 0x33ee88, 0xff7700, 0x9933ff, 0x00ccff];
  const balls: BeachBallData[] = [];
  const makeBall = (bx: number, bz: number, radius: number, col: number) => {
    const ballGroup = new THREE.Group();
    ballGroup.add(new THREE.Mesh(
      new THREE.SphereGeometry(radius, 16, 12),
      new THREE.MeshLambertMaterial({ color: col })
    ));
    for (let si = 0; si < 3; si++) {
      const stripe = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 1.007, 0.018, 6, 24),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
      );
      stripe.rotation.x = (si * Math.PI / 3);
      ballGroup.add(stripe);
    }
    ballGroup.position.set(bx, radius, bz);
    scene.add(ballGroup);
    balls.push({ group: ballGroup, vel: new THREE.Vector3(), radius, collected: false });
  };
  for (let i = 0; i < 96; i++) {
    const cx = 1 + (i * 3) % (DIM2_MW - 1);
    const cz = 1 + (i * 5) % (DIM2_MH - 1);
    makeBall(cx * CELL + CELL / 2, cz * CELL + CELL / 2, 0.38 + (i % 3) * 0.06, BALL_COLORS[i % BALL_COLORS.length]);
  }

  // ── 꽃-눈 엔티티 ─────────────────────────────────────────────────────────
  const entityCells: [number, number][] = [[1,4],[3,1],[5,6],[7,3],[2,7]];
  const entityGroups: EntityDim2Data[] = [];

  for (const [er, ec] of entityCells) {
    if (er >= DIM2_MH || ec >= DIM2_MW) continue;
    const ex = ec * CELL + CELL / 2;
    const ez = er * CELL + CELL / 2;
    const { group, eyeMesh, legL, legR, flowerHead } = buildFlowerEntity();
    group.position.set(ex, 0, ez);
    group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(group);
    entityGroups.push({
      group, eyeMesh,
      pos: new THREE.Vector3(ex, 0, ez),
      vel: new THREE.Vector3(),
      phase: Math.random() * Math.PI * 2,
      legL, legR, flowerHead,
    });
  }

  return { scene, wallBoxes, entityGroups, balls };
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
  const [gazeProgress, setGazeProgress] = useState(0);
  const [inventory, setInventory] = useState(0);
  const [falling, setFalling] = useState(false);

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
  const inventoryRef    = useRef(0);
  const fallingRef      = useRef(false);
  const fallYRef        = useRef(0);
  const fallSpeedRef    = useRef(0);

  sensRef.current = BASE_SENS * pointerSensitivity;

  const resetToDim1 = useCallback(() => {
    dimRef.current = 1;
    setDimension(1);
    deadRef.current = false;
    setDead(false);
    gazeRef.current = { time:0, spriteIdx:-1 };
    setGazeProgress(0);
    fallingRef.current = false;
    fallYRef.current = 0;
    fallSpeedRef.current = 0;
    setFalling(false);
    inventoryRef.current = 0;
    setInventory(0);
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

    // ── 두 차원 씬 빌드 ─────────────────────────────────────────────────────
    const d1 = buildDim1(complexity, equippedFlashlight ?? null);
    dim1DataRef.current = d1;
    const d2 = buildDim2();
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

      if (moving && !fallingRef.current) bobRef.current += 8*dt;
      const bobY = moving ? Math.sin(bobRef.current)*0.028 : 0;
      camera.position.set(pos.x, P_HEIGHT + bobY - fallYRef.current, pos.z);

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
            pos.x = Math.floor(DIM2_MW / 2) * CELL + CELL / 2;
            pos.z = Math.floor(DIM2_MH / 2) * CELL + CELL / 2;
            yawRef.current = 0; pitchRef.current = 0;
            fallingRef.current = false; fallYRef.current = 0; fallSpeedRef.current = 0;
            activeSceneRef.current = d2.scene;
            wallBoxRef.current = d2.wallBoxes;
          }
        }
      }

      // ── 차원2 전용 로직 ────────────────────────────────────────────────────
      if (curDim === 2) {
        const mazeWd = DIM2_MW * CELL;
        const mazeHt = DIM2_MH * CELL;

        // ── 절벽 낙하 ──────────────────────────────────────────────────────
        const outOfBounds = pos.x < -0.4 || pos.x > mazeWd + 0.4 || pos.z < -0.4 || pos.z > mazeHt + 0.4;
        if (outOfBounds && !fallingRef.current && !deadRef.current) {
          fallingRef.current = true;
          setFalling(true);
        }
        if (fallingRef.current) {
          fallSpeedRef.current += 22 * dt;
          fallYRef.current += fallSpeedRef.current * dt;
          if (fallYRef.current > 14) {
            fallingRef.current = false;
            fallYRef.current = 0;
            fallSpeedRef.current = 0;
            setFalling(false);
            const rebuilt = buildDim2();
            dim2DataRef.current = rebuilt;
            activeSceneRef.current = rebuilt.scene;
            wallBoxRef.current = rebuilt.wallBoxes;
            pos.x = Math.floor(DIM2_MW / 2) * CELL + CELL / 2;
            pos.z = Math.floor(DIM2_MH / 2) * CELL + CELL / 2;
            return;
          }
        }

        if (!deadRef.current) {
          // ── 비치볼 물리 ─────────────────────────────────────────────────
          for (const ball of d2.balls) {
            if (ball.collected) continue;
            const bx = ball.group.position.x;
            const bz = ball.group.position.z;
            const pdx = pos.x - bx;
            const pdz = pos.z - bz;
            const pdist = Math.sqrt(pdx * pdx + pdz * pdz);

            // X키로 수집 (가까이 있을 때)
            if (xKey && pdist < ball.radius + 1.2) {
              ball.collected = true;
              d2.scene.remove(ball.group);
              inventoryRef.current++;
              setInventory(inventoryRef.current);
              continue;
            }

            // 플레이어가 공 밀기
            if (pdist < P_RADIUS + ball.radius + 0.1 && pdist > 0.001) {
              const pushStr = 4.5;
              ball.vel.x -= (pdx / pdist) * pushStr;
              ball.vel.z -= (pdz / pdist) * pushStr;
            }

            // 공 물리: 마찰 + 이동 + 벽 충돌
            const friction = Math.pow(BALL_FRICTION, dt * 60);
            ball.vel.multiplyScalar(friction);
            const nbx = bx + ball.vel.x * dt;
            const nbz = bz + ball.vel.z * dt;
            if (!hitsWall(d2.wallBoxes, nbx, bz)) {
              ball.group.position.x = nbx;
            } else {
              ball.vel.x *= -0.45;
            }
            if (!hitsWall(d2.wallBoxes, ball.group.position.x, nbz)) {
              ball.group.position.z = nbz;
            } else {
              ball.vel.z *= -0.45;
            }
            // 굴리기 시각 효과
            const spd2D = Math.sqrt(ball.vel.x ** 2 + ball.vel.z ** 2);
            if (spd2D > 0.01) {
              ball.group.rotation.z -= ball.vel.x * dt * (1 / ball.radius) * 0.5;
              ball.group.rotation.x += ball.vel.z * dt * (1 / ball.radius) * 0.5;
            }
          }

          // ── 꽃-눈 엔티티 이동 + 애니메이션 ─────────────────────────────
          const eyeMeshes: THREE.Mesh[] = [];
          for (const ent of d2.entityGroups) {
            ent.phase += dt;

            const dx = pos.x - ent.pos.x;
            const dz = pos.z - ent.pos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > 1.8 && dist < 30 && !fallingRef.current) {
              // 공이 진로를 막는지 확인
              let ballBlock = false;
              for (const ball of d2.balls) {
                if (ball.collected) continue;
                const ebx = ball.group.position.x - ent.pos.x;
                const ebz = ball.group.position.z - ent.pos.z;
                if (Math.sqrt(ebx * ebx + ebz * ebz) < ball.radius + 0.5) {
                  ballBlock = true; break;
                }
              }
              if (!ballBlock) {
                const spd = ENTITY_SPEED * dt;
                const nx = ent.pos.x + (dx / dist) * spd;
                const nz = ent.pos.z + (dz / dist) * spd;
                if (!hitsWall(d2.wallBoxes, nx, ent.pos.z)) ent.pos.x = nx;
                if (!hitsWall(d2.wallBoxes, ent.pos.x, nz)) ent.pos.z = nz;
                ent.group.rotation.y = Math.atan2(dx, dz);
              }
            }

            ent.group.position.set(ent.pos.x, Math.sin(ent.phase * 1.1) * 0.03, ent.pos.z);

            // 걷기 애니메이션
            const walkSpd = ent.phase * 3.5;
            ent.legL.rotation.x = Math.sin(walkSpd) * 0.38;
            ent.legR.rotation.x = -Math.sin(walkSpd) * 0.38;
            // 꽃 머리 흔들기
            ent.flowerHead.rotation.z = Math.sin(ent.phase * 0.7) * 0.07;
            ent.flowerHead.rotation.y += dt * 0.15;

            eyeMeshes.push(ent.eyeMesh);
          }

          // ── 눈 응시 감지 (raycaster) ──────────────────────────────────
          raycaster.setFromCamera(centerNDC, camera);
          const eyeHits = raycaster.intersectObjects(eyeMeshes, false);

          if (eyeHits.length > 0) {
            const hitIdx = eyeMeshes.indexOf(eyeHits[0].object as THREE.Mesh);
            if (hitIdx !== -1) {
              if (gazeRef.current.spriteIdx === hitIdx) {
                gazeRef.current.time += dt;
              } else {
                gazeRef.current = { time: dt, spriteIdx: hitIdx };
              }
              setGazeProgress(Math.min(gazeRef.current.time / GAZE_DEATH_TIME, 1));
              if (gazeRef.current.time >= GAZE_DEATH_TIME) {
                deadRef.current = true;
                setDead(true);
                gazeRef.current = { time: 0, spriteIdx: -1 };
                setGazeProgress(0);
                setTimeout(() => { resetToDim1(); }, 3000);
              }
            }
          } else {
            if (gazeRef.current.spriteIdx !== -1) {
              gazeRef.current = { time: 0, spriteIdx: -1 };
              setGazeProgress(0);
            }
          }
        }
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
            WASD 이동 · ESC 해제
            {dimension===1 ? " · F 손전등 · X 열쇠" : " · X 공 줍기 (가까이서)"}
          </div>
        </div>
      )}

      {/* 차원2 인벤토리 (비치볼 수집) */}
      {dimension===2 && locked && !dead && (
        <div className="absolute top-4 right-4 pointer-events-none z-20 flex items-center gap-1.5">
          <div className="px-3 py-1.5 rounded-xl text-xs tracking-wide flex items-center gap-2"
            style={{ background:"rgba(20,60,100,0.55)", color:"rgba(180,230,255,0.95)", border:"1px solid rgba(100,200,255,0.25)", backdropFilter:"blur(4px)" }}>
            <span style={{ fontSize:"14px" }}>🏐</span>
            <span className="font-bold">{inventory}</span>
            <span style={{ color:"rgba(140,200,255,0.6)" }}>/ ∞</span>
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

      {/* 절벽 낙하 오버레이 */}
      {falling && !dead && (
        <div className="absolute inset-0 z-40 pointer-events-none"
          style={{ background:"rgba(0,0,0,0.45)", backdropFilter:"blur(1px)" }}>
          <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 text-center">
            <p className="text-2xl font-bold tracking-widest animate-pulse" style={{ color:"rgba(255,255,255,0.85)", textShadow:"0 0 20px #fff" }}>
              ↓ 절벽에서 떨어지고 있습니다...
            </p>
          </div>
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
