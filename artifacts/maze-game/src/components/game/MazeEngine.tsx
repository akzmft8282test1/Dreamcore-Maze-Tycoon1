// 드림코어 미로 엔진 v3 — 3차원(학교), 포탈, 5가지 알고리즘, Q키 공 던지기, 사운드
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { FLASHLIGHT_PRESETS } from "./flashlight-presets";
import {
  playFootstep, playPortalEnter, playDimensionTransition,
  playKeyTurn, playDoorCreak, playBallCollect, playBallThrow,
  playEntityApproach, playGazeDeath, playFalling,
  setAmbient, setSoundEnabled, getSoundEnabled, resumeAudio,
} from "@/utils/SoundSystem";

// ─── Props ───────────────────────────────────────────────────────────────────
interface MazeEngineProps {
  is2DView?: boolean;
  serverId?: number | null;
  complexity?: number;
  equippedFlashlight?: string | null;
  pointerSensitivity?: number;
  initialPart?: number | null;
  initialDimension?: 1 | 2 | null;
  onDoorZoneChange?: (zone: number | null) => void;
  onRoomChange?: (room: number | null) => void;
  onPositionChange?: (pos: { x: number; y: number; z: number; mapId: string }) => void;
  onFlashlightChange?: (on: boolean) => void;
  onDimensionChange?: (dim: 1 | 2 | 3) => void;
}

// ─── 상수 ────────────────────────────────────────────────────────────────────
const CELL      = 4;
const H_WALL    = 2.8;
const T_WALL    = 0.18;
const P_HEIGHT  = 1.55;
const P_RADIUS  = 0.28;
const SPEED     = 5.5;
const BASE_SENS = 0.002;
const MAX_PITCH = Math.PI / 2 - 0.04;
const GAZE_DEATH_TIME = 2.25;
const DIM2_MW   = 12;
const DIM2_MH   = 12;
const DIM3_MW   = 10;
const DIM3_MH   = 10;
const BALL_FRICTION = 0.88;
const ENTITY_SPEED  = 0.9;
const ENTITY3_SPEED = 0.7;

// ─── 미로 셀 ─────────────────────────────────────────────────────────────────
interface MazeCell {
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  visited: boolean;
}

function makeEmptyGrid(w: number, h: number): MazeCell[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({
      walls: { top: true, right: true, bottom: true, left: true },
      visited: false,
    }))
  );
}

const OPP: Record<string, string> = { top: "bottom", bottom: "top", left: "right", right: "left" };
const DIRS4 = [[0,-1,"top"],[1,0,"right"],[0,1,"bottom"],[-1,0,"left"]] as [number,number,string][];

// ① Recursive Backtracking
function generateMaze(w: number, h: number): MazeCell[][] {
  const grid = makeEmptyGrid(w, h);
  const stack: [number,number][] = [];
  let [cx, cz] = [0, 0];
  grid[cz][cx].visited = true;
  stack.push([cx, cz]);
  while (stack.length > 0) {
    const nb = DIRS4
      .map(([dx,dz,d]) => [cx+dx, cz+dz, d] as [number,number,string])
      .filter(([nx,nz]) => nx>=0 && nx<w && nz>=0 && nz<h && !grid[nz as number][nx as number].visited);
    if (nb.length > 0) {
      const [nx,nz,d] = nb[Math.floor(Math.random()*nb.length)];
      grid[cz][cx].walls[d as keyof MazeCell["walls"]] = false;
      grid[nz][nx].walls[OPP[d] as keyof MazeCell["walls"]] = false;
      grid[nz][nx].visited = true;
      stack.push([cx, cz]);
      cx = nx; cz = nz;
    } else {
      [cx,cz] = stack.pop()!;
    }
  }
  return grid;
}

// ② Prim's Algorithm
function generateMazePrim(w: number, h: number): MazeCell[][] {
  const grid = makeEmptyGrid(w, h);
  interface FrontierItem { x: number; z: number; fromX: number; fromZ: number; dir: string; }
  const frontier: FrontierItem[] = [];
  grid[0][0].visited = true;
  DIRS4.forEach(([dx,dz,d]) => {
    const nx = dx, nz = dz;
    if (nx>=0&&nx<w&&nz>=0&&nz<h) frontier.push({x:nx,z:nz,fromX:0,fromZ:0,dir:d});
  });
  while (frontier.length > 0) {
    const idx = Math.floor(Math.random()*frontier.length);
    const {x,z,fromX,fromZ,dir} = frontier.splice(idx,1)[0];
    if (!grid[z][x].visited) {
      grid[z][x].visited = true;
      grid[fromZ][fromX].walls[dir as keyof MazeCell["walls"]] = false;
      grid[z][x].walls[OPP[dir] as keyof MazeCell["walls"]] = false;
      DIRS4.forEach(([dx,dz,d]) => {
        const nx=x+dx, nz=z+dz;
        if (nx>=0&&nx<w&&nz>=0&&nz<h&&!grid[nz][nx].visited)
          frontier.push({x:nx,z:nz,fromX:x,fromZ:z,dir:d});
      });
    }
  }
  return grid;
}

// ③ Kruskal's Algorithm
function generateMazeKruskal(w: number, h: number): MazeCell[][] {
  const grid = makeEmptyGrid(w, h);
  const parent = Array.from({length: w*h}, (_,i)=>i);
  const rank = new Array(w*h).fill(0);
  const find = (x: number): number => parent[x]===x?x:(parent[x]=find(parent[x]));
  const union = (a: number, b: number) => {
    a=find(a); b=find(b);
    if (a===b) return false;
    if (rank[a]<rank[b]) { const t=a; a=b; b=t; }
    parent[b]=a;
    if (rank[a]===rank[b]) rank[a]++;
    return true;
  };
  const edges: [number,number,number,number,string][] = [];
  for (let z=0;z<h;z++) for (let x=0;x<w;x++) {
    if (x+1<w) edges.push([x,z,x+1,z,"right"]);
    if (z+1<h) edges.push([x,z,x,z+1,"bottom"]);
  }
  for (let i=edges.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [edges[i],edges[j]]=[edges[j],edges[i]];
  }
  for (const [x1,z1,x2,z2,dir] of edges) {
    if (union(z1*w+x1, z2*w+x2)) {
      grid[z1][x1].walls[dir as keyof MazeCell["walls"]] = false;
      grid[z2][x2].walls[OPP[dir] as keyof MazeCell["walls"]] = false;
      grid[z1][x1].visited = true;
      grid[z2][x2].visited = true;
    }
  }
  return grid;
}

// ④ Hunt-and-Kill
function generateMazeHuntKill(w: number, h: number): MazeCell[][] {
  const grid = makeEmptyGrid(w, h);
  let cx=0, cz=0;
  grid[cz][cx].visited = true;
  let hunting = false;
  outer: while (true) {
    if (!hunting) {
      const nb = DIRS4
        .map(([dx,dz,d])=>[cx+dx,cz+dz,d] as [number,number,string])
        .filter(([nx,nz])=>nx>=0&&nx<w&&nz>=0&&nz<h&&!grid[nz as number][nx as number].visited);
      if (nb.length > 0) {
        const [nx,nz,d] = nb[Math.floor(Math.random()*nb.length)];
        grid[cz][cx].walls[d as keyof MazeCell["walls"]] = false;
        grid[nz][nx].walls[OPP[d] as keyof MazeCell["walls"]] = false;
        grid[nz][nx].visited = true;
        cx=nx; cz=nz;
      } else {
        hunting = true;
      }
    }
    if (hunting) {
      for (let hz=0; hz<h; hz++) {
        for (let hx=0; hx<w; hx++) {
          if (!grid[hz][hx].visited) {
            const vn = DIRS4
              .map(([dx,dz,d])=>[hx+dx,hz+dz,d] as [number,number,string])
              .filter(([nx,nz])=>nx>=0&&nx<w&&nz>=0&&nz<h&&grid[nz as number][nx as number].visited);
            if (vn.length > 0) {
              const [nx,nz,d] = vn[Math.floor(Math.random()*vn.length)];
              grid[hz][hx].walls[OPP[d] as keyof MazeCell["walls"]] = false;
              grid[nz][nx].walls[d as keyof MazeCell["walls"]] = false;
              grid[hz][hx].visited = true;
              cx=hx; cz=hz; hunting=false;
              continue outer;
            }
          }
        }
      }
      break;
    }
  }
  return grid;
}

// ⑤ Sidewinder
function generateMazeSidewinder(w: number, h: number): MazeCell[][] {
  const grid = makeEmptyGrid(w, h);
  for (let z=0; z<h; z++) {
    let runStart = 0;
    for (let x=0; x<w; x++) {
      grid[z][x].visited = true;
      const atE = x+1>=w, atN = z===0;
      const close = atE || (!atN && Math.random()<0.5);
      if (close) {
        if (!atN) {
          const m = runStart + Math.floor(Math.random()*(x-runStart+1));
          grid[z][m].walls.top = false;
          grid[z-1][m].walls.bottom = false;
        }
        runStart = x+1;
      } else {
        grid[z][x].walls.right = false;
        grid[z][x+1].walls.left = false;
      }
    }
  }
  return grid;
}

// 랜덤 알고리즘 선택 (들어갈 때마다)
function generateMazeRandom(w: number, h: number): MazeCell[][] {
  const fns = [generateMaze, generateMazePrim, generateMazeKruskal, generateMazeHuntKill, generateMazeSidewinder];
  return fns[Math.floor(Math.random()*fns.length)](w, h);
}

// ─── 벽 충돌 박스 ─────────────────────────────────────────────────────────────
interface WallBox { minX: number; maxX: number; minZ: number; maxZ: number; }

function buildWallBoxes(maze: MazeCell[][], mw: number, mh: number): WallBox[] {
  const boxes: WallBox[] = [];
  const t = T_WALL / 2;
  for (let z=0;z<mh;z++) for (let x=0;x<mw;x++) {
    const cell=maze[z][x]; const wx=x*CELL, wz=z*CELL;
    if (cell.walls.top)    boxes.push({minX:wx-t,maxX:wx+CELL+t,minZ:wz-t,      maxZ:wz+t});
    if (cell.walls.left)   boxes.push({minX:wx-t,maxX:wx+t,      minZ:wz-t,      maxZ:wz+CELL+t});
    if (z===mh-1&&cell.walls.bottom) boxes.push({minX:wx-t,maxX:wx+CELL+t,minZ:wz+CELL-t,maxZ:wz+CELL+t});
    if (x===mw-1&&cell.walls.right)  boxes.push({minX:wx+CELL-t,maxX:wx+CELL+t,minZ:wz-t,      maxZ:wz+CELL+t});
  }
  return boxes;
}

function hitsWall(boxes: WallBox[], px: number, pz: number): boolean {
  const r = P_RADIUS;
  for (const b of boxes)
    if (px+r>b.minX && px-r<b.maxX && pz+r>b.minZ && pz-r<b.maxZ) return true;
  return false;
}

// ─── 텍스처 ───────────────────────────────────────────────────────────────────
function makeDataTex(fn: (x: number, y: number, s: number) => [number,number,number], size=128): THREE.DataTexture {
  const data = new Uint8Array(size*size*4);
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const i=(y*size+x)*4;
    const [r,g,b]=fn(x,y,size);
    data[i]=r; data[i+1]=g; data[i+2]=b; data[i+3]=255;
  }
  const tex = new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.needsUpdate=true;
  return tex;
}

function makeWallTex(): THREE.DataTexture {
  return makeDataTex((x,y,s) => {
    const stripe=Math.floor(y/(s/8))%2===0;
    const n=((Math.sin(x*0.4+y*0.3)*0.5+0.5)*18)|0;
    return stripe?[180+n,168+n,100+n]:[165+n,155+n,88+n];
  });
}

