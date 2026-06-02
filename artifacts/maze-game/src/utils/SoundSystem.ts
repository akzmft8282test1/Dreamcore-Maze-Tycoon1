// 절차적 사운드 시스템 — Web Audio API 기반 (오디오 파일 불필요)

let _ctx: AudioContext | null = null;
let _masterGain: GainNode | null = null;
let _ambientNode: AudioBufferSourceNode | null = null;
let _ambientGain: GainNode | null = null;
let _enabled = true;
let _currentAmbientDim: number = 0;

function ctx(): AudioContext {
  if (!_ctx) {
    _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = 0.6;
    _masterGain.connect(_ctx.destination);
    _ambientGain = _ctx.createGain();
    _ambientGain.gain.value = 0;
    _ambientGain.connect(_masterGain);
  }
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

function master(): GainNode {
  ctx();
  return _masterGain!;
}

// ─── 기본 오실레이터 유틸 ──────────────────────────────────────────────────────
function playTone(
  freq: number,
  type: OscillatorType,
  duration: number,
  gainPeak: number,
  attackT = 0.01,
  releaseT = 0.08,
  detune = 0,
  destination?: AudioNode
) {
  if (!_enabled) return;
  const c = ctx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  osc.connect(g);
  g.connect(destination ?? master());
  const now = c.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gainPeak, now + attackT);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration - releaseT);
  osc.start(now);
  osc.stop(now + duration);
}

function playNoise(
  duration: number,
  gainPeak: number,
  lowFreq: number,
  highFreq: number,
  attackT = 0.005,
  destination?: AudioNode
) {
  if (!_enabled) return;
  const c = ctx();
  const bufLen = Math.ceil(c.sampleRate * duration);
  const buf = c.createBuffer(1, bufLen, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buf;

  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = (lowFreq + highFreq) / 2;
  filter.Q.value = (lowFreq + highFreq) / (2 * (highFreq - lowFreq + 1));

  const g = c.createGain();
  src.connect(filter);
  filter.connect(g);
  g.connect(destination ?? master());

  const now = c.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gainPeak, now + attackT);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration - 0.02);
  src.start(now);
  src.stop(now + duration);
}

// ─── 발걸음 ──────────────────────────────────────────────────────────────────
let _lastStepTime = 0;

export function playFootstep(dimension: 1 | 2 | 3, speed = 1.0) {
  if (!_enabled) return;
  const now = performance.now();
  const interval = 320 / speed;
  if (now - _lastStepTime < interval) return;
  _lastStepTime = now;

  if (dimension === 1) {
    // 나무 바닥 삐걱
    playNoise(0.055, 0.22, 180, 600, 0.003);
    playTone(120 + Math.random() * 40, "sine", 0.08, 0.12, 0.003, 0.06);
  } else if (dimension === 2) {
    // 잔디 바스락
    playNoise(0.08, 0.18, 800, 4000, 0.002);
    playNoise(0.04, 0.10, 200, 800, 0.003);
  } else {
    // 타일 울림
    const freq = 280 + Math.random() * 60;
    playTone(freq, "sine", 0.18, 0.18, 0.002, 0.14);
    playNoise(0.06, 0.14, 400, 1200, 0.002);
  }
}

// ─── 포탈 진입 ────────────────────────────────────────────────────────────────
export function playPortalEnter() {
  if (!_enabled) return;
  const c = ctx();
  // 휩쓸리는 소리 + 음조 상승
  for (let i = 0; i < 4; i++) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(80 + i * 60, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800 + i * 200, c.currentTime + 0.9);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.18 - i * 0.03, c.currentTime + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.9);
    osc.connect(g);
    g.connect(master());
    osc.start(c.currentTime + i * 0.04);
    osc.stop(c.currentTime + 0.95);
  }
  playNoise(0.9, 0.25, 200, 3000, 0.05);
}

// ─── 차원 전환 ────────────────────────────────────────────────────────────────
export function playDimensionTransition() {
  if (!_enabled) return;
  const c = ctx();
  // 깊은 울림
  for (const freq of [55, 82, 110]) {
    playTone(freq, "sine", 1.4, 0.28, 0.02, 0.4, 0);
  }
  // 고주파 찰랑
  playTone(1200, "sine", 0.35, 0.15, 0.005, 0.3);
  playNoise(0.5, 0.2, 100, 400, 0.02);
}

// ─── 문 상호작용 ──────────────────────────────────────────────────────────────
export function playKeyTurn() {
  if (!_enabled) return;
  // 열쇠 돌아가는 소리
  playNoise(0.12, 0.28, 600, 2000, 0.005);
  playTone(340, "triangle", 0.15, 0.2, 0.01, 0.1);
}

export function playDoorCreak() {
  if (!_enabled) return;
  const c = ctx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(180, c.currentTime);
  osc.frequency.linearRampToValueAtTime(60, c.currentTime + 1.2);
  g.gain.setValueAtTime(0.22, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.3);
  osc.connect(g); g.connect(master());
  osc.start(c.currentTime); osc.stop(c.currentTime + 1.3);
  playNoise(0.5, 0.15, 80, 400, 0.01);
}

// ─── 공 관련 ─────────────────────────────────────────────────────────────────
export function playBallCollect() {
  if (!_enabled) return;
  // 맑은 차임 소리
  for (let i = 0; i < 3; i++) {
    playTone(660 + i * 220, "sine", 0.3, 0.22 - i * 0.06, 0.003, 0.25);
  }
}

export function playBallThrow() {
  if (!_enabled) return;
  // 휙 소리
  playNoise(0.12, 0.3, 400, 3000, 0.003);
  playTone(200, "sine", 0.12, 0.15, 0.003, 0.08);
}

