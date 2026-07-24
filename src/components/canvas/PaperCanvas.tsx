'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect, Group, Image as KImage, Line } from 'react-konva';
import type Konva from 'konva';
import useImage from 'use-image';
import { SAFE_AREA_MM, useEditorStore } from '@/stores/editorStore';
import { mmToScreenPx, screenPxToMm } from '@/lib/convertMM';
import type { LayoutCell, Photo } from '@/types';

/**
 * 기획안 v2 §5·§6.
 * - 좌표계: Stage 자체는 화면 px, 모든 mm 값은 screenScale로 환산해 렌더
 * - Bleed 회색 반투명 / 재단선 실선 / 안전선(5mm) 점선
 * - 슬롯 clip + 내부 크롭 (cover 기준 zoom·offset)
 */

function PhotoInCell({
  photo,
  cell,
  scale,
  selected,
}: {
  photo: Photo;
  cell: LayoutCell;
  scale: number;
  selected: boolean;
}) {
  const [img] = useImage(photo.src, 'anonymous');
  const { select, nudgePhotoInCell, zoomPhotoInCell } = useEditorStore();
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

  const cw = mmToScreenPx(cell.width, scale);
  const ch = mmToScreenPx(cell.height, scale);
  const pw = mmToScreenPx(photo.width * photo.zoom, scale);
  const ph = mmToScreenPx(photo.height * photo.zoom, scale);

  return (
    <Group
      x={mmToScreenPx(cell.x, scale)}
      y={mmToScreenPx(cell.y, scale)}
      clipX={0}
      clipY={0}
      clipWidth={cw}
      clipHeight={ch}
      onClick={() => select(photo.id)}
      onTap={() => select(photo.id)}
      onWheel={(e) => {
        e.evt.preventDefault();
        zoomPhotoInCell(photo.id, e.evt.deltaY < 0 ? 1.05 : 1 / 1.05);
      }}
    >
      <KImage
        image={img}
        x={cw / 2 + mmToScreenPx(photo.offsetX, scale)}
        y={ch / 2 + mmToScreenPx(photo.offsetY, scale)}
        offsetX={pw / 2}
        offsetY={ph / 2}
        width={pw}
        height={ph}
        rotation={photo.rotation}
        scaleX={photo.scaleX}
        scaleY={photo.scaleY}
        draggable
        onDragStart={(e) => {
          dragOrigin.current = { x: e.target.x(), y: e.target.y() };
        }}
        onDragEnd={(e) => {
          const o = dragOrigin.current;
          if (!o) return;
          nudgePhotoInCell(
            photo.id,
            screenPxToMm(e.target.x() - o.x, scale),
            screenPxToMm(e.target.y() - o.y, scale),
          );
          // 위치는 스토어 상태(mm)에서 다시 파생되므로 노드 좌표 원복
          e.target.position({ x: cw / 2 + mmToScreenPx(photo.offsetX, scale), y: ch / 2 + mmToScreenPx(photo.offsetY, scale) });
          dragOrigin.current = null;
        }}
      />
      {selected && (
        <Rect x={0} y={0} width={cw} height={ch} stroke="#9d7a54" strokeWidth={2} listening={false} />
      )}
    </Group>
  );
}