function makeCheckerTex(dark: number, light: number): THREE.DataTexture {
  const dc=[(dark>>16)&0xff,(dark>>8)&0xff,dark&0xff];
  const lc=[(light>>16)&0xff,(light>>8)&0xff,light&0xff];
  return makeDataTex((x,y,s) => {
    const c=(Math.floor(x/(s/8))+Math.floor(y/(s/8)))%2===0?dc:lc;
    return [c[0],c[1],c[2]];
  });
}

// 거칠거칠한 잔디 텍스처 (더 복잡한 패턴)
function makeRoughGrassTex(): THREE.DataTexture {
  const SIZE = 256;
  const data = new Uint8Array(SIZE*SIZE*4);
  for (let y=0;y<SIZE;y++) for (let x=0;x<SIZE;x++) {
    const i=(y*SIZE+x)*4;
    const nx=x/SIZE, ny=y/SIZE;
    // 다층 노이즈
    const n1 = Math.sin(nx*18.3+ny*7.1)*Math.cos(ny*13.7+nx*5.9);
    const n2 = Math.sin(nx*31.1+ny*22.4)*0.5;
    const n3 = Math.cos(nx*9.7+ny*41.3)*0.3;
    const nval = (n1+n2+n3)*0.5+0.5;
    // 잔디 줄기 패턴
    const blade = Math.abs(Math.sin(nx*64)*Math.sin(ny*64+nx*8));
    const patch = Math.floor(nx*12)*Math.floor(ny*12)%3;
    const base = patch===0?52:patch===1?60:44;
    const r = Math.round(base*0.35 + nval*12 + blade*6);
    const g = Math.round(base + nval*28 + blade*14);
    const b = Math.round(base*0.3 + nval*8);
    data[i]=Math.min(255,r);
    data[i+1]=Math.min(255,g);
    data[i+2]=Math.min(255,b);
    data[i+3]=255;
  }
  const tex = new THREE.DataTexture(data,SIZE,SIZE,THREE.RGBAFormat);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.needsUpdate=true;
  return tex;
}

function makeCloudSkyTex(): THREE.DataTexture {
  const SIZE=256;
  const data=new Uint8Array(SIZE*SIZE*4);
  for (let y=0;y<SIZE;y++) {
    for (let x=0;x<SIZE;x++) {
      const i=(y*SIZE+x)*4;
      const ty=y/SIZE;
      const r=Math.round(100+ty*55),g=Math.round(170+ty*50),b=255;
      const cx=x/SIZE,cy=y/SIZE;
      const c1=Math.max(0,1-Math.sqrt(Math.pow((cx-0.18)*2.8,2)+Math.pow((cy-0.25)*5.5,2)));
      const c2=Math.max(0,1-Math.sqrt(Math.pow((cx-0.55)*3.2,2)+Math.pow((cy-0.18)*6.0,2)));
      const c3=Math.max(0,1-Math.sqrt(Math.pow((cx-0.78)*2.5,2)+Math.pow((cy-0.62)*5.8,2)));
      const c4=Math.max(0,1-Math.sqrt(Math.pow((cx-0.35)*2.2,2)+Math.pow((cy-0.72)*6.5,2)));
      const cloud=Math.min(1,(c1+c2+c3+c4)*1.1);
      data[i]=Math.min(255,Math.round(r+cloud*(255-r)));
      data[i+1]=Math.min(255,Math.round(g+cloud*(255-g)));
      data[i+2]=Math.min(255,Math.round(b+cloud*(255-b)));
      data[i+3]=255;
    }
  }
  const tex=new THREE.DataTexture(data,SIZE,SIZE,THREE.RGBAFormat);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.needsUpdate=true;
  return tex;
}

function makeWallSkyTex(): THREE.DataTexture {
  return makeDataTex((x,y,s)=>{
    const ty=y/s,rx=x/s;
    const sky=0.62+Math.sin(rx*12+ty*3)*0.05;
    const cloud=Math.max(0,1-Math.abs(rx-0.45)*4.2)*Math.max(0,1-Math.abs(ty-0.35)*5.5);
    const cloud2=Math.max(0,1-Math.abs(rx-0.7)*5.1)*Math.max(0,1-Math.abs(ty-0.62)*4.8);
    const mix=Math.min(1,cloud+cloud2*0.8);
    return [Math.round(110+sky*50+mix*90),Math.round(170+sky*35+mix*55),255];
  });
}

function makeCeilingTex(): THREE.DataTexture {
  return makeDataTex((x,y,s)=>{
    const nx=x/s,ny=y/s;
    const seam=Math.max(0,1-Math.abs(ny-0.5)*8);
    const panel=((Math.floor(nx*8)+Math.floor(ny*4))%2===0)?1:0;
    const base=panel?18:12;
    const glow=seam*12;
    return [base+glow,base+glow,base+glow+4];
  });
}

function makeWallFrameTex(): THREE.DataTexture {
  return makeDataTex((x,y,s)=>{
    const nx=x/s,ny=y/s;
    const seam=Math.max(0,1-Math.abs(nx-0.5)*6);
    const tint=30+Math.round(seam*8+(1-ny)*4);
    return [tint,tint+1,tint+6];
  });
}

// 학교 타일 바닥 텍스처
function makeSchoolTileTex(): THREE.DataTexture {
  return makeDataTex((x,y,s)=>{
    const gx=Math.floor(x/(s/8)), gy=Math.floor(y/(s/8));
    const isGap = (x%(s/8)<2 || y%(s/8)<2);
    if (isGap) return [180,185,180];
    const tile=(gx+gy)%2===0;
    const n=((Math.sin(x*0.6+y*0.7)*0.5+0.5)*12)|0;
    return tile?[210+n,215+n,200+n]:[185+n,200+n,185+n];
  });
}

// 학교 벽 텍스처 (흰색 + 로커 느낌)
function makeSchoolWallTex(): THREE.DataTexture {
  return makeDataTex((x,y,s)=>{
    const nx=x/s,ny=y/s;
    const locker=Math.floor(nx*6);
    const gap=Math.abs((nx*6)-locker-0.5)>0.44;
    const hline=(ny>0.58&&ny<0.62);
    if (gap||hline) return [160,162,165];
    const upper=ny<0.6;
    const base=upper?238:220;
    const n=((Math.sin(x*1.1+y*0.9)*0.5+0.5)*8)|0;
    return upper?[base+n,base+n,base+n-5]:[base-10+n,base-8+n,base-15+n];
  });
}

// 엔티티 스프라이트 텍스처 로더
function makeEntitySpriteTexture(): THREE.Texture {
  const tex=new THREE.TextureLoader().load("/entity-flower.png");
  tex.colorSpace=THREE.SRGBColorSpace; tex.needsUpdate=true;
  return tex;
}

// ─── 차원1 씬 데이터 타입 ────────────────────────────────────────────────────
interface EntityData {
  group: THREE.Group;
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  phase: number;
  type: string;
}

interface Dim1Data {
  scene: THREE.Scene;
  wallBoxes: WallBox[];
  doorGroup: THREE.Group | null;
  doorWorldPos: THREE.Vector3 | null;
  doorNormal: THREE.Vector3 | null;
  doorZone?: number | null;
  entities: EntityData[];
  pointLights: THREE.PointLight[];
}