export function playBallBounce() {
  if (!_enabled) return;
  playTone(120 + Math.random() * 40, "sine", 0.08, 0.18, 0.002, 0.07);
  playNoise(0.05, 0.12, 300, 800, 0.002);
}

// ─── 엔티티 관련 ──────────────────────────────────────────────────────────────
let _lastEntitySoundTime = 0;

export function playEntityApproach(dist: number, dimension: 1 | 2 | 3) {
  if (!_enabled) return;
  const now = performance.now();
  if (now - _lastEntitySoundTime < 1800) return;
  if (dist > 12) return;
  _lastEntitySoundTime = now;

  const vol = Math.max(0, 1 - dist / 12) * 0.25;
  if (dimension === 1) {
    // 낮은 으스스한 숨소리
    playTone(55, "sine", 0.8, vol * 0.9, 0.15, 0.4, Math.random() * 10);
    playNoise(0.4, vol * 0.5, 80, 200, 0.1);
  } else if (dimension === 2) {
    // 꽃눈 엔티티: 고주파 울림
    playTone(440, "sine", 0.4, vol * 0.6, 0.05, 0.3, Math.random() * 20 - 10);
    playTone(220, "sine", 0.6, vol * 0.4, 0.08, 0.5);
  } else {
    // 3차원 유령: 낮은 메아리
    playTone(110, "sine", 1.0, vol * 0.8, 0.2, 0.6);
    playNoise(0.6, vol * 0.4, 100, 300, 0.1);
  }
}

export function playGazeDeath() {
  if (!_enabled) return;
  // 극적인 사망 스팅어
  for (const freq of [55, 110, 165, 220, 440]) {
    playTone(freq, "sine", 2.0, 0.3, 0.01, 1.0, Math.random() * 20 - 10);
  }
  playNoise(2.0, 0.4, 50, 500, 0.02);
}

export function playFalling() {
  if (!_enabled) return;
  const c = ctx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(600, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, c.currentTime + 1.8);
  g.gain.setValueAtTime(0.28, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 2.0);
  osc.connect(g); g.connect(master());
  osc.start(c.currentTime); osc.stop(c.currentTime + 2.0);
  playNoise(2.0, 0.3, 100, 2000, 0.01);
}

// ─── 주변 환경음 (앰비언트) ──────────────────────────────────────────────────
function stopAmbient() {
  if (_ambientNode) {
    try {
      _ambientNode.stop();
    } catch {
      // ignore
    }
    _ambientNode = null;
  }
  if (_ambientGain) {
    _ambientGain.gain.cancelScheduledValues(_ctx!.currentTime);
    _ambientGain.gain.setValueAtTime(_ambientGain.gain.value, _ctx!.currentTime);
    _ambientGain.gain.linearRampToValueAtTime(0, _ctx!.currentTime + 0.5);
  }
}

function buildAmbientBuffer(dim: 1 | 2 | 3): AudioBuffer {
  const c = ctx();
  const dur = 4.0;
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(2, len, c.sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / c.sampleRate;
      let v = 0;
      if (dim === 1) {
        // 1차원: 낮은 윙윙거리는 드론
        v = Math.sin(2 * Math.PI * 55 * t) * 0.12
          + Math.sin(2 * Math.PI * 110.2 * t) * 0.06
          + Math.sin(2 * Math.PI * 27.5 * t) * 0.09
          + (Math.random() * 2 - 1) * 0.02;
      } else if (dim === 2) {
        // 2차원: 바람 + 새소리 느낌
        v = Math.sin(2 * Math.PI * 0.3 * t) * 0.1
          + (Math.random() * 2 - 1) * 0.06
          + Math.sin(2 * Math.PI * 880 * t) * Math.sin(2 * Math.PI * 0.7 * t) * 0.025
          + Math.sin(2 * Math.PI * 440 * t) * Math.sin(2 * Math.PI * 1.1 * t) * 0.02;
      } else {
        // 3차원: 학교 복도 형광등 윙 + 메아리
        v = Math.sin(2 * Math.PI * 120 * t) * 0.08
          + Math.sin(2 * Math.PI * 240 * t) * 0.04
          + Math.sin(2 * Math.PI * 60 * t) * 0.06
          + (Math.random() * 2 - 1) * 0.015;
      }
      data[i] = v;
    }
  }
  return buf;
}

export function setAmbient(dimension: 1 | 2 | 3) {
  if (!_enabled) return;
  if (_currentAmbientDim === dimension) return;
  _currentAmbientDim = dimension;

  const c = ctx();
  stopAmbient();

  setTimeout(() => {
    if (!_enabled) return;
    const buf = buildAmbientBuffer(dimension);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(_ambientGain!);
    _ambientNode = src;
    src.start();

    const targetVol = dimension === 1 ? 0.55 : dimension === 2 ? 0.38 : 0.42;
    _ambientGain!.gain.cancelScheduledValues(c.currentTime);
    _ambientGain!.gain.setValueAtTime(0, c.currentTime);
    _ambientGain!.gain.linearRampToValueAtTime(targetVol, c.currentTime + 1.2);
  }, 300);
}

// ─── 전역 제어 ────────────────────────────────────────────────────────────────
export function setSoundEnabled(enabled: boolean) {
  _enabled = enabled;
  if (!enabled) {
    stopAmbient();
    _currentAmbientDim = 0;
  }
}

export function getSoundEnabled(): boolean {
  return _enabled;
}

export function resumeAudio() {
  if (_ctx && _ctx.state === "suspended") _ctx.resume();
}
