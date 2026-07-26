import type { FrameId, MatColor } from '@/types';

/**
 * 기획안 v2 §9: 액자 미리보기 샘플.
 * **미리보기 전용** — PDF/이미지 출력물에는 액자·매트지가 절대 포함되지 않는다.
 *
 * 몰딩은 단색으로 칠하고, 안쪽/바깥쪽 모서리에만 얇은 라인을 넣어 형태를 잡는다.
 */

/**
 * 액자·매트지 미리보기 노출 여부.
 * 현재는 숨김 — true로 바꾸면 액자 패널과 캔버스 오버레이가 다시 살아난다.
 * (기획안 v2 §9에서도 2차 릴리스 항목)
 */
export const FRAME_PREVIEW_ENABLED: boolean = false;

export interface FrameSample {
  id: FrameId;
  label: string;
  /** 몰딩 폭 (mm) */
  widthMm: number;
  /** 몰딩 단색 */
  fill: string;
  /** 몰딩 안쪽 모서리 라인 */
  innerEdge: string;
  /** 몰딩 바깥 모서리 라인 */
  outerEdge: string;
}

export const FRAME_SAMPLES: FrameSample[] = [
  {
    id: 'black',
    label: '블랙',
    widthMm: 18,
    fill: '#1c1c1f',
    innerEdge: '#000000',
    outerEdge: '#000000',
  },
  {
    id: 'white',
    label: '화이트',
    widthMm: 18,
    fill: '#f7f7f6',
    innerEdge: '#c8c6c2',
    outerEdge: '#b8b5b0',
  },
  {
    id: 'wood',
    label: '우드',
    widthMm: 22,
    fill: '#8b5e34',
    innerEdge: '#4a2f18',
    outerEdge: '#4a2f18',
  },
  {
    id: 'gold',
    label: '골드',
    widthMm: 20,
    fill: '#c9a227',
    innerEdge: '#6b4f0f',
    outerEdge: '#8a6d1f',
  },
  {
    id: 'silver',
    label: '실버',
    widthMm: 20,
    fill: '#b8c1cc',
    innerEdge: '#5b6b7d',
    outerEdge: '#7d8b9a',
  },
];

export function getFrameSample(id: FrameId): FrameSample | null {
  if (!FRAME_PREVIEW_ENABLED) return null;
  return FRAME_SAMPLES.find((f) => f.id === id) ?? null;
}

export const MAT_COLORS: Record<MatColor, { label: string; fill: string; bevel: string }> = {
  white: { label: '흰색', fill: '#ffffff', bevel: '#d6d3d1' },
  ivory: { label: '아이보리', fill: '#f5efe3', bevel: '#d8cdb8' },
};

/** 액자 미리보기가 캔버스에 더하는 여백(mm) — 편집 모드에서만 적용 */
export function framePaddingMm(frameId: FrameId, matWidthMm: number): number {
  const sample = getFrameSample(frameId);
  if (!sample) return 0;
  return sample.widthMm + matWidthMm;
}
