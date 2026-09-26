'use client';

// 캔버스 오른쪽 아래에 떠 있는 선택 사진 도구: 이동(상하좌우)·확대/축소·반전·삭제.
// 값은 editorStore(메모리)에만 반영한다. DOM 오버레이라 캔버스 내보내기 결과에는 찍히지 않는다.

import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/stores/editorStore';
import { NUDGE_MM } from './PaperCanvas';

// SettingsPanel의 TOOL_BTN과 같은 알약 버튼 — DESIGN.md: 크롬엔 그림자·장식 없이 1px 헤어라인만
const BTN =
  'flex h-11 min-w-11 items-center justify-center rounded-full border border-line px-3 text-sm text-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-focus lg:h-9 lg:min-w-9';

export default function PhotoToolbar() {
  const photo = useEditorStore((st) => st.photos.find((p) => p.id === st.selectedId));
  const { updatePhoto, removePhoto, zoomPhotoInCell, nudgePhotoInCell } = useEditorStore(
    useShallow((st) => ({
      updatePhoto: st.updatePhoto,
      removePhoto: st.removePhoto,
      zoomPhotoInCell: st.zoomPhotoInCell,
      nudgePhotoInCell: st.nudgePhotoInCell,
    })),
  );
  if (!photo) return null;

  // 화살표 방향 = 사진이 움직이는 방향 (범위 제한은 스토어의 clampOffset이 한다)
  const nudge = (dx: number, dy: number) => nudgePhotoInCell(photo.id, dx * NUDGE_MM, dy * NUDGE_MM);

  return (
    <div
      role="toolbar"
      aria-label="선택한 사진 도구"
      className="absolute bottom-4 right-4 flex flex-col items-center gap-2 rounded-lg border border-line bg-sheet p-3"
    >
      <div className="grid grid-cols-3 gap-1">
        <button className={`${BTN} col-start-2`} aria-label="사진 위로 이동" onClick={() => nudge(0, -1)}>↑</button>
        <button className={`${BTN} col-start-1 row-start-2`} aria-label="사진 왼쪽으로 이동" onClick={() => nudge(-1, 0)}>←</button>
        <button className={`${BTN} col-start-3 row-start-2`} aria-label="사진 오른쪽으로 이동" onClick={() => nudge(1, 0)}>→</button>
        <button className={`${BTN} col-start-2 row-start-3`} aria-label="사진 아래로 이동" onClick={() => nudge(0, 1)}>↓</button>
      </div>
      <div className="h-px w-full bg-line" />
      <div className="flex gap-1">
        <button className={BTN} aria-label="확대" title="확대" onClick={() => zoomPhotoInCell(photo.id, 1.1)}>＋</button>
        <button className={BTN} aria-label="축소" title="축소" onClick={() => zoomPhotoInCell(photo.id, 1 / 1.1)}>－</button>
      </div>
      <div className="flex gap-1">
        <button className={BTN} onClick={() => updatePhoto(photo.id, { scaleX: photo.scaleX === 1 ? -1 : 1 })}>좌우 반전</button>
        <button className={BTN} onClick={() => updatePhoto(photo.id, { scaleY: photo.scaleY === 1 ? -1 : 1 })}>상하 반전</button>
      </div>
      <div className="h-px w-full bg-line" />
      <button
        className="flex h-11 w-full items-center justify-center rounded-full border border-danger-line px-3 text-sm text-danger transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-focus lg:h-9"
        onClick={() => removePhoto(photo.id)}
      >
        삭제
      </button>
    </div>
  );
}
