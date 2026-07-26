'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect, Group, Image as KImage, Line, Circle } from 'react-konva';
import type Konva from 'konva';
import useImage from 'use-image';
import { useEditorStore } from '@/stores/editorStore';
import { useFrameStore } from '@/stores/frameStore';
import { mmToScreenPx, screenPxToMm } from '@/lib/convertMM';
import { framePaddingMm, getFrameSample } from '@/lib/frames';
import FramePreview from './FramePreview';
import type { LayoutCell, Photo, PhotoFrame } from '@/types';

/**
 * 기획안 v2 §5·§6·§9.
 * - 좌표계: Stage 자체는 화면 px, 모든 mm 값은 screenScale로 환산해 렌더
 * - Bleed 회색 반투명 / 재단선 실선 / 안전선(5mm) 점선
 * - 슬롯 clip + 내부 크롭 (cover 기준 zoom·offset)
 * - 액자·매트지는 미리보기 전용 (edit 모드에서만 렌더)
 *
 * mode='export'는 추출 전용 렌더다. 가이드(회색 bleed·재단선·안전선·재단 표시선·
 * 빈 슬롯 점선·선택 테두리·삭제 버튼)와 액자를 모두 숨겨 출력물에 찍히지 않게 하고,
 * Stage 크기를 정확히 "용지+bleed"로 되돌려 Editor의 crop 계산과 일치시킨다.
 */

/** 삭제 버튼 반경 (화면 px 고정 — 모바일 터치 타겟 확보) */
const DELETE_BADGE_R = 15;

/**
 * 사진 테두리 디자인(폴라로이드·인생네컷)을 셀 위에 오버레이로 그린다.
 * 출력물에도 반영되어야 하므로 edit/export 모드 모두에서 렌더한다.
 * (cw·ch: 셀 크기 화면 px)
 *
 * 20~30대가 실제로 찾는 "필름 감성"을 내기 위해 평면 테두리 대신
 * 비네트(사진 모서리 음영) + 테두리 베벨(입체감) + 미세 그림자 라인을 더한다.
 */