// ─── 차원1 씬 빌드 ────────────────────────────────────────────────────────────
function buildDim1(complexity: number, equippedFlashlight: string | null): Dim1Data & { flashlight: THREE.SpotLight; ambientLight: THREE.AmbientLight } {
  const mw=8+complexity*2, mh=8+complexity*2;
  const maze=generateMaze(mw, mh);
  const wallBoxes=buildWallBoxes(maze, mw, mh);
  const TW=mw*CELL, TH=mh*CELL;

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xc8b87a);
  scene.fog=new THREE.FogExp2(0xc0aa62, 0.052);

  const floorTex=makeCheckerTex(0x8b7355,0x9e8462); floorTex.repeat.set(TW/2,TH/2);
  const ceilTex=makeCheckerTex(0xb0a070,0xbfaa7a); ceilTex.repeat.set(TW/1.5,TH/1.5);
  const wallTex=makeWallTex(); wallTex.repeat.set(1.5,0.8);

  const floor=new THREE.Mesh(new THREE.PlaneGeometry(TW+4,TH+4),new THREE.MeshLambertMaterial({map:floorTex}));
  floor.rotation.x=-Math.PI/2; floor.position.set(TW/2,0,TH/2); scene.add(floor);
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(TW+4,TH+4),new THREE.MeshLambertMaterial({map:ceilTex}));
  ceil.rotation.x=Math.PI/2; ceil.position.set(TW/2,H_WALL,TH/2); scene.add(ceil);

  const wallMat=new THREE.MeshLambertMaterial({map:wallTex});
  const wallGeoH=new THREE.BoxGeometry(CELL+T_WALL,H_WALL,T_WALL);
  const wallGeoV=new THREE.BoxGeometry(T_WALL,H_WALL,CELL+T_WALL);
  const mH: THREE.Matrix4[]=[],mV: THREE.Matrix4[]=[];
  const m4=new THREE.Matrix4();
  for (let z=0;z<mh;z++) for (let x=0;x<mw;x++) {
    const cell=maze[z][x]; const wx=x*CELL,wz=z*CELL;
    if (cell.walls.top)   mH.push(m4.clone().makeTranslation(wx+CELL/2,H_WALL/2,wz));
    if (cell.walls.left)  mV.push(m4.clone().makeTranslation(wx,H_WALL/2,wz+CELL/2));
    if (z===mh-1&&cell.walls.bottom) mH.push(m4.clone().makeTranslation(wx+CELL/2,H_WALL/2,wz+CELL));
    if (x===mw-1&&cell.walls.right)  mV.push(m4.clone().makeTranslation(wx+CELL,H_WALL/2,wz+CELL/2));
  }
  if (mH.length>0){const im=new THREE.InstancedMesh(wallGeoH,wallMat,mH.length);mH.forEach((m,i)=>im.setMatrixAt(i,m));im.instanceMatrix.needsUpdate=true;scene.add(im);}
  if (mV.length>0){const im=new THREE.InstancedMesh(wallGeoV,wallMat,mV.length);mV.forEach((m,i)=>im.setMatrixAt(i,m));im.instanceMatrix.needsUpdate=true;scene.add(im);}

  const ambientLight=new THREE.AmbientLight(0xd4c47a,0.44);
  scene.add(ambientLight);
  const pointLights: THREE.PointLight[]=[];
  for (let z=0;z<mh;z+=2) for (let x=0;x<mw;x+=2) {
    const pl=new THREE.PointLight(0xf5e8a0,1.0+Math.random()*0.9,CELL*4,1.8);
    pl.position.set(x*CELL+CELL/2,H_WALL-0.1,z*CELL+CELL/2);
    pl.userData.baseIntensity=pl.intensity;
    pl.userData.phase=Math.random()*Math.PI*2;
    pointLights.push(pl);
    scene.add(pl);
  }

  const preset=FLASHLIGHT_PRESETS[equippedFlashlight??"default"]??FLASHLIGHT_PRESETS.default;
  const flashlight=new THREE.SpotLight(preset.color,preset.intensity,preset.distance,preset.angle,preset.penumbra,1.2);
  flashlight.userData.baseIntensity=preset.intensity;
  scene.add(flashlight); scene.add(flashlight.target);

  // ── 분홍 출구 문 ────────────────────────────────────────────────────────────
  let doorGroup: THREE.Group|null=null;
  let doorWorldPos: THREE.Vector3|null=null;
  let doorNormal: THREE.Vector3|null=null;
  let doorZone: number|null=null;

  const candidates:{wallX:number;wallZ:number;dir:'h'|'v'}[]=[];
  for (let z=1;z<mh-1;z++) for (let x=1;x<mw-2;x++) {
    if (maze[z][x].walls.top)   candidates.push({wallX:x,wallZ:z,dir:'h'});
    if (maze[z][x].walls.right) candidates.push({wallX:x,wallZ:z,dir:'v'});
  }
  if (candidates.length>0) {
    const pick=candidates[Math.floor(Math.random()*candidates.length)];
    const wx=pick.dir==='h'?pick.wallX*CELL+CELL/2:(pick.wallX+1)*CELL;
    const wz=pick.dir==='h'?pick.wallZ*CELL:pick.wallZ*CELL+CELL/2;
    doorZone=pick.wallZ*mw+pick.wallX+1;

    const DW=1.2,DH=2.4,DTH=0.10,FRAME=0.13;
    const frameMat=new THREE.MeshLambertMaterial({color:0xff8fb0,emissive:0x220010,emissiveIntensity:0.2});
    const bodyMat=new THREE.MeshLambertMaterial({color:0xff4d9e,emissive:0x2a0018,emissiveIntensity:0.18});
    const trimMat=new THREE.MeshLambertMaterial({color:0xffbcd6});
    const goldMat=new THREE.MeshLambertMaterial({color:0xffd700,emissive:0x996600,emissiveIntensity:0.4});

    doorGroup=new THREE.Group();
    doorWorldPos=new THREE.Vector3(wx,0,wz);
    doorNormal=pick.dir==='h'?new THREE.Vector3(0,0,-1):new THREE.Vector3(1,0,0);

    const wallAnchor=new THREE.Group();
    wallAnchor.position.set(wx,0,wz);
    if (pick.dir==='v') wallAnchor.rotation.y=Math.PI/2;
    doorGroup.add(wallAnchor);

    const ED=0.0;
    [[-(DW/2+FRAME/2),DH/2,ED,FRAME,DH+FRAME,T_WALL+0.04],
     [DW/2+FRAME/2,DH/2,ED,FRAME,DH+FRAME,T_WALL+0.04],
     [0,DH+FRAME/2,ED,DW+FRAME*2,FRAME,T_WALL+0.04]
    ].forEach(([px,py,pz,gx,gy,gz])=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(gx,gy,gz),frameMat);
      m.position.set(px,py,pz); wallAnchor.add(m);
    });

    const doorHinge=new THREE.Group();
    doorHinge.position.set(-DW/2,0,ED+DTH/2+0.01);
    wallAnchor.add(doorHinge);
    const doorBody=new THREE.Mesh(new THREE.BoxGeometry(DW,DH,DTH),bodyMat);
    doorBody.position.set(DW/2,DH/2,0); doorHinge.add(doorBody);
    const molA=new THREE.Mesh(new THREE.BoxGeometry(DW*0.7,DH*0.35,0.025),trimMat);
    molA.position.set(0,DH*0.25,DTH/2+0.013); doorBody.add(molA);
    const molB=new THREE.Mesh(new THREE.BoxGeometry(DW*0.7,DH*0.28,0.025),trimMat);
    molB.position.set(0,-DH*0.22,DTH/2+0.013); doorBody.add(molB);
    const knob=new THREE.Mesh(new THREE.SphereGeometry(0.065,10,8),goldMat);
    knob.position.set(DW*0.38,-DH*0.04,DTH/2+0.07); doorBody.add(knob);
    const keyShaft=new THREE.Mesh(new THREE.CylinderGeometry(0.013,0.013,0.26,8),goldMat);
    keyShaft.rotation.z=Math.PI/2; keyShaft.position.set(DW*0.38,DH*0.06,DTH/2+0.07); doorBody.add(keyShaft);
    const keyBow=new THREE.Mesh(new THREE.TorusGeometry(0.065,0.016,8,14),goldMat);
    keyBow.position.set(DW*0.38-0.17,DH*0.06,DTH/2+0.07); doorBody.add(keyBow);
    const doorGlow=new THREE.PointLight(0xff69b4,2.0,9,1.3);
    doorGlow.position.set(0,DH*0.5,1.2); wallAnchor.add(doorGlow);

    (doorGroup as any)._panel=doorHinge;
    (doorGroup as any)._angle=0;
    (doorGroup as any)._keyAngle=0;
    (doorGroup as any)._key=keyShaft;
    scene.add(doorGroup);
  }

  // ── 차원1 엔티티 2종 ────────────────────────────────────────────────────────
  const entities: EntityData[]=[];
  const entityTex=makeEntitySpriteTexture();

  // 엔티티1: 그림자 인간 (어두운 형체)
  for (let i=0;i<2;i++) {
    const ex=(3+i*6)*CELL+CELL/2, ez=(4+i*4)*CELL+CELL/2;
    const group=new THREE.Group();
    const spriteMat=new THREE.SpriteMaterial({
      map:entityTex, transparent:true, depthWrite:false,
      color:new THREE.Color(0.05,0.0,0.08), opacity:0.78
    });
    const sprite=new THREE.Sprite(spriteMat);
    sprite.scale.set(2.0,2.8,1);
    sprite.position.set(0,1.2,0);
    group.add(sprite);

    // 붉은 눈 발광
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.08,6,4),new THREE.MeshBasicMaterial({color:0xff1111}));
    eye.position.set(0.18,2.05,0.05); group.add(eye);
    const eye2=new THREE.Mesh(new THREE.SphereGeometry(0.08,6,4),new THREE.MeshBasicMaterial({color:0xff1111}));
    eye2.position.set(-0.18,2.05,0.05); group.add(eye2);

    group.position.set(ex,0,ez);
    scene.add(group);
    entities.push({group,mesh:sprite,pos:new THREE.Vector3(ex,0,ez),vel:new THREE.Vector3(),phase:Math.random()*Math.PI*2,type:'shadow'});
  }

  // 엔티티2: 안개 구체 (발광 오브)
  for (let i=0;i<2;i++) {
    const ex=(6+i*5)*CELL+CELL/2, ez=(2+i*6)*CELL+CELL/2;
    const group=new THREE.Group();
    const orbMat=new THREE.MeshBasicMaterial({color:0xaaffee,transparent:true,opacity:0.75});
    const orb=new THREE.Mesh(new THREE.SphereGeometry(0.42,12,8),orbMat);
    group.add(orb);
    const innerMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.55});
    const inner=new THREE.Mesh(new THREE.SphereGeometry(0.22,8,6),innerMat);
    group.add(inner);
    const gl=new THREE.PointLight(0x88ffdd,1.2,6,1.5);
    group.add(gl);
    group.position.set(ex,1.4,ez);
    scene.add(group);
    entities.push({group,mesh:orb,pos:new THREE.Vector3(ex,1.4,ez),vel:new THREE.Vector3(),phase:Math.random()*Math.PI*2,type:'orb'});
  }

  return {scene,wallBoxes,doorGroup,doorWorldPos,doorNormal,flashlight,ambientLight,doorZone,entities,pointLights};
}

// ─── 차원2·3 공통 타입 ────────────────────────────────────────────────────────
interface BeachBallData {
  group: THREE.Group;
  vel: THREE.Vector3;
  radius: number;
  collected: boolean;
}

interface EntityDim2Data {
  group: THREE.Group;
  sprite: THREE.Sprite;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  phase: number;
}

interface PortalData {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  phase: number;
}

interface Dim2Data {
  scene: THREE.Scene;
  wallBoxes: WallBox[];
  entityGroups: EntityDim2Data[];
  balls: BeachBallData[];
  portals: PortalData[];
  algoName: string;
}

// ─── 차원2 씬 빌드 (백룸 드림코어 — 밝은 잔디) ───────────────────────────────
const BALL_COLORS=[0xff3344,0x2255ee,0xffcc00,0xff66bb,0x33ee88,0xff7700,0x9933ff,0x00ccff];

const ALGO_NAMES=["재귀 역추적","프림","크루스칼","사냥-죽이기","사이드와인더"];

