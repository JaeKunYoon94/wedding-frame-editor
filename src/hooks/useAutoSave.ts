"use client";

import { useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { loadProjectState, saveProjectState } from "@/lib/storage";

/**
 * 기획안 v2 §8: 상태 변경 2초 디바운스 후 IndexedDB 저장.
 * 이미지 src(object URL)는 세션 한정이므로 직렬화 대상에서 제외하고
 * originalKey 기준으로 복구한다. (복구 시 원본 재로딩은 1차 내 TODO)
 */
export function useAutoSave() {
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const unsub = useEditorStore.subscribe((s) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void saveProjectState({
          paperId: s.paperId,
          widthMm: s.widthMm,
          heightMm: s.heightMm,
          orientation: s.orientation,
          bleedMm: s.bleedMm,
          layoutType: s.layoutType,
          gutterMm: s.gutterMm,
          savedAt: Date.now(),
        });
      }, 2000);
    });
    return () => {
      unsub();
      clearTimeout(timer.current);
    };
  }, []);
}

export async function tryRestore(): Promise<boolean> {
  const saved = await loadProjectState<Record<string, unknown>>();
  if (!saved) return false;
  useEditorStore.getState().hydrate(saved as never);
  return true;
}