function PhotoFrameOverlay({ frame, cw, ch }: { frame: PhotoFrame; cw: number; ch: number }) {
  if (frame === 'none') return null;
  const unit = Math.min(cw, ch);
  const vignetteRadius = Math.max(cw, ch) * 0.72;

  if (frame === 'polaroid') {
    const s = unit * 0.06; // 상·좌·우
    const bottom = unit * 0.2; // 아래를 두껍게 (즉석사진 특유의 무게감)

    return (
      <Group listening={false}>
        {/* 필름 비네트: 사진 모서리를 살짝 어둡게 눌러 아날로그 느낌 */}
        <Rect
          x={0}
          y={0}
          width={cw}
          height={ch}
          fillRadialGradientStartPoint={{ x: cw / 2, y: ch / 2 }}
          fillRadialGradientStartRadius={0}
          fillRadialGradientEndPoint={{ x: cw / 2, y: ch / 2 }}
          fillRadialGradientEndRadius={vignetteRadius}
          fillRadialGradientColorStops={[0, 'rgba(0,0,0,0)', 0.72, 'rgba(0,0,0,0)', 1, 'rgba(20,16,10,0.28)']}
        />

        {/* 흰 테두리 (바깥→안쪽으로 살짝 어두워지는 베벨) */}
        <Rect
          x={0}
          y={0}
          width={cw}
          height={s}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: 0, y: s }}
          fillLinearGradientColorStops={[0, '#ffffff', 1, '#e9e7e2']}
        />
        <Rect
          x={0}
          y={0}
          width={s}
          height={ch}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: s, y: 0 }}
          fillLinearGradientColorStops={[0, '#ffffff', 1, '#e9e7e2']}
        />
        <Rect
          x={cw - s}
          y={0}
          width={s}
          height={ch}
          fillLinearGradientStartPoint={{ x: cw, y: 0 }}
          fillLinearGradientEndPoint={{ x: cw - s, y: 0 }}
          fillLinearGradientColorStops={[0, '#ffffff', 1, '#e9e7e2']}
        />
        {/* 하단 帯 — 살짝 아래로 그림자를 던져 카드가 들려 있는 듯한 무게감 */}
        <Rect
          x={0}
          y={ch - bottom}
          width={cw}
          height={bottom}
          fill="#ffffff"
          shadowColor="#000000"
          shadowBlur={unit * 0.05}
          shadowOpacity={0.28}
          shadowOffset={{ x: 0, y: -unit * 0.015 }}
        />

        {/* 사진이 테두리 아래로 살짝 눌린 듯한 내부 그림자 라인 */}
        <Rect
          x={s}
          y={s}
          width={cw - s * 2}
          height={unit * 0.025}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: 0, y: unit * 0.025 }}
          fillLinearGradientColorStops={[0, 'rgba(0,0,0,0.22)', 1, 'rgba(0,0,0,0)']}
        />
        <Rect
          x={s}
          y={s}
          width={unit * 0.02}
          height={ch - s - bottom}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: unit * 0.02, y: 0 }}
          fillLinearGradientColorStops={[0, 'rgba(0,0,0,0.18)', 1, 'rgba(0,0,0,0)']}
        />
        <Rect
          x={cw - s - unit * 0.02}
          y={s}
          width={unit * 0.02}
          height={ch - s - bottom}
          fillLinearGradientStartPoint={{ x: unit * 0.02, y: 0 }}
          fillLinearGradientEndPoint={{ x: 0, y: 0 }}
          fillLinearGradientColorStops={[0, 'rgba(0,0,0,0.18)', 1, 'rgba(0,0,0,0)']}
        />
      </Group>
    );
  }

  // life4cut: 진한 프레임 + 강한 비네트 + 유광 하이라이트 (포토부스 필름 느낌)
  const s = unit * 0.05;
  return (
    <Group listening={false}>
      {/* 강한 비네트: 네컷 특유의 눌린 듯한 대비감 */}
      <Rect
        x={0}
        y={0}
        width={cw}
        height={ch}
        fillRadialGradientStartPoint={{ x: cw / 2, y: ch / 2 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: cw / 2, y: ch / 2 }}
        fillRadialGradientEndRadius={vignetteRadius}
        fillRadialGradientColorStops={[0, 'rgba(0,0,0,0)', 0.62, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0.42)']}
      />
      {/* 상단 유광 하이라이트 — 인화지 특유의 반사광 */}
      <Rect
        x={s}
        y={s}
        width={cw - s * 2}
        height={ch * 0.16}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
        fillLinearGradientEndPoint={{ x: 0, y: ch * 0.16 }}
        fillLinearGradientColorStops={[0, 'rgba(255,255,255,0.22)', 1, 'rgba(255,255,255,0)']}
      />

      {/* 진한 프레임 (바깥→안쪽 베벨) */}
      <Rect
        x={0}
        y={0}
        width={cw}
        height={s}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
        fillLinearGradientEndPoint={{ x: 0, y: s }}
        fillLinearGradientColorStops={[0, '#242424', 1, '#0a0a0a']}
      />
      <Rect
        x={0}
        y={ch - s}
        width={cw}
        height={s}
        fillLinearGradientStartPoint={{ x: 0, y: ch }}
        fillLinearGradientEndPoint={{ x: 0, y: ch - s }}
        fillLinearGradientColorStops={[0, '#242424', 1, '#0a0a0a']}
        shadowColor="#000000"
        shadowBlur={unit * 0.04}
        shadowOpacity={0.35}
        shadowOffset={{ x: 0, y: -unit * 0.01 }}
      />
      <Rect
        x={0}
        y={0}
        width={s}
        height={ch}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
        fillLinearGradientEndPoint={{ x: s, y: 0 }}
        fillLinearGradientColorStops={[0, '#242424', 1, '#0a0a0a']}
      />
      <Rect
        x={cw - s}
        y={0}
        width={s}
        height={ch}
        fillLinearGradientStartPoint={{ x: cw, y: 0 }}
        fillLinearGradientEndPoint={{ x: cw - s, y: 0 }}
        fillLinearGradientColorStops={[0, '#242424', 1, '#0a0a0a']}
      />
    </Group>
  );
}