export default function PaperCanvas({ stageOut }: { stageOut?: React.MutableRefObject<Konva.Stage | null> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  useEffect(() => {
    if (stageOut) stageOut.current = stageRef.current;
  });
  const [scale, setScale] = useState(2); // px per mm
  const { widthMm, heightMm, bleedMm, cells, photos, selectedId, select, removePhoto, assignToCell } =
    useEditorStore();

  const totalW = widthMm + bleedMm * 2;
  const totalH = heightMm + bleedMm * 2;

  // screenScale: 컨테이너에 맞춰 동적 계산 (기획안 v2 §3)
  const recalc = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const pad = 32;
    const s = Math.min((el.clientWidth - pad) / totalW, (el.clientHeight - pad) / totalH);
    setScale(Math.max(0.5, s));
  }, [totalW, totalH]);

  useEffect(() => {
    recalc();
    const ro = new ResizeObserver(recalc);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [recalc]);

  // Delete / ESC 키 (기획안 v2 §8)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) removePhoto(selectedId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, select, removePhoto]);

  const stageW = mmToScreenPx(totalW, scale);
  const stageH = mmToScreenPx(totalH, scale);
  const bleedPx = mmToScreenPx(bleedMm, scale);
  const safePx = mmToScreenPx(SAFE_AREA_MM, scale);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const libraryId = e.dataTransfer.getData('application/x-library-id');
    if (!libraryId || !stageRef.current) return;
    stageRef.current.setPointersPositions(e.nativeEvent);
    const pos = stageRef.current.getPointerPosition();
    if (!pos) return;
    const xMm = screenPxToMm(pos.x, scale) - bleedMm;
    const yMm = screenPxToMm(pos.y, scale) - bleedMm;
    const cell = cells.find(
      (c) => xMm >= c.x && xMm <= c.x + c.width && yMm >= c.y && yMm <= c.y + c.height,
    );
    if (cell) assignToCell(libraryId, cell.id);
  };

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center overflow-hidden bg-stone-200"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <Stage ref={stageRef} width={stageW} height={stageH} className="shadow-xl">
        <Layer>
          {/* Bleed 배경 (회색) */}
          <Rect x={0} y={0} width={stageW} height={stageH} fill="#d6d3d1" />
          {/* 실제 용지 (흰색) — bleed 안쪽 */}
          <Rect x={bleedPx} y={bleedPx} width={stageW - bleedPx * 2} height={stageH - bleedPx * 2} fill="#ffffff" />

          {/* 슬롯 + 사진 (재단선 원점 기준 그룹) */}
          <Group x={bleedPx} y={bleedPx}>
            {cells.map((cell) => {
              const photo = photos.find((p) => p.cellId === cell.id);
              return photo ? (
                <PhotoInCell
                  key={cell.id}
                  photo={photo}
                  cell={cell}
                  scale={scale}
                  selected={photo.id === selectedId}
                />
              ) : (
                <Rect
                  key={cell.id}
                  x={mmToScreenPx(cell.x, scale)}
                  y={mmToScreenPx(cell.y, scale)}
                  width={mmToScreenPx(cell.width, scale)}
                  height={mmToScreenPx(cell.height, scale)}
                  fill="#f5f5f4"
                  stroke="#d6d3d1"
                  strokeWidth={1}
                  dash={[6, 4]}
                />
              );
            })}
          </Group>

          {/* 재단선 (실선) */}
          <Rect
            x={bleedPx}
            y={bleedPx}
            width={stageW - bleedPx * 2}
            height={stageH - bleedPx * 2}
            stroke="#78716c"
            strokeWidth={1}
            listening={false}
          />
          {/* 안전선 (점선, 재단선 안쪽 5mm 고정) */}
          <Rect
            x={bleedPx + safePx}
            y={bleedPx + safePx}
            width={stageW - (bleedPx + safePx) * 2}
            height={stageH - (bleedPx + safePx) * 2}
            stroke="#a8a29e"
            strokeWidth={1}
            dash={[4, 4]}
            listening={false}
          />
          {/* 재단 표시선 (모서리) */}
          {[0, 1, 2, 3].map((i) => {
            const cx = i % 2 === 0 ? bleedPx : stageW - bleedPx;
            const cy = i < 2 ? bleedPx : stageH - bleedPx;
            const dx = i % 2 === 0 ? -1 : 1;
            const dy = i < 2 ? -1 : 1;
            return (
              <Group key={i} listening={false}>
                <Line points={[cx, cy + dy * 4, cx, cy + dy * bleedPx]} stroke="#57534e" strokeWidth={1} />
                <Line points={[cx + dx * 4, cy, cx + dx * bleedPx, cy]} stroke="#57534e" strokeWidth={1} />
              </Group>
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}

export { PaperCanvas };