function buildDim2(): Dim2Data {
  const algoIdx=Math.floor(Math.random()*5);
  const algoName=ALGO_NAMES[algoIdx];
  const mazeAlgos=[generateMaze,generateMazePrim,generateMazeKruskal,generateMazeHuntKill,generateMazeSidewinder];
  const maze=mazeAlgos[algoIdx](DIM2_MW,DIM2_MH);
  const mazeW=DIM2_MW*CELL, mazeH=DIM2_MH*CELL;

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x8ab87a); // 밝은 자연광
  scene.fog=new THREE.FogExp2(0x90c070,0.045); // 밝은 안개

  // 밝은 조명
  scene.add(new THREE.AmbientLight(0xd0f0c0,1.1)); // 훨씬 밝게
  const sun=new THREE.DirectionalLight(0xfff8e0,0.9);
  sun.position.set(mazeW/2,12,mazeH/2); scene.add(sun);

  // 거칠거칠한 잔디 바닥
  const grassTex=makeRoughGrassTex();
  grassTex.repeat.set(DIM2_MW*3,DIM2_MH*3);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(mazeW+0.5,mazeH+0.5),new THREE.MeshLambertMaterial({map:grassTex}));
  floor.rotation.x=-Math.PI/2; floor.position.set(mazeW/2,0,mazeH/2); scene.add(floor);

  // void 바닥
  const voidFloor=new THREE.Mesh(new THREE.PlaneGeometry(600,600),new THREE.MeshLambertMaterial({color:0x080810}));
  voidFloor.rotation.x=-Math.PI/2; voidFloor.position.set(mazeW/2,-18,mazeH/2); scene.add(voidFloor);

  const edgeMat=new THREE.MeshLambertMaterial({color:0x182410});
  const edgeW=4;
  for (const [ex,ew,ez,eeh] of [
    [mazeW/2,mazeW+edgeW*2,-edgeW/2,edgeW],
    [mazeW/2,mazeW+edgeW*2,mazeH+edgeW/2,edgeW],
    [-edgeW/2,edgeW,mazeH/2,mazeH],
    [mazeW+edgeW/2,edgeW,mazeH/2,mazeH],
  ] as [number,number,number,number][]) {
    const ep=new THREE.Mesh(new THREE.PlaneGeometry(ew,eeh),edgeMat);
    ep.rotation.x=-Math.PI/2; ep.position.set(ex,-0.01,ez); scene.add(ep);
  }

  // 벽 재료
  const skyTex=makeWallSkyTex();
  const ceilTex=makeCeilingTex();
  const skyMat=new THREE.MeshBasicMaterial({map:skyTex,side:THREE.BackSide});
  const glassMat=new THREE.MeshBasicMaterial({map:skyTex,side:THREE.BackSide,transparent:true,opacity:0.95});
  const outLineMat=new THREE.LineBasicMaterial({color:0xff99cc,transparent:true,opacity:0.22});

  const wallBoxes: WallBox[]=[];

  function addWall(cx: number,cz: number,width: number,height: number,rotY: number,glassOnPlus: boolean) {
    const planeGeo=new THREE.PlaneGeometry(width,height);
    const glassRotY=rotY+(glassOnPlus?0:Math.PI);
    const skyRotY=rotY+(glassOnPlus?Math.PI:0);
    const glassPlane=new THREE.Mesh(planeGeo,glassMat);
    glassPlane.rotation.y=glassRotY; glassPlane.position.set(cx,height/2,cz); scene.add(glassPlane);
    const edgesGeo=new THREE.EdgesGeometry(planeGeo);
    const outline=new THREE.LineSegments(edgesGeo,outLineMat);
    outline.rotation.y=glassRotY; outline.position.set(cx,height/2+0.002,cz); scene.add(outline);
    const skyPlane=new THREE.Mesh(planeGeo,skyMat);
    skyPlane.rotation.y=skyRotY; skyPlane.position.set(cx,height/2,cz); scene.add(skyPlane);
  }

  const ceiling=new THREE.Mesh(new THREE.PlaneGeometry(mazeW+1,mazeH+1),new THREE.MeshLambertMaterial({map:ceilTex,color:0x20303a}));
  ceiling.rotation.x=Math.PI/2; ceiling.position.set(mazeW/2,H_WALL,mazeH/2); scene.add(ceiling);

  for (let r=0;r<DIM2_MH;r++) {
    for (let c=0;c<DIM2_MW;c++) {
      const cell=maze[r][c]; const wx=c*CELL,wz=r*CELL;
      if (cell.walls.top) {
        const cx2=wx+CELL/2,cz2=wz;
        addWall(cx2,cz2,CELL,H_WALL,0,true);
        wallBoxes.push({minX:cx2-CELL/2,maxX:cx2+CELL/2,minZ:cz2-T_WALL/2,maxZ:cz2+T_WALL/2});
      }
      if (cell.walls.left) {
        const cx2=wx,cz2=wz+CELL/2;
        addWall(cx2,cz2,CELL,H_WALL,Math.PI/2,true);
        wallBoxes.push({minX:cx2-T_WALL/2,maxX:cx2+T_WALL/2,minZ:cz2-CELL/2,maxZ:cz2+CELL/2});
      }
      if (r===DIM2_MH-1&&cell.walls.bottom) {
        const cx2=wx+CELL/2,cz2=wz+CELL;
        addWall(cx2,cz2,CELL,H_WALL,0,false);
        wallBoxes.push({minX:cx2-CELL/2,maxX:cx2+CELL/2,minZ:cz2-T_WALL/2,maxZ:cz2+T_WALL/2});
      }
      if (c===DIM2_MW-1&&cell.walls.right) {
        const cx2=wx+CELL,cz2=wz+CELL/2;
        addWall(cx2,cz2,CELL,H_WALL,Math.PI/2,false);
        wallBoxes.push({minX:cx2-T_WALL/2,maxX:cx2+T_WALL/2,minZ:cz2-CELL/2,maxZ:cz2+CELL/2});
      }
    }
  }

  // ── 포탈 (3차원으로 이동) ───────────────────────────────────────────────────
  const portals: PortalData[]=[];
  const portalCandidates=wallBoxes.filter((_,i)=>i%8===2).slice(0,6);
  const portalMat=new THREE.MeshBasicMaterial({color:0x00ffcc,transparent:true,opacity:0.72,side:THREE.DoubleSide});
  const portalFrameMat=new THREE.MeshBasicMaterial({color:0x00ffaa,wireframe:true});
  for (const wb of portalCandidates) {
    const px=(wb.minX+wb.maxX)/2;
    const pz=(wb.minZ+wb.maxZ)/2;
    const isH=wb.maxX-wb.minX>T_WALL*3;
    const portalGeo=new THREE.PlaneGeometry(1.1,2.2);
    const portalMesh=new THREE.Mesh(portalGeo,portalMat);
    portalMesh.position.set(px,1.1,pz);
    if (!isH) portalMesh.rotation.y=Math.PI/2;
    scene.add(portalMesh);
    const frame=new THREE.Mesh(new THREE.BoxGeometry(isH?1.2:0.1,2.3,isH?0.1:1.2),portalFrameMat);
    frame.position.set(px,1.1,pz); scene.add(frame);
    const glow=new THREE.PointLight(0x00ffcc,1.5,4,1.5);
    glow.position.set(px,1.5,pz); scene.add(glow);
    portals.push({mesh:portalMesh,pos:new THREE.Vector3(px,0,pz),phase:Math.random()*Math.PI*2});
  }

  // ── 비치볼 ──────────────────────────────────────────────────────────────────
  const balls: BeachBallData[]=[];
  for (let i=0;i<240;i++) {
    const cx2=1+(i*3)%(DIM2_MW-1), cz2=1+(i*5)%(DIM2_MH-1);
    const bx=cx2*CELL+CELL/2, bz=cz2*CELL+CELL/2;
    const radius=0.38+(i%3)*0.06;
    const col=BALL_COLORS[i%BALL_COLORS.length];
    const ballGroup=new THREE.Group();
    ballGroup.add(new THREE.Mesh(new THREE.SphereGeometry(radius,16,12),new THREE.MeshLambertMaterial({color:col})));
    for (let si=0;si<3;si++) {
      const stripe=new THREE.Mesh(new THREE.TorusGeometry(radius*1.007,0.018,6,24),new THREE.MeshLambertMaterial({color:0xffffff}));
      stripe.rotation.x=si*Math.PI/3; ballGroup.add(stripe);
    }
    ballGroup.position.set(bx,radius,bz); scene.add(ballGroup);
    balls.push({group:ballGroup,vel:new THREE.Vector3(),radius,collected:false});
  }

  // ── 꽃-눈 엔티티 ─────────────────────────────────────────────────────────────
  const entityCells: [number,number][]= [[1,4],[3,1],[5,6],[7,3],[2,7]];
  const entityGroups: EntityDim2Data[]=[];
  const entityTex=makeEntitySpriteTexture();
  for (const [er,ec] of entityCells) {
    if (er>=DIM2_MH||ec>=DIM2_MW) continue;
    const ex=ec*CELL+CELL/2, ez=er*CELL+CELL/2;
    const group=new THREE.Group();
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:entityTex,transparent:true,depthWrite:false}));
    sprite.scale.set(2.3,3.0,1);
    sprite.position.set(0,1.2,0);
    group.add(sprite);
    group.position.set(ex,0,ez);
    group.rotation.y=Math.random()*Math.PI*2;
    scene.add(group);
    entityGroups.push({group,sprite,pos:new THREE.Vector3(ex,0,ez),vel:new THREE.Vector3(),phase:Math.random()*Math.PI*2});
  }

  return {scene,wallBoxes,entityGroups,balls,portals,algoName};
}

// ─── 차원3 씬 데이터 타입 ─────────────────────────────────────────────────────
interface EntityDim3Data {
  group: THREE.Group;
  sprite: THREE.Sprite;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  phase: number;
  type: 'ghost'|'janitor';
}

interface Dim3Data {
  scene: THREE.Scene;
  wallBoxes: WallBox[];
  entityGroups: EntityDim3Data[];
}