function PhotoInCell({
  photo,
  cell,
  scale,
  selected,
  interactive,
  draggable,
  onCellTap,
  photoFrame,
}: {
  photo: Photo;
  cell: LayoutCell;
  scale: number;
  selected: boolean;
  /** edit 모드 여부 — false면 선택 테두리·삭제 버튼을 렌더하지 않음 */
  interactive: boolean;
  /** 핀치 중에는 드래그를 막아 두 제스처가 충돌하지 않게 한다 */
  draggable: boolean;
  /** 배치 대기 중인 사진이 있으면 교체하고 true 반환 */
  onCellTap: () => boolean;
  photoFrame: PhotoFrame;
}) {
  const [img] = useImage(photo.src, 'anonymous');
  const { select, nudgePhotoInCell, zoomPhotoInCell, removePhoto } = useEditorStore();
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState(false);

  const cw = mmToScreenPx(cell.width, scale);
  const ch = mmToScreenPx(cell.height, scale);
  const pw = mmToScreenPx(photo.width * photo.zoom, scale);
  const ph = mmToScreenPx(photo.height * photo.zoom, scale);

  const setCursor = (node: Konva.Node, cursor: string) => {
    const stage = node.getStage();
    if (stage) stage.container().style.cursor = cursor;
  };

  // 데스크탑은 hover, 모바일은 선택(탭) 시 노출
  const showDelete = interactive && (hovered || selected);

  return (
    <Group
      x={mmToScreenPx(cell.x, scale)}
      y={mmToScreenPx(cell.y, scale)}
      clipX={0}
      clipY={0}
      clipWidth={cw}
      clipHeight={ch}
      onClick={() => {
        if (!onCellTap()) select(photo.id);
      }}
      onTap={() => {
        if (!onCellTap()) select(photo.id);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
        draggable={draggable}
        onMouseEnter={(e) => interactive && setCursor(e.target, 'move')}
        onMouseLeave={(e) => interactive && setCursor(e.target, 'default')}
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

      {/* 사진 테두리 디자인 (출력물에도 반영) */}
      <PhotoFrameOverlay frame={photoFrame} cw={cw} ch={ch} />

      {interactive && selected && (
        <Rect x={0} y={0} width={cw} height={ch} stroke="#9d7a54" strokeWidth={2} listening={false} />
      )}

      {/* 사진 위에 커서를 올리면(모바일: 선택하면) 나타나는 삭제 버튼 */}
      {showDelete && (
        <Group
          x={cw - DELETE_BADGE_R - 8}
          y={DELETE_BADGE_R + 8}
          onMouseEnter={(e) => setCursor(e.target, 'pointer')}
          onMouseLeave={(e) => setCursor(e.target, 'default')}
          onClick={(e) => {
            e.cancelBubble = true;
            setCursor(e.target, 'default');
            removePhoto(photo.id);
          }}
          onTap={(e) => {
            e.cancelBubble = true;
            removePhoto(photo.id);
          }}
        >
          <Circle radius={DELETE_BADGE_R} fill="rgba(24,24,27,0.72)" stroke="#ffffff" strokeWidth={1.5} />
          <Line points={[-5, -5, 5, 5]} stroke="#ffffff" strokeWidth={2} lineCap="round" />
          <Line points={[5, -5, -5, 5]} stroke="#ffffff" strokeWidth={2} lineCap="round" />
        </Group>
      )}
    </Group>
  );
}

export default function PaperCanvas({
  stageOut,
  mode = 'edit',
  placingId = null,
  onPlaced,
}: {
  stageOut?: React.MutableRefObject<Konva.Stage | null>;
  mode?: 'edit' | 'export';
  /** 모바일 탭-투-배치: 라이브러리에서 고른 사진 id (드래그가 불가능한 터치 환경용) */
  placingId?: string | null;
  onPlaced?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  useEffect(() => {
    if (stageOut) stageOut.current = stageRef.current;
  });
  const [scale, setScale] = useState(2); // px per mm
  const [pinching, setPinching] = useState(false);
  const pinchDist = useRef(0);
  const {
    widthMm,
    heightMm,
    bleedMm,
    cells,
    photos,
    selectedId,
    photoFrame,
    select,
    removePhoto,
    assignToCell,
    zoomPhotoInCell,
  } = useEditorStore();
  const { frame, matWidthMm, matColor } = useFrameStore();

  const isEdit = mode === 'edit';
  const totalW = widthMm + bleedMm * 2;
  const totalH = heightMm + bleedMm * 2;

  // 액자 미리보기는 편집 모드에서만 캔버스를 넓힌다 (export는 용지+bleed 그대로)
  const frameSample = getFrameSample(frame);
  const padMm = isEdit ? framePaddingMm(frame, matWidthMm) : 0;
  const outerW = totalW + padMm * 2;
  const outerH = totalH + padMm * 2;

  // screenScale: 컨테이너에 맞춰 동적 계산 (기획안 v2 §3)
  const recalc = useCallback(() => {
    const el = containerRef.current;
    if (!el || el.clientWidth === 0) return;
    const pad = 32;
    const s = Math.min((el.clientWidth - pad) / outerW, (el.clientHeight - pad) / outerH);
    setScale(Math.max(0.5, s));
  }, [outerW, outerH]);

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

  const stageW = mmToScreenPx(outerW, scale);
  const stageH = mmToScreenPx(outerH, scale);
  const paperW = mmToScreenPx(totalW, scale);
  const paperH = mmToScreenPx(totalH, scale);
  const padPx = mmToScreenPx(padMm, scale);
  const framePx = mmToScreenPx(frameSample && isEdit ? frameSample.widthMm : 0, scale);
  const matPx = mmToScreenPx(frameSample && isEdit ? matWidthMm : 0, scale);
  const bleedPx = mmToScreenPx(bleedMm, scale);

  /** 화면 좌표(px, stage 기준) → 재단선 원점 mm */
  const toPaperMm = (x: number, y: number) => ({
    xMm: screenPxToMm(x - padPx, scale) - bleedMm,
    yMm: screenPxToMm(y - padPx, scale) - bleedMm,
  });

  /** 배치 대기 중인 사진이 있으면 해당 슬롯에 넣고 true 반환 */
  const handleCellTap = (cellId: string): boolean => {
    if (!placingId || !isEdit) return false;
    assignToCell(placingId, cellId);
    onPlaced?.();
    return true;
  };

  const cellAt = (xMm: number, yMm: number) =>
    cells.find((c) => xMm >= c.x && xMm <= c.x + c.width && yMm >= c.y && yMm <= c.y + c.height);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const libraryId = e.dataTransfer.getData('application/x-library-id');
    if (!libraryId || !stageRef.current) return;
    stageRef.current.setPointersPositions(e.nativeEvent);
    const pos = stageRef.current.getPointerPosition();
    if (!pos) return;
    const { xMm, yMm } = toPaperMm(pos.x, pos.y);
    const cell = cellAt(xMm, yMm);
    if (cell) assignToCell(libraryId, cell.id);
  };

  /** 모바일: 두 손가락 핀치로 슬롯 안 사진 확대/축소 (드래그는 Konva 기본 터치 드래그) */
  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length !== 2) return;
    e.evt.preventDefault();
    if (!pinching) setPinching(true);

    const [t0, t1] = [touches[0], touches[1]];
    const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
    const prev = pinchDist.current;
    pinchDist.current = dist;
    if (!prev) return;

    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.container().getBoundingClientRect();
    const mx = (t0.clientX + t1.clientX) / 2 - rect.left;
    const my = (t0.clientY + t1.clientY) / 2 - rect.top;
    const { xMm, yMm } = toPaperMm(mx, my);
    const cell = cellAt(xMm, yMm);
    const target = photos.find((p) => p.cellId === cell?.id) ?? photos.find((p) => p.id === selectedId);
    if (target) zoomPhotoInCell(target.id, dist / prev);
  };

  const endPinch = () => {
    pinchDist.current = 0;
    if (pinching) setPinching(false);
  };

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full select-none items-center justify-center overflow-hidden bg-stone-200 p-2 md:p-4"
      style={{ WebkitTouchCallout: 'none' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <Stage
        ref={stageRef}
        width={stageW}
        height={stageH}
        className="shadow-xl"
        onTouchMove={onTouchMove}
        onTouchEnd={endPinch}
        onTouchCancel={endPinch}
      >
        <Layer>
          {/* 액자 + 매트지 (미리보기 전용, edit 모드에서만) */}
          {isEdit && frameSample && (
            <FramePreview
              frameId={frame}
              matColor={matColor}
              outerW={stageW}
              outerH={stageH}
              framePx={framePx}
              matPx={matPx}
            />
          )}

          <Group x={padPx} y={padPx}>
            {/* Bleed 배경 (회색) — 추출 시에는 흰색으로 */}
            <Rect
              x={0}
              y={0}
              width={paperW}
              height={paperH}
              fill={isEdit ? '#d6d3d1' : '#ffffff'}
              shadowColor="#000000"
              shadowBlur={padPx > 0 ? 12 : 0}
              shadowOpacity={padPx > 0 ? 0.35 : 0}
            />
            {/* 실제 용지 (흰색) — bleed 안쪽 */}
            <Rect x={bleedPx} y={bleedPx} width={paperW - bleedPx * 2} height={paperH - bleedPx * 2} fill="#ffffff" />

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
                    interactive={isEdit}
                    draggable={isEdit && !pinching}
                    onCellTap={() => handleCellTap(cell.id)}
                    photoFrame={photoFrame}
                  />
                ) : isEdit ? (
                  <Rect
                    key={cell.id}
                    x={mmToScreenPx(cell.x, scale)}
                    y={mmToScreenPx(cell.y, scale)}
                    width={mmToScreenPx(cell.width, scale)}
                    height={mmToScreenPx(cell.height, scale)}
                    fill={placingId ? '#fdf6ec' : '#f5f5f4'}
                    stroke={placingId ? '#9d7a54' : '#e7e5e1'}
                    strokeWidth={placingId ? 2 : 1}
                    onClick={() => handleCellTap(cell.id)}
                    onTap={() => handleCellTap(cell.id)}
                    onMouseEnter={(e) => {
                      const st = e.target.getStage();
                      if (st && placingId) st.container().style.cursor = 'copy';
                    }}
                    onMouseLeave={(e) => {
                      const st = e.target.getStage();
                      if (st) st.container().style.cursor = 'default';
                    }}
                  />
                ) : null;
              })}
            </Group>

            {isEdit && (
              <>
                {/* 재단선 (실선) */}
                <Rect
                  x={bleedPx}
                  y={bleedPx}
                  width={paperW - bleedPx * 2}
                  height={paperH - bleedPx * 2}
                  stroke="#78716c"
                  strokeWidth={1}
                  listening={false}
                />
                {/* 재단 표시선 (모서리) */}
                {[0, 1, 2, 3].map((i) => {
                  const cx = i % 2 === 0 ? bleedPx : paperW - bleedPx;
                  const cy = i < 2 ? bleedPx : paperH - bleedPx;
                  const dx = i % 2 === 0 ? -1 : 1;
                  const dy = i < 2 ? -1 : 1;
                  return (
                    <Group key={i} listening={false}>
                      <Line points={[cx, cy + dy * 4, cx, cy + dy * bleedPx]} stroke="#57534e" strokeWidth={1} />
                      <Line points={[cx + dx * 4, cy, cx + dx * bleedPx, cy]} stroke="#57534e" strokeWidth={1} />
                    </Group>
                  );
                })}
              </>
            )}
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}

export { PaperCanvas };
