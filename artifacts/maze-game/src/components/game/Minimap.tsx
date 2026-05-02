// 2D 미니맵 오버레이
import { useRef, useEffect } from "react";

interface MinimapProps {
  playerPos?: { x: number; z: number };
  mazeSize?: number;
  compact?: boolean;
}

export default function Minimap({ playerPos = { x: 2, z: 2 }, mazeSize = 12, compact = true }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const cellPx = size / mazeSize;

    ctx.clearRect(0, 0, size, size);

    // 배경
    ctx.fillStyle = "rgba(6, 2, 18, 0.85)";
    ctx.fillRect(0, 0, size, size);

    // 그리드 (간소화된 미로 표시)
    ctx.strokeStyle = "rgba(139, 92, 246, 0.3)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= mazeSize; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellPx, 0);
      ctx.lineTo(i * cellPx, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cellPx);
      ctx.lineTo(size, i * cellPx);
      ctx.stroke();
    }

    // 플레이어 위치
    const CELL_SIZE = 4;
    const px = (playerPos.x / CELL_SIZE) * cellPx;
    const pz = (playerPos.z / CELL_SIZE) * cellPx;

    // 탐색 범위 표시
    ctx.beginPath();
    ctx.arc(px, pz, cellPx * 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(139, 92, 246, 0.08)";
    ctx.fill();

    // 플레이어 마커
    ctx.beginPath();
    ctx.arc(px, pz, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#a78bfa";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();

  }, [playerPos, mazeSize]);

  const size = compact ? 80 : 160;

  return (
    <div
      className="absolute bottom-16 right-4 z-10 rounded-lg overflow-hidden"
      style={{ width: size, height: size, boxShadow: "0 0 20px rgba(139, 92, 246, 0.3)" }}
    >
      <canvas ref={canvasRef} width={size} height={size} data-testid="minimap-canvas" />
      <div className="absolute inset-0 border border-primary/20 rounded-lg pointer-events-none" />
    </div>
  );
}