// ─── 차원3 씬 빌드 (학교) ────────────────────────────────────────────────────
function buildDim3(): Dim3Data {
  const maze=generateMazeRandom(DIM3_MW,DIM3_MH);
  const wallBoxes=buildWallBoxes(maze,DIM3_MW,DIM3_MH);
  const mazeW=DIM3_MW*CELL, mazeH=DIM3_MH*CELL;

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xd0d8dc);
  scene.fog=new THREE.Fog(0xd0d8dc,12,55);

  // 밝은 형광등 같은 조명
  scene.add(new THREE.AmbientLight(0xfff8f0,1.4));
  for (let z=0;z<DIM3_MH;z+=2) for (let x=0;x<DIM3_MW;x+=2) {
    const fl=new THREE.PointLight(0xfff5e8,1.1,CELL*5,1.6);
    fl.position.set(x*CELL+CELL/2,H_WALL-0.05,z*CELL+CELL/2);
    fl.userData.baseIntensity=fl.intensity;
    fl.userData.phase=Math.random()*Math.PI*2;
    scene.add(fl);
    // 형광등 메시
    const tubeMat=new THREE.MeshBasicMaterial({color:0xfffff0});
    const tube=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.05,CELL*0.7),tubeMat);
    tube.position.set(x*CELL+CELL/2,H_WALL-0.02,z*CELL+CELL/2); scene.add(tube);
  }

  // 학교 타일 바닥
  const tileTex=makeSchoolTileTex(); tileTex.repeat.set(DIM3_MW*2,DIM3_MH*2);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(mazeW+2,mazeH+2),new THREE.MeshLambertMaterial({map:tileTex}));
  floor.rotation.x=-Math.PI/2; floor.position.set(mazeW/2,0,mazeH/2); scene.add(floor);

  // void 바닥
  const voidFloor=new THREE.Mesh(new THREE.PlaneGeometry(600,600),new THREE.MeshLambertMaterial({color:0x080810}));
  voidFloor.rotation.x=-Math.PI/2; voidFloor.position.set(mazeW/2,-18,mazeH/2); scene.add(voidFloor);

  // 천장 (흰색 타일)
  const ceilTex=makeCheckerTex(0xe8e8e8,0xf0f0f0); ceilTex.repeat.set(DIM3_MW*2,DIM3_MH*2);
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(mazeW+2,mazeH+2),new THREE.MeshLambertMaterial({map:ceilTex}));
  ceil.rotation.x=Math.PI/2; ceil.position.set(mazeW/2,H_WALL,mazeH/2); scene.add(ceil);

  // 학교 벽
  const wallTex=makeSchoolWallTex(); wallTex.repeat.set(1.0,1.0);
  const wallMat=new THREE.MeshLambertMaterial({map:wallTex});
  const wallGeoH=new THREE.BoxGeometry(CELL+T_WALL,H_WALL,T_WALL);
  const wallGeoV=new THREE.BoxGeometry(T_WALL,H_WALL,CELL+T_WALL);
  const mH: THREE.Matrix4[]=[],mV: THREE.Matrix4[]=[];
  const m4=new THREE.Matrix4();
  for (let z=0;z<DIM3_MH;z++) for (let x=0;x<DIM3_MW;x++) {
    const cell=maze[z][x]; const wx=x*CELL,wz=z*CELL;
    if (cell.walls.top)   mH.push(m4.clone().makeTranslation(wx+CELL/2,H_WALL/2,wz));
    if (cell.walls.left)  mV.push(m4.clone().makeTranslation(wx,H_WALL/2,wz+CELL/2));
    if (z===DIM3_MH-1&&cell.walls.bottom) mH.push(m4.clone().makeTranslation(wx+CELL/2,H_WALL/2,wz+CELL));
    if (x===DIM3_MW-1&&cell.walls.right)  mV.push(m4.clone().makeTranslation(wx+CELL,H_WALL/2,wz+CELL/2));
  }
  if (mH.length>0){const im=new THREE.InstancedMesh(wallGeoH,wallMat,mH.length);mH.forEach((m,i)=>im.setMatrixAt(i,m));im.instanceMatrix.needsUpdate=true;scene.add(im);}
  if (mV.length>0){const im=new THREE.InstancedMesh(wallGeoV,wallMat,mV.length);mV.forEach((m,i)=>im.setMatrixAt(i,m));im.instanceMatrix.needsUpdate=true;scene.add(im);}

  // ── 차원3 엔티티 2종 ─────────────────────────────────────────────────────────
  const entityGroups: EntityDim3Data[]=[];
  const entityTex=makeEntitySpriteTexture();

  // 유령 학생 (흰색/파란 투명)
  for (let i=0;i<2;i++) {
    const ex=(2+i*5)*CELL+CELL/2, ez=(3+i*4)*CELL+CELL/2;
    const group=new THREE.Group();
    const spriteMat=new THREE.SpriteMaterial({
      map:entityTex, transparent:true, depthWrite:false,
      color:new THREE.Color(0.75,0.88,1.0), opacity:0.62
    });
    const sprite=new THREE.Sprite(spriteMat);
    sprite.scale.set(2.0,2.8,1);
    sprite.position.set(0,1.2,0);
    group.add(sprite);
    const gl=new THREE.PointLight(0x88aaff,0.8,4,1.5);
    group.add(gl);
    group.position.set(ex,0,ez);
    scene.add(group);
    entityGroups.push({group,sprite,pos:new THREE.Vector3(ex,0,ez),vel:new THREE.Vector3(),phase:Math.random()*Math.PI*2,type:'ghost'});
  }

  // 관리인 (어두운 갈색)
  for (let i=0;i<2;i++) {
    const ex=(1+i*7)*CELL+CELL/2, ez=(6+i*2)*CELL+CELL/2;
    const group=new THREE.Group();
    const spriteMat=new THREE.SpriteMaterial({
      map:entityTex, transparent:true, depthWrite:false,
      color:new THREE.Color(0.32,0.22,0.12), opacity:0.9
    });
    const sprite=new THREE.Sprite(spriteMat);
    sprite.scale.set(2.2,3.2,1);
    sprite.position.set(0,1.3,0);
    group.add(sprite);
    // 녹색 눈
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.07,5,4),new THREE.MeshBasicMaterial({color:0x00ff44}));
    eye.position.set(0.15,2.1,0.05); group.add(eye);
    const eye2=eye.clone(); eye2.position.set(-0.15,2.1,0.05); group.add(eye2);
    group.position.set(ex,0,ez);
    scene.add(group);
    entityGroups.push({group,sprite,pos:new THREE.Vector3(ex,0,ez),vel:new THREE.Vector3(),phase:Math.random()*Math.PI*2,type:'janitor'});
  }

  return {scene,wallBoxes,entityGroups};
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────
export default function MazeEngine({
  is2DView=false,
  serverId,
  complexity=5,
  equippedFlashlight,
  pointerSensitivity=1,
  initialPart=null,
  initialDimension=null,
  onDoorZoneChange,
  onRoomChange,
  onPositionChange,
  onFlashlightChange,
  onDimensionChange,
}: MazeEngineProps) {
  const wrapperRef=useRef<HTMLDivElement>(null);
  const containerRef=useRef<HTMLDivElement>(null);
  const minimapCanvasRef=useRef<HTMLCanvasElement>(null);
  const is2DViewRef=useRef(false);
  const mapFrameRef=useRef(0);
  const [locked,setLocked]=useState(false);
  const [dimension,setDimension]=useState<1|2|3>(1);
  const [doorState,setDoorState]=useState<'closed'|'unlocking'|'opening'|'open'>('closed');
  const [showDoorHint,setShowDoorHint]=useState(false);
  const [dead,setDead]=useState(false);
  const [gazeProgress,setGazeProgress]=useState(0);
  const [inventory,setInventory]=useState(0);
  const [falling,setFalling]=useState(false);
  const [currentAlgo,setCurrentAlgo]=useState('');
  const [soundOn,setSoundOn]=useState(true);
  const initialAnnouncementSentRef=useRef(false);

  const yawRef=useRef(0);
  const pitchRef=useRef(0);
  const lockedRef=useRef(false);
  const keysRef=useRef<Record<string,boolean>>({});
  const flashOnRef=useRef(true);
  const flashRef=useRef<THREE.SpotLight|null>(null);
  const wallBoxRef=useRef<WallBox[]>([]);
  const posRef=useRef({x:CELL/2,z:CELL/2});
  const bobRef=useRef(0);
  const posTickRef=useRef(0);
  const sensRef=useRef(BASE_SENS*pointerSensitivity);
  const dimRef=useRef<1|2|3>(1);
  const deadRef=useRef(false);
  const dim2DataRef=useRef<Dim2Data|null>(null);
  const dim3DataRef=useRef<Dim3Data|null>(null);
  const dim1DataRef=useRef<(Dim1Data&{flashlight:THREE.SpotLight;ambientLight:THREE.AmbientLight})|null>(null);
  const doorZoneRef=useRef<number|null>(null);
  const activeCameraRef=useRef<THREE.PerspectiveCamera|null>(null);
  const activeSceneRef=useRef<THREE.Scene|null>(null);
  const doorStateRef=useRef<'closed'|'unlocking'|'opening'|'open'>('closed');
  const gazeRef=useRef({time:0,spriteIdx:-1});
  const keyPressBuf=useRef<Set<string>>(new Set());
  const inventoryRef=useRef(0);
  const fallingRef=useRef(false);
  const fallYRef=useRef(0);
  const fallSpeedRef=useRef(0);
  const portalCooldownRef=useRef(0);

  sensRef.current=BASE_SENS*pointerSensitivity;
  is2DViewRef.current=is2DView;

  // 2D뷰 전환 시 캔버스 크기 업데이트
  useEffect(()=>{
    is2DViewRef.current=is2DView;
    const canvas=minimapCanvasRef.current;
    const wrap=wrapperRef.current;
    if (!canvas) return;
    if (is2DView) {
      canvas.width=wrap?.clientWidth||window.innerWidth;
      canvas.height=wrap?.clientHeight||window.innerHeight;
    } else {
      canvas.width=180; canvas.height=180;
    }
  },[is2DView]);

  const resetToDim1=useCallback(()=>{
    dimRef.current=1;
    setDimension(1);
    onDimensionChange?.(1);
    setAmbient(1);
    deadRef.current=false;
    setDead(false);
    gazeRef.current={time:0,spriteIdx:-1};
    setGazeProgress(0);
    fallingRef.current=false; fallYRef.current=0; fallSpeedRef.current=0;
    setFalling(false);
    inventoryRef.current=0; setInventory(0);
    posRef.current={x:CELL/2,z:CELL/2};
    yawRef.current=0; pitchRef.current=0;
    if (dim1DataRef.current) {
      activeSceneRef.current=dim1DataRef.current.scene;
      wallBoxRef.current=dim1DataRef.current.wallBoxes;
    }
    onRoomChange?.(null);
    initialAnnouncementSentRef.current=true;
    portalCooldownRef.current=0;
  },[onDimensionChange]);

  useEffect(()=>{
    const container=containerRef.current;
    if (!container) return;
    const wrap=wrapperRef.current;
    const W=(wrap?.clientWidth||container.clientWidth)||window.innerWidth;
    const H=(wrap?.clientHeight||container.clientHeight)||window.innerHeight;

    const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:"high-performance"});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    renderer.setSize(W,H);
    container.appendChild(renderer.domElement);

    const camera=new THREE.PerspectiveCamera(75,W/H,0.05,120);
    camera.position.set(CELL/2,P_HEIGHT,CELL/2);
    activeCameraRef.current=camera;

    const d1=buildDim1(complexity,equippedFlashlight??null);
    dim1DataRef.current=d1;
    doorZoneRef.current=d1.doorZone??null;
    onDoorZoneChange?.(d1.doorZone??null);
    const d2=buildDim2();
    dim2DataRef.current=d2;
    setCurrentAlgo(d2.algoName);
    const d3=buildDim3();
    dim3DataRef.current=d3;

    activeSceneRef.current=d1.scene;
    wallBoxRef.current=d1.wallBoxes;
    flashRef.current=d1.flashlight;

    if (!initialAnnouncementSentRef.current) {
      if (initialDimension===2) {
        const targetPart=initialPart&&initialPart>0?initialPart:1;
        onRoomChange?.(targetPart);
      } else {
        onRoomChange?.(null);
      }
      initialAnnouncementSentRef.current=true;
    }

    const onClick=()=>{ container.requestPointerLock(); resumeAudio(); };
    container.addEventListener("click",onClick);
    const onLockChange=()=>{
      const isLocked=document.pointerLockElement===container;
      lockedRef.current=isLocked; setLocked(isLocked);
      if (isLocked) { resumeAudio(); setAmbient(dimRef.current); }
    };
    document.addEventListener("pointerlockchange",onLockChange);
    document.addEventListener("pointerlockerror",()=>{});
    const onMouseMove=(e: MouseEvent)=>{
      if (!lockedRef.current) return;
      yawRef.current-=e.movementX*sensRef.current;
      pitchRef.current-=e.movementY*sensRef.current;
      pitchRef.current=Math.max(-MAX_PITCH,Math.min(MAX_PITCH,pitchRef.current));
    };
    document.addEventListener("mousemove",onMouseMove);

    const onKeyDown=(e: KeyboardEvent)=>{
      const k=e.key.toLowerCase();
      keysRef.current[k]=true;
      keyPressBuf.current.add(k);
      if (k==="f"){flashOnRef.current=!flashOnRef.current;onFlashlightChange?.(flashOnRef.current);}
      if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)) e.preventDefault();
    };
    const onKeyUp=(e: KeyboardEvent)=>{ keysRef.current[e.key.toLowerCase()]=false; };
    document.addEventListener("keydown",onKeyDown);
    document.addEventListener("keyup",onKeyUp);
    const onResize=()=>{
      const rw=(wrap?.clientWidth||container.clientWidth)||800;
      const rh=(wrap?.clientHeight||container.clientHeight)||600;
      camera.aspect=rw/rh; camera.updateProjectionMatrix();
      renderer.setSize(rw,rh);
      // 2D뷰 캔버스도 리사이즈
      const mc=minimapCanvasRef.current;
      if (mc&&is2DViewRef.current&&wrap){mc.width=wrap.clientWidth;mc.height=wrap.clientHeight;}
    };
    window.addEventListener("resize",onResize);

    const raycaster=new THREE.Raycaster();
    const centerNDC=new THREE.Vector2(0,0);
    let lastTime=performance.now();
    let t=0,raf: number;

    // ─── 미니맵 그리기 ──────────────────────────────────────────────────────────
    const drawMinimap=()=>{
      const canvas=minimapCanvasRef.current;
      if (!canvas) return;
      const mctx=canvas.getContext("2d");
      if (!mctx) return;

      const curDim=dimRef.current;
      const pos=posRef.current;
      const yaw=yawRef.current;
      const cw=canvas.width, ch=canvas.height;

      let walls: WallBox[]=[];
      let worldW=1,worldH=1;
      if (curDim===1&&dim1DataRef.current){
        walls=dim1DataRef.current.wallBoxes;
        const mwDim=(8+complexity*2)*CELL;
        worldW=worldH=mwDim;
      } else if (curDim===2&&dim2DataRef.current){
        walls=dim2DataRef.current.wallBoxes;
        worldW=DIM2_MW*CELL; worldH=DIM2_MH*CELL;
      } else if (curDim===3&&dim3DataRef.current){
        walls=dim3DataRef.current.wallBoxes;
        worldW=DIM3_MW*CELL; worldH=DIM3_MH*CELL;
      }

      const sx=cw/worldW, sz=ch/worldH;

      // 배경
      mctx.fillStyle=curDim===1?'#0c0918':curDim===2?'#071309':'#080e1a';
      mctx.fillRect(0,0,cw,ch);
      // 통로 색
      mctx.fillStyle=curDim===1?'#1c1630':curDim===2?'#0d2a12':'#0e1a30';
      mctx.fillRect(0,0,cw,ch);

      // 벽
      mctx.fillStyle=curDim===1?'#5030a0':curDim===2?'#30a050':'#2850b0';
      for (const w of walls){
        mctx.fillRect(
          w.minX*sx, w.minZ*sz,
          Math.max(1.5,(w.maxX-w.minX)*sx),
          Math.max(1.5,(w.maxZ-w.minZ)*sz)
        );
      }

      const dotR=Math.max(3,cw/55);

      // ── 차원1 마커 ────
      if (curDim===1&&dim1DataRef.current){
        if (dim1DataRef.current.doorWorldPos){
          const dp=dim1DataRef.current.doorWorldPos;
          mctx.beginPath();
          mctx.arc(dp.x*sx,dp.z*sz,dotR*1.5,0,Math.PI*2);
          mctx.fillStyle='#ff60b0'; mctx.fill();
          mctx.strokeStyle='#ff1080'; mctx.lineWidth=1.5; mctx.stroke();
        }
        for (const ent of dim1DataRef.current.entities){
          mctx.beginPath();
          mctx.arc(ent.pos.x*sx,ent.pos.z*sz,dotR,0,Math.PI*2);
          mctx.fillStyle=ent.type==='orb'?'rgba(255,80,80,0.9)':'rgba(160,0,40,0.85)';
          mctx.fill();
        }
      }

      // ── 차원2 마커 ────
      if (curDim===2&&dim2DataRef.current){
        const d2=dim2DataRef.current;
        for (const portal of d2.portals){
          mctx.beginPath();
          mctx.arc(portal.pos.x*sx,portal.pos.z*sz,dotR*1.6,0,Math.PI*2);
          mctx.fillStyle='rgba(0,240,220,0.8)'; mctx.fill();
          mctx.strokeStyle='#00ffee'; mctx.lineWidth=1.5; mctx.stroke();
        }
        for (const ball of d2.balls){
          if (ball.collected) continue;
          mctx.beginPath();
          mctx.arc(ball.group.position.x*sx,ball.group.position.z*sz,Math.max(2,cw/75),0,Math.PI*2);
          mctx.fillStyle='rgba(255,165,50,0.7)'; mctx.fill();
        }
        for (const ent of d2.entityGroups){
          mctx.beginPath();
          mctx.arc(ent.pos.x*sx,ent.pos.z*sz,dotR,0,Math.PI*2);
          mctx.fillStyle='rgba(255,50,80,0.95)'; mctx.fill();
        }
      }

      // ── 차원3 마커 ────
      if (curDim===3&&dim3DataRef.current){
        for (const ent of dim3DataRef.current.entityGroups){
          mctx.beginPath();
          mctx.arc(ent.pos.x*sx,ent.pos.z*sz,dotR,0,Math.PI*2);
          mctx.fillStyle=ent.type==='ghost'?'rgba(160,190,255,0.85)':'rgba(190,110,40,0.9)';
          mctx.fill();
        }
      }

      // 플레이어 화살표
      const px=pos.x*sx, pz=pos.z*sz;
      const ar=Math.max(6,cw/24);
      mctx.save();
      mctx.translate(px,pz);
      mctx.rotate(-yaw);
      // 시야 콘
      mctx.beginPath();
      mctx.moveTo(0,0);
      mctx.arc(0,0,ar*2.8,-Math.PI/3.5,Math.PI/3.5);
      mctx.fillStyle='rgba(255,255,200,0.07)'; mctx.fill();
      // 화살 몸체
      mctx.fillStyle='#ffffff';
      mctx.beginPath();
      mctx.moveTo(0,-ar);
      mctx.lineTo(-ar*0.55,ar*0.65);
      mctx.lineTo(0,ar*0.2);
      mctx.lineTo(ar*0.55,ar*0.65);
      mctx.closePath();
      mctx.fill();
      mctx.strokeStyle='#88bbff'; mctx.lineWidth=0.8; mctx.stroke();
      mctx.restore();

      // 테두리
      mctx.strokeStyle='rgba(139,92,246,0.45)';
      mctx.lineWidth=is2DViewRef.current?1.5:1;
      mctx.strokeRect(0,0,cw,ch);
    };

    const animate=()=>{
      raf=requestAnimationFrame(animate);
      if (!activeSceneRef.current) return;
      const now=performance.now();
      const dt=Math.min((now-lastTime)/1000,0.05);
      lastTime=now;
      t+=dt;
      if (portalCooldownRef.current>0) portalCooldownRef.current-=dt;

      const keys=keysRef.current;
      const pos=posRef.current;
      const xKey=keyPressBuf.current.has("x");
      const qKey=keyPressBuf.current.has("q");
      keyPressBuf.current.clear();
      const curDim=dimRef.current;

      camera.quaternion.setFromEuler(new THREE.Euler(pitchRef.current,yawRef.current,0,"YXZ"));

      const yaw=yawRef.current;
      const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
      const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
      const move=new THREE.Vector3();
      if (keys["w"]||keys["arrowup"])    move.addScaledVector(forward, 1);
      if (keys["s"]||keys["arrowdown"])  move.addScaledVector(forward,-1);
      if (keys["a"]||keys["arrowleft"])  move.addScaledVector(right,  -1);
      if (keys["d"]||keys["arrowright"]) move.addScaledVector(right,   1);

      const moving=move.lengthSq()>0;
      if (moving&&!deadRef.current) {
        move.normalize().multiplyScalar(SPEED*dt);
        const wb=wallBoxRef.current;
        const nx=pos.x+move.x;
        if (!hitsWall(wb,nx,pos.z)) pos.x=nx;
        const nz=pos.z+move.z;
        if (!hitsWall(wb,pos.x,nz)) pos.z=nz;
        if (!fallingRef.current) playFootstep(curDim as 1|2|3);
      }
      if (moving&&!fallingRef.current) bobRef.current+=8*dt;
      const bobY=moving?Math.sin(bobRef.current)*0.028:0;
      camera.position.set(pos.x,P_HEIGHT+bobY-fallYRef.current,pos.z);

      // ── 차원1 로직 ──────────────────────────────────────────────────────────
      if (curDim===1&&d1.doorGroup&&d1.doorWorldPos) {
        const dstate=doorStateRef.current;
        const dx2d=pos.x-d1.doorWorldPos.x;
        const dz2d=pos.z-d1.doorWorldPos.z;
        const distToDoor2D=Math.sqrt(dx2d*dx2d+dz2d*dz2d);
        const nearDoor=distToDoor2D<2.5;
        setShowDoorHint(nearDoor);

        const fl=flashRef.current;
        if (fl) {
          fl.intensity=flashOnRef.current?d1.flashlight.userData.baseIntensity:0;
          fl.position.copy(camera.position);
          const dir=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
          fl.target.position.copy(camera.position).addScaledVector(dir,10);
          fl.target.updateMatrixWorld();
        }

        // 형광등 깜빡임
        for (const pl of d1.pointLights) {
          pl.userData.phase+=dt*(0.8+Math.random()*0.4);
          const flicker=Math.sin(pl.userData.phase*3.7)*0.15+Math.sin(pl.userData.phase*11.3)*0.08;
          pl.intensity=pl.userData.baseIntensity*(1+flicker);
        }

        if (nearDoor&&xKey&&dstate==='closed') {
          doorStateRef.current='unlocking';
          setDoorState('unlocking');
          onDoorZoneChange?.(doorZoneRef.current);
          playKeyTurn();
        }

        const panel=(d1.doorGroup as any)._panel as THREE.Group;
        const keyMesh=(d1.doorGroup as any)._key as THREE.Mesh;
        if (dstate==='unlocking') {
          (d1.doorGroup as any)._keyAngle=((d1.doorGroup as any)._keyAngle??0)+dt*1.8;
          if (keyMesh) keyMesh.rotation.z=Math.sin((d1.doorGroup as any)._keyAngle)*0.6;
          if ((d1.doorGroup as any)._keyAngle>Math.PI){doorStateRef.current='opening';setDoorState('opening');playDoorCreak();}
        } else if (dstate==='opening') {
          (d1.doorGroup as any)._angle=Math.min((d1.doorGroup as any)._angle+dt*1.5,Math.PI/2);
          panel.rotation.y=-(d1.doorGroup as any)._angle;
          if ((d1.doorGroup as any)._angle>=Math.PI/2-0.05){doorStateRef.current='open';setDoorState('open');}
        }

        if (dstate==='open'&&distToDoor2D<1.8) {
          const fwd=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
          const toDoor=new THREE.Vector3(d1.doorWorldPos.x-pos.x,0,d1.doorWorldPos.z-pos.z).normalize();
          if (fwd.dot(toDoor)>0.35) {
            dimRef.current=2; setDimension(2);
            onDimensionChange?.(2);
            playPortalEnter(); playDimensionTransition(); setAmbient(2);
            setShowDoorHint(false);
            const rebuilt=buildDim2();
            dim2DataRef.current=rebuilt;
            setCurrentAlgo(rebuilt.algoName);
            const targetPart=initialPart&&initialPart>0?initialPart:1;
            const tx=((targetPart-1)%DIM2_MW)*CELL+CELL/2;
            const tz=Math.floor((targetPart-1)/DIM2_MW)*CELL+CELL/2;
            pos.x=Math.max(CELL/2,Math.min(DIM2_MW*CELL-CELL/2,tx));
            pos.z=Math.max(CELL/2,Math.min(DIM2_MH*CELL-CELL/2,tz));
            yawRef.current=0; pitchRef.current=0;
            fallingRef.current=false; fallYRef.current=0; fallSpeedRef.current=0;
            activeSceneRef.current=rebuilt.scene;
            wallBoxRef.current=rebuilt.wallBoxes;
            onRoomChange?.(targetPart);
            portalCooldownRef.current=2;
          }
        }

        // 차원1 엔티티 이동 (그림자 인간 + 오브)
        if (!deadRef.current) {
          for (const ent of d1.entities) {
            ent.phase+=dt;
            const dx=pos.x-ent.pos.x;
            const dz=pos.z-ent.pos.z;
            const dist=Math.sqrt(dx*dx+dz*dz);
            if (dist>1.5&&dist<40) {
              const spd=(ent.type==='orb'?1.2:0.7)*dt;
              const nx=ent.pos.x+(dx/dist)*spd;
              const nz=ent.pos.z+(dz/dist)*spd;
              if (!hitsWall(d1.wallBoxes,nx,ent.pos.z)) ent.pos.x=nx;
              if (!hitsWall(d1.wallBoxes,ent.pos.x,nz)) ent.pos.z=nz;
              ent.group.rotation.y=Math.atan2(dx,dz);
            }
            if (ent.type==='orb') {
              ent.pos.y=1.4+Math.sin(ent.phase*1.8)*0.4;
              ent.group.position.set(ent.pos.x,ent.pos.y,ent.pos.z);
              const s=0.85+Math.sin(ent.phase*2.2)*0.15;
              ent.group.scale.setScalar(s);
            } else {
              ent.group.position.set(ent.pos.x,0,ent.pos.z);
            }
          }
        }
      }

      // ── 차원2 로직 ──────────────────────────────────────────────────────────
      if (curDim===2) {
        const d2=dim2DataRef.current!;
        const mazeWd=DIM2_MW*CELL, mazeHt=DIM2_MH*CELL;

        // 절벽 낙하
        const outOfBounds=pos.x<-0.4||pos.x>mazeWd+0.4||pos.z<-0.4||pos.z>mazeHt+0.4;
        if (outOfBounds&&!fallingRef.current&&!deadRef.current){fallingRef.current=true;setFalling(true);playFalling();}
        if (fallingRef.current){
          fallSpeedRef.current+=22*dt;
          fallYRef.current+=fallSpeedRef.current*dt;
          if (fallYRef.current>14){
            fallingRef.current=false; fallYRef.current=0; fallSpeedRef.current=0; setFalling(false);
            const rebuilt=buildDim2();
            dim2DataRef.current=rebuilt;
            setCurrentAlgo(rebuilt.algoName);
            activeSceneRef.current=rebuilt.scene;
            wallBoxRef.current=rebuilt.wallBoxes;
            const targetPart=initialPart&&initialPart>0?initialPart:1;
            const tx=((targetPart-1)%DIM2_MW)*CELL+CELL/2;
            const tz=Math.floor((targetPart-1)/DIM2_MW)*CELL+CELL/2;
            pos.x=Math.max(CELL/2,Math.min(DIM2_MW*CELL-CELL/2,tx));
            pos.z=Math.max(CELL/2,Math.min(DIM2_MH*CELL-CELL/2,tz));
            onRoomChange?.(targetPart);
            return;
          }
        }

        if (!deadRef.current) {
          // Q키: 공 던지기
          if (qKey&&inventoryRef.current>0) {
            inventoryRef.current--;
            setInventory(inventoryRef.current);
            playBallThrow();
            const throwDir=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
            const radius=0.4;
            const col=BALL_COLORS[Math.floor(Math.random()*BALL_COLORS.length)];
            const ballGroup=new THREE.Group();
            ballGroup.add(new THREE.Mesh(new THREE.SphereGeometry(radius,14,10),new THREE.MeshLambertMaterial({color:col})));
            for (let si=0;si<3;si++) {
              const stripe=new THREE.Mesh(new THREE.TorusGeometry(radius*1.007,0.018,6,24),new THREE.MeshLambertMaterial({color:0xffffff}));
              stripe.rotation.x=si*Math.PI/3; ballGroup.add(stripe);
            }
            ballGroup.position.set(pos.x+throwDir.x*0.6,radius,pos.z+throwDir.z*0.6);
            d2.scene.add(ballGroup);
            d2.balls.push({
              group:ballGroup,
              vel:new THREE.Vector3(throwDir.x*14,0,throwDir.z*14),
              radius,collected:false
            });
          }

          // 비치볼 물리
          for (const ball of d2.balls) {
            if (ball.collected) continue;
            const bx=ball.group.position.x, bz=ball.group.position.z;
            const pdx=pos.x-bx, pdz=pos.z-bz;
            const pdist=Math.sqrt(pdx*pdx+pdz*pdz);
            if (xKey&&pdist<ball.radius+1.2){
              ball.collected=true; d2.scene.remove(ball.group);
              inventoryRef.current++; setInventory(inventoryRef.current);
              playBallCollect(); continue;
            }
            if (pdist<P_RADIUS+ball.radius+0.1&&pdist>0.001){
              const pushStr=4.5;
              ball.vel.x-=(pdx/pdist)*pushStr; ball.vel.z-=(pdz/pdist)*pushStr;
            }
            const friction=Math.pow(BALL_FRICTION,dt*60);
            ball.vel.multiplyScalar(friction);
            const nbx=bx+ball.vel.x*dt, nbz=bz+ball.vel.z*dt;
            if (!hitsWall(d2.wallBoxes,nbx,bz)) ball.group.position.x=nbx; else ball.vel.x*=-0.45;
            if (!hitsWall(d2.wallBoxes,ball.group.position.x,nbz)) ball.group.position.z=nbz; else ball.vel.z*=-0.45;
            const spd2D=Math.sqrt(ball.vel.x**2+ball.vel.z**2);
            if (spd2D>0.01){
              ball.group.rotation.z-=ball.vel.x*dt*(1/ball.radius)*0.5;
              ball.group.rotation.x+=ball.vel.z*dt*(1/ball.radius)*0.5;
            }
          }
          if (d2.balls.length<300){
            for (let s=0;s<4;s++){
              const sx=Math.random()*mazeWd, sz=Math.random()*mazeHt;
              if (hitsWall(d2.wallBoxes,sx,sz)) continue;
              const radius=0.34+Math.random()*0.16;
              const col=BALL_COLORS[(Math.random()*BALL_COLORS.length)|0];
              const ballGroup=new THREE.Group();
              ballGroup.add(new THREE.Mesh(new THREE.SphereGeometry(radius,16,12),new THREE.MeshLambertMaterial({color:col})));
              for (let si=0;si<3;si++){const stripe=new THREE.Mesh(new THREE.TorusGeometry(radius*1.007,0.018,6,24),new THREE.MeshLambertMaterial({color:0xffffff}));stripe.rotation.x=si*Math.PI/3;ballGroup.add(stripe);}
              ballGroup.position.set(sx,radius,sz); d2.scene.add(ballGroup);
              d2.balls.push({group:ballGroup,vel:new THREE.Vector3(),radius,collected:false});
            }
          }

          // 포탈 애니메이션 + 진입 감지
          for (const portal of d2.portals) {
            portal.phase+=dt;
            const mat=portal.mesh.material as THREE.MeshBasicMaterial;
            mat.opacity=0.55+Math.sin(portal.phase*2.5)*0.25;
            portal.mesh.rotation.y+=dt*0.8;
            const pdx=pos.x-portal.pos.x, pdz=pos.z-portal.pos.z;
            const pdist=Math.sqrt(pdx*pdx+pdz*pdz);
            if (pdist<1.6&&portalCooldownRef.current<=0) {
              // 3차원으로 진입
              dimRef.current=3; setDimension(3);
              onDimensionChange?.(3);
              playPortalEnter(); playDimensionTransition(); setAmbient(3);
              const rebuilt3=buildDim3();
              dim3DataRef.current=rebuilt3;
              pos.x=DIM3_MW*CELL/2; pos.z=DIM3_MH*CELL/2;
              yawRef.current=0; pitchRef.current=0;
              fallingRef.current=false; fallYRef.current=0; fallSpeedRef.current=0;
              activeSceneRef.current=rebuilt3.scene;
              wallBoxRef.current=rebuilt3.wallBoxes;
              portalCooldownRef.current=3;
              break;
            }
          }

          // 꽃-눈 엔티티 이동
          for (const ent of d2.entityGroups) {
            ent.phase+=dt;
            const dx=pos.x-ent.pos.x, dz=pos.z-ent.pos.z;
            const dist=Math.sqrt(dx*dx+dz*dz);
            if (dist>1.8&&dist<30&&!fallingRef.current){
              let ballBlock=false;
              for (const ball of d2.balls) {
                if (ball.collected) continue;
                const ebx=ball.group.position.x-ent.pos.x;
                const ebz=ball.group.position.z-ent.pos.z;
                if (Math.sqrt(ebx*ebx+ebz*ebz)<ball.radius+0.5){ballBlock=true;break;}
              }
              if (!ballBlock){
                const spd=ENTITY_SPEED*dt;
                const nx=ent.pos.x+(dx/dist)*spd, nz=ent.pos.z+(dz/dist)*spd;
                if (!hitsWall(d2.wallBoxes,nx,ent.pos.z)) ent.pos.x=nx;
                if (!hitsWall(d2.wallBoxes,ent.pos.x,nz)) ent.pos.z=nz;
                ent.group.rotation.y=Math.atan2(dx,dz);
              }
            }
            ent.group.position.set(ent.pos.x,Math.sin(ent.phase*1.1)*0.03,ent.pos.z);
            ent.sprite.material.rotation=Math.sin(ent.phase*0.4)*0.08;
            ent.sprite.material.opacity=0.88+Math.sin(ent.phase*2.4)*0.08;
          }

          // 엔티티 접근 소리 (2차원)
          for (const ent of d2.entityGroups) {
            const edx=pos.x-ent.pos.x, edz=pos.z-ent.pos.z;
            playEntityApproach(Math.sqrt(edx*edx+edz*edz),2);
          }

          // 눈 응시 감지
          raycaster.setFromCamera(centerNDC,camera);
          const eyeHits=raycaster.intersectObjects(d2.entityGroups.map(e=>e.sprite),false);
          if (eyeHits.length>0){
            const hitIdx=d2.entityGroups.findIndex(e=>e.sprite===eyeHits[0].object);
            if (hitIdx!==-1){
              if (gazeRef.current.spriteIdx===hitIdx) gazeRef.current.time+=dt;
              else gazeRef.current={time:dt,spriteIdx:hitIdx};
              setGazeProgress(Math.min(gazeRef.current.time/GAZE_DEATH_TIME,1));
              if (gazeRef.current.time>=GAZE_DEATH_TIME){
                deadRef.current=true; setDead(true);
                gazeRef.current={time:0,spriteIdx:-1}; setGazeProgress(0);
                playGazeDeath();
                setTimeout(()=>{resetToDim1();},3000);
              }
            }
          } else {
            if (gazeRef.current.spriteIdx!==-1){gazeRef.current={time:0,spriteIdx:-1};setGazeProgress(0);}
          }
        }
      }

      // ── 차원3 로직 (학교) ───────────────────────────────────────────────────
      if (curDim===3) {
        const d3=dim3DataRef.current!;
        const mazeWd=DIM3_MW*CELL, mazeHt=DIM3_MH*CELL;

        // 절벽 낙하 → 1차원 복귀
        const outOfBounds=pos.x<-0.4||pos.x>mazeWd+0.4||pos.z<-0.4||pos.z>mazeHt+0.4;
        if (outOfBounds&&!fallingRef.current&&!deadRef.current){fallingRef.current=true;setFalling(true);playFalling();}
        if (fallingRef.current){
          fallSpeedRef.current+=22*dt; fallYRef.current+=fallSpeedRef.current*dt;
          if (fallYRef.current>14){resetToDim1();return;}
        }

        if (!deadRef.current) {
          // 차원3 엔티티 이동 + 응시 사망
          for (const ent of d3.entityGroups) {
            ent.phase+=dt;
            const dx=pos.x-ent.pos.x, dz=pos.z-ent.pos.z;
            const dist=Math.sqrt(dx*dx+dz*dz);
            if (dist>1.5&&dist<35) {
              const spd=ENTITY3_SPEED*dt*(ent.type==='janitor'?1.4:0.9);
              const nx=ent.pos.x+(dx/dist)*spd, nz=ent.pos.z+(dz/dist)*spd;
              if (!hitsWall(d3.wallBoxes,nx,ent.pos.z)) ent.pos.x=nx;
              if (!hitsWall(d3.wallBoxes,ent.pos.x,nz)) ent.pos.z=nz;
              ent.group.rotation.y=Math.atan2(dx,dz);
            }
            if (ent.type==='ghost') {
              ent.pos.y=Math.sin(ent.phase*1.3)*0.25;
              ent.group.position.set(ent.pos.x,ent.pos.y,ent.pos.z);
              ent.sprite.material.opacity=0.45+Math.sin(ent.phase*1.8)*0.2;
            } else {
              ent.group.position.set(ent.pos.x,0,ent.pos.z);
              ent.sprite.material.opacity=0.88+Math.sin(ent.phase*2.0)*0.08;
            }
          }

          // 엔티티 접근 소리 (3차원)
          for (const ent of d3.entityGroups) {
            const edx=pos.x-ent.pos.x, edz=pos.z-ent.pos.z;
            playEntityApproach(Math.sqrt(edx*edx+edz*edz),3);
          }

          // 엔티티 응시 사망
          raycaster.setFromCamera(centerNDC,camera);
          const eyeHits3=raycaster.intersectObjects(d3.entityGroups.map(e=>e.sprite),false);
          if (eyeHits3.length>0){
            const hitIdx=d3.entityGroups.findIndex(e=>e.sprite===eyeHits3[0].object);
            if (hitIdx!==-1){
              if (gazeRef.current.spriteIdx===hitIdx) gazeRef.current.time+=dt;
              else gazeRef.current={time:dt,spriteIdx:hitIdx};
              setGazeProgress(Math.min(gazeRef.current.time/GAZE_DEATH_TIME,1));
              if (gazeRef.current.time>=GAZE_DEATH_TIME){
                deadRef.current=true; setDead(true);
                gazeRef.current={time:0,spriteIdx:-1}; setGazeProgress(0);
                playGazeDeath();
                setTimeout(()=>{resetToDim1();},3000);
              }
            }
          } else {
            if (gazeRef.current.spriteIdx!==-1){gazeRef.current={time:0,spriteIdx:-1};setGazeProgress(0);}
          }
        }
      }

      // 위치 전송
      posTickRef.current++;
      if (posTickRef.current>=60&&onPositionChange){
        posTickRef.current=0;
        onPositionChange({x:pos.x,y:P_HEIGHT,z:pos.z,mapId:`server_${serverId??'solo'}_dim${curDim}`});
        if (curDim===1) onRoomChange?.(Math.floor(pos.x/CELL)*100+Math.floor(pos.z/CELL)+1);
        else if (curDim===2) onRoomChange?.(Math.floor(pos.x/CELL)*DIM2_MW+Math.floor(pos.z/CELL)+1);
        else onRoomChange?.(Math.floor(pos.x/CELL)*DIM3_MW+Math.floor(pos.z/CELL)+1);
      }

      // 미니맵 매 3프레임마다 갱신
      mapFrameRef.current++;
      if (mapFrameRef.current%3===0) drawMinimap();

      // 3D 렌더 (2D뷰 모드에서는 건너뜀)
      if (!is2DViewRef.current) renderer.render(activeSceneRef.current!,camera);
    };
    animate();

    return ()=>{
      cancelAnimationFrame(raf);
      if (document.pointerLockElement===container) document.exitPointerLock();
      container.removeEventListener("click",onClick);
      document.removeEventListener("pointerlockchange",onLockChange);
      document.removeEventListener("mousemove",onMouseMove);
      document.removeEventListener("keydown",onKeyDown);
      document.removeEventListener("keyup",onKeyUp);
      window.removeEventListener("resize",onResize);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.forceContextLoss();
      renderer.dispose();
      lockedRef.current=false;
    };
  },[complexity,equippedFlashlight,serverId,resetToDim1]);

  const dimColors={
    1:{bg:"rgba(180,140,60,0.4)",text:"rgba(255,240,160,0.8)",border:"rgba(255,220,100,0.2)",label:"◈ 1차원 — 리미널 미로"},
    2:{bg:"rgba(100,200,80,0.3)",text:"rgba(180,255,160,0.9)",border:"rgba(120,220,100,0.3)",label:"◈ 2차원 — 드림코어 백룸"},
    3:{bg:"rgba(100,140,210,0.35)",text:"rgba(180,210,255,0.9)",border:"rgba(120,160,240,0.3)",label:"◈ 3차원 — 학교"},
  }[dimension];

  const dimLabel={1:"◈ 1차원 — 리미널 미로",2:"◈ 2차원 — 드림코어 백룸",3:"◈ 3차원 — 학교"}[dimension];
  const mapLegend={
    1:[{color:"#ff60b0",label:"출구 문"},{color:"rgba(255,80,80,0.9)",label:"엔티티"},{color:"#fff",label:"나 (↑앞)"}],
    2:[{color:"rgba(0,240,220,0.85)",label:"포탈(3차원)"},{color:"rgba(255,165,50,0.8)",label:"비치볼"},{color:"rgba(255,50,80,0.9)",label:"꽃눈 엔티티"},{color:"#fff",label:"나 (↑앞)"}],
    3:[{color:"rgba(160,190,255,0.85)",label:"유령 학생"},{color:"rgba(190,110,40,0.9)",label:"관리인"},{color:"#fff",label:"나 (↑앞)"}],
  }[dimension];

  return (
    <div
      ref={wrapperRef}
      data-testid="maze-canvas"
      className="w-full h-full relative select-none"
      style={{touchAction:"none",cursor:locked&&!is2DView?"none":"default",background:"#000"}}
    >
      {/* Three.js 3D 렌더 컨테이너 (2D뷰 시 숨김) */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{display:is2DView?"none":"block",cursor:locked?"none":"crosshair"}}
      />

      {/* 미니맵 캔버스 — 3D뷰:우하단 코너, 2D뷰:풀스크린 */}
      <canvas
        ref={minimapCanvasRef}
        width={180}
        height={180}
        className={is2DView
          ? "absolute inset-0 w-full h-full z-10"
          : "absolute z-10 rounded-lg overflow-hidden"
        }
        style={is2DView
          ? {imageRendering:"pixelated"}
          : {bottom:"5rem",right:"1rem",width:180,height:180,boxShadow:"0 0 16px rgba(139,92,246,0.5)",borderRadius:"8px"}
        }
      />

      {/* 2D 맵 뷰 오버레이 */}
      {is2DView&&(
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
          <div className="px-4 py-1.5 rounded-xl text-xs tracking-widest"
            style={{background:"rgba(0,0,0,0.65)",color:dimColors.text,border:`1px solid ${dimColors.border}`,backdropFilter:"blur(6px)"}}>
            {dimLabel} — 2D 미니맵
          </div>
          <div className="flex items-center gap-3 px-4 py-1.5 rounded-xl text-[10px] tracking-wide"
            style={{background:"rgba(0,0,0,0.55)",backdropFilter:"blur(4px)",border:"1px solid rgba(255,255,255,0.1)"}}>
            {mapLegend.map(({color,label})=>(
              <span key={label} className="flex items-center gap-1">
                <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:color,flexShrink:0}}/>
                <span style={{color:"rgba(255,255,255,0.7)"}}>{label}</span>
              </span>
            ))}
          </div>
          <div className="text-[9px] tracking-widest" style={{color:"rgba(255,255,255,0.3)"}}>V 키로 3D 복귀</div>
        </div>
      )}

      {/* ── 3D 모드 전용 오버레이 ────────────────────────────────────────────── */}
      {!is2DView&&(<>
        {locked&&!dead&&(
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <line x1="11" y1="2"  x2="11" y2="8"  stroke="rgba(255,255,200,0.9)" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="11" y1="14" x2="11" y2="20" stroke="rgba(255,255,200,0.9)" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="2"  y1="11" x2="8"  y2="11" stroke="rgba(255,255,200,0.9)" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="14" y1="11" x2="20" y2="11" stroke="rgba(255,255,200,0.9)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        )}

        {!locked&&!dead&&(
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 gap-2">
            <div className="px-5 py-2.5 rounded-2xl text-sm font-medium tracking-wider"
              style={{background:"rgba(0,0,0,0.55)",color:"rgba(255,245,180,0.92)",border:"1px solid rgba(255,240,160,0.18)",backdropFilter:"blur(6px)"}}>
              화면을 클릭하면 마우스가 잠깁니다
            </div>
            <div className="text-xs" style={{color:"rgba(255,245,180,0.45)"}}>
              {dimension===1?"WASD 이동 · F 손전등 · X 열쇠":dimension===2?"WASD 이동 · X 공 줍기 · Q 공 던지기":"WASD 이동 · ESC 해제"}
            </div>
          </div>
        )}

        {dimension===2&&locked&&!dead&&(
          <div className="absolute top-4 right-4 pointer-events-none z-20 flex items-center gap-1.5">
            <div className="px-3 py-1.5 rounded-xl text-xs tracking-wide flex items-center gap-2"
              style={{background:"rgba(20,60,20,0.55)",color:"rgba(180,255,160,0.95)",border:"1px solid rgba(100,255,100,0.25)",backdropFilter:"blur(4px)"}}>
              <span style={{fontSize:"14px"}}>🏐</span>
              <span className="font-bold">{inventory}</span>
              <span style={{color:"rgba(140,255,140,0.6)"}}>[Q던지기]</span>
            </div>
          </div>
        )}

        {locked&&(
          <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none z-10">
            <div className="px-3 py-1 rounded-full text-[10px] tracking-widest"
              style={{background:dimColors.bg,color:dimColors.text,border:`1px solid ${dimColors.border}`}}>
              {dimColors.label}
            </div>
          </div>
        )}

        {dimension===2&&locked&&currentAlgo&&(
          <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none z-10">
            <div className="px-2 py-0.5 rounded text-[9px] tracking-widest"
              style={{background:"rgba(0,80,30,0.4)",color:"rgba(150,255,150,0.65)",border:"1px solid rgba(100,200,100,0.2)"}}>
              알고리즘: {currentAlgo}
            </div>
          </div>
        )}

        {showDoorHint&&locked&&dimension===1&&(
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-20">
            <div className="px-4 py-2 rounded-xl text-xs tracking-wide animate-pulse"
              style={{background:"rgba(255,100,180,0.3)",color:"rgba(255,200,230,0.95)",border:"1px solid rgba(255,100,180,0.4)",backdropFilter:"blur(4px)"}}>
              {doorState==='closed'&&"[ X ] 열쇠를 돌려 문을 여세요"}
              {doorState==='unlocking'&&"🔑 열쇠가 돌아가고 있습니다..."}
              {doorState==='opening'&&"삐걱— 문이 열립니다..."}
              {doorState==='open'&&"✦ 다른 차원이 보입니다 — 들어가세요"}
            </div>
          </div>
        )}

        {(dimension===2||dimension===3)&&gazeProgress>0&&!dead&&(
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 pointer-events-none z-20 flex flex-col items-center gap-1">
            <span className="text-[10px] tracking-widest" style={{color:"rgba(255,100,150,0.8)"}}>눈을 마주치고 있습니다</span>
            <div className="w-48 h-2 rounded-full overflow-hidden" style={{background:"rgba(80,0,30,0.5)"}}>
              <div className="h-full rounded-full transition-all" style={{
                width:`${gazeProgress*100}%`,
                background:"linear-gradient(90deg,#ff4488,#ff0066)",
                boxShadow:"0 0 8px #ff4488",
              }}/>
            </div>
            <span className="text-[9px]" style={{color:"rgba(255,80,120,0.6)"}}>{(gazeProgress*GAZE_DEATH_TIME).toFixed(1)}s / {GAZE_DEATH_TIME}s</span>
          </div>
        )}

        {falling&&!dead&&(
          <div className="absolute inset-0 z-40 pointer-events-none"
            style={{background:"rgba(0,0,0,0.45)",backdropFilter:"blur(1px)"}}>
            <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 text-center">
              <p className="text-2xl font-bold tracking-widest animate-pulse" style={{color:"rgba(255,255,255,0.85)",textShadow:"0 0 20px #fff"}}>
                ↓ 절벽에서 떨어지고 있습니다...
              </p>
            </div>
          </div>
        )}

        {dead&&(
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none"
            style={{background:"rgba(60,0,20,0.85)",backdropFilter:"blur(2px)"}}>
            <div className="text-center space-y-3">
              <p className="text-4xl" style={{color:"#ff3366",textShadow:"0 0 30px #ff0044"}}>👁</p>
              <p className="text-xl font-bold tracking-widest" style={{color:"rgba(255,100,130,0.95)"}}>눈을 마주쳤습니다</p>
              <p className="text-sm" style={{color:"rgba(255,160,180,0.7)"}}>1차원으로 돌아갑니다...</p>
            </div>
          </div>
        )}
      </>)}

      {/* 사운드 토글 버튼 — 항상 표시 */}
      <button
        className="absolute bottom-4 right-4 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs tracking-wide transition-all hover:scale-105 active:scale-95"
        style={{
          background: soundOn ? "rgba(80,40,120,0.7)" : "rgba(40,40,40,0.7)",
          color: soundOn ? "rgba(220,190,255,0.95)" : "rgba(160,160,160,0.7)",
          border: `1px solid ${soundOn ? "rgba(180,120,255,0.4)" : "rgba(100,100,100,0.3)"}`,
          backdropFilter:"blur(6px)",
        }}
        onClick={()=>{
          const next=!soundOn;
          setSoundOn(next);
          setSoundEnabled(next);
          if (next) { resumeAudio(); setAmbient(dimension); }
        }}
      >
        <span style={{fontSize:"14px"}}>{soundOn ? "🔊" : "🔇"}</span>
        {soundOn ? "사운드 ON" : "사운드 OFF"}
      </button>
    </div>
  );
}
