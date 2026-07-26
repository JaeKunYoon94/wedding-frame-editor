'use client';

import { Group, Line, Rect } from 'react-konva';
import { getFrameSample, MAT_COLORS } from '@/lib/frames';
import type { FrameId, MatColor } from '@/types';

/**
 * 기획안 v2 §9: 액자 + 매트지 미리보기 오버레이.
 * **미리보기 전용** — export 모드에서는 아예 렌더되지 않으므로 출력물에 포함될 수 없다.
 *
 * 좌표는 모두 화면 px. (0,0)이 액자 바깥 모서리, 안쪽에 매트지, 그 안이 용지.
 * 몰딩은 단색이며, 4변을 마이터 조인된 사다리꼴로 그려 모서리 이음매만 표현한다.
 */
export default function FramePreview({
  frameId,
  matColor,
  outerW,
  outerH,
  framePx,
  matPx,
}: {
  frameId: FrameId;
  matColor: MatColor;
  outerW: number;
  outerH: number;
  /** 몰딩 폭 px */
  framePx: number;
  /** 매트지 폭 px */
  matPx: number;
}) {
  const sample = getFrameSample(frameId);
  if (!sample) return null;

  const f = framePx;
  const W = outerW;
  const H = outerH;
  const mat = MAT_COLORS[matColor];

  /** 마이터 조인된 몰딩 4변 */
  const sides: number[][] = [
    [0, 0, W, 0, W - f, f, f, f], // 상
    [0, H, W, H, W - f, H - f, f, H - f], // 하
    [0, 0, 0, H, f, H - f, f, f], // 좌
    [W, 0, W, H, W - f, H - f, W - f, f], // 우
  ];

  return (
    <Group listening={false}>
      {/* 매트지 (몰딩 안쪽 전체를 덮고, 용지 부분은 위 레이어가 덮음) */}
      {matPx > 0 && (
        <Rect x={f} y={f} width={W - f * 2} height={H - f * 2} fill={mat.fill} />
      )}

      {/* 몰딩 4변 (단색 + 마이터 이음매) */}
      {sides.map((points, i) => (
        <Line
          key={i}
          points={points}
          closed
          fill={sample.fill}
          stroke={sample.innerEdge}
          strokeWidth={0.5}
        />
      ))}

      {/* 몰딩 바깥/안쪽 모서리 라인 */}
      <Rect x={0.5} y={0.5} width={W - 1} height={H - 1} stroke={sample.outerEdge} strokeWidth={1} />
      <Rect
        x={f}
        y={f}
        width={W - f * 2}
        height={H - f * 2}
        stroke={sample.innerEdge}
        strokeWidth={1}
      />

      {/* 매트지 창(용지 개구부) 베벨 — 안쪽으로 45° 컷 느낌 */}
      {matPx > 0 && (
        <Rect
          x={f + matPx - 1}
          y={f + matPx - 1}
          width={W - (f + matPx) * 2 + 2}
          height={H - (f + matPx) * 2 + 2}
          stroke={mat.bevel}
          strokeWidth={2}
        />
      )}
    </Group>
  );
}
