'use client';

import { create } from 'zustand';
import type { FrameId, MatColor, MatWidthMm } from '@/types';

/**
 * 기획안 v2 §13: 액자는 미리보기 전용이므로 Undo/Redo 대상이 아니다.
 * → editorStore(temporal)와 분리된 별도 스토어.
 */
interface FrameState {
  frame: FrameId;
  matWidthMm: MatWidthMm;
  matColor: MatColor;
  setFrame: (frame: FrameId) => void;
  setMatWidth: (matWidthMm: MatWidthMm) => void;
  setMatColor: (matColor: MatColor) => void;
}

export const useFrameStore = create<FrameState>((set) => ({
  frame: 'none',
  matWidthMm: 0,
  matColor: 'white',
  setFrame: (frame) => set({ frame }),
  setMatWidth: (matWidthMm) => set({ matWidthMm }),
  setMatColor: (matColor) => set({ matColor }),
}));
