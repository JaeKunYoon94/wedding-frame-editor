'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect, Group, Image as KImage, Line, Circle, Text as KText } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { useEditorStore } from '@/stores/editorStore';
import { useFrameStore } from '@/stores/frameStore';
import { mmToScreenPx, screenPxToMm } from '@/lib/convertMM';
import { framePaddingMm, getFrameSample } from '@/lib/frames';
import { loadOriginal } from '@/lib/storage';
import FramePreview from './FramePreview';
import type { LayoutCell, Photo, PhotoFrame, TextBox } from '@/types';

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

/** 삭제 버튼 반경 (화면 px 고정) — 데스크탑은 넉넉하게, 모바일은 캔버스를 덜 가리도록 살짝 작게 */
const DELETE_BADGE_R = 15;
const DELETE_BADGE_R_MOBILE = 11;

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

/** 모바일에서 슬롯 이동을 허용하기까지 눌러 대기해야 하는 시간(ms) */
const LONG_PRESS_MS = 350;
/** 이 거리(px) 이상 손가락이 움직이면 누르기를 취소하고 일반 스와이프로 취급 */
const LONG_PRESS_MOVE_TOLERANCE_PX = 8;

function PhotoInCell({
  photo,
  cell,
  scale,
  selected,
  interactive,
  draggable,
  onCellTap,
  photoFrame,
  deleteBadgeR,
  canMoveAcrossCells,
  isMobile,
  resolveCellAtStagePoint,
  onDragHoverChange,
  onReadyChange,
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
  /** 삭제 버튼 반경(화면 px) — 모바일에서는 더 작게 */
  deleteBadgeR: number;
  /** 슬롯이 2개 이상일 때만 다른 슬롯으로 드래그 이동을 허용 */
  canMoveAcrossCells: boolean;
  /** 모바일에서는 꾹 눌러야만 슬롯 이동이 활성화된다 (짧은 스와이프는 기존처럼 크롭 위치만 조정) */
  isMobile: boolean;
  /** 스테이지 기준 px 좌표가 속한 슬롯을 찾는다 */
  resolveCellAtStagePoint: (x: number, y: number) => LayoutCell | undefined;
  /** 드래그 중 대상 슬롯이 바뀔 때마다 호출 (하이라이트 표시용) */
  onDragHoverChange: (cellId: string | null) => void;
  /** 이 슬롯의 이미지(흑백 변환 포함)가 실제로 그릴 준비가 됐는지 알림 (추출 캡처 타이밍용) */
  onReadyChange?: (photoId: string, src: string, ready: boolean) => void;
}) {
  const [img] = useImage(photo.src, 'anonymous');
  // 흑백은 Konva 필터+cache(고정 해상도 비트맵) 대신, 로드된 이미지의 원본 해상도 그대로
  // 캔버스에 재드로잉해 변환한다. cache 방식은 pixelRatio 상한에 걸리면 확대·출력 시
  // 컬러 사진보다 화질이 떨어지므로, 원본 픽셀 수를 그대로 보존하는 이 방식을 쓴다.
  const [grayscaleImg, setGrayscaleImg] = useState<HTMLCanvasElement | undefined>(undefined);
  const { select, nudgePhotoInCell, removePhoto, movePhotoToCell } = useEditorStore();
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const imgRef = useRef<Konva.Image>(null);
  const [hovered, setHovered] = useState(false);
  const [draggingAcross, setDraggingAcross] = useState(false);
  const [longPressReady, setLongPressReady] = useState(false);
  /** 이번 드래그가 꾹 누르기로 시작됐는지 (모바일 전용 판정에 사용) */
  const longPressArmed = useRef(false);
  const longPressTimer = useRef<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const clearLongPressTimer = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const cw = mmToScreenPx(cell.width, scale);
  const ch = mmToScreenPx(cell.height, scale);
  const pw = mmToScreenPx(photo.width * photo.zoom, scale);
  const ph = mmToScreenPx(photo.height * photo.zoom, scale);

  const setCursor = (node: Konva.Node, cursor: string) => {
    const stage = node.getStage();
    if (stage) stage.container().style.cursor = cursor;
  };

  // 흑백 변환: 로드된 이미지(편집 중엔 다운스케일본, 추출 직전엔 원본으로 교체됨)의
  // 실제 픽셀 크기 그대로 오프스크린 캔버스에 옮겨 그레이스케일화한다.
  // ctx.filter='grayscale(1)'는 구형 Android WebView·삼성 인터넷 등 일부 모바일
  // 브라우저에서 조용히 무시되어(그림은 그려지지만 색이 그대로 남음) 필터가 안 먹는
  // 것처럼 보이므로, 어디서나 동작하는 픽셀 단위 휘도 변환으로 직접 처리한다.
  useEffect(() => {
    if (!img || !photo.grayscale) {
      setGrayscaleImg(undefined);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
    ctx.putImageData(imageData, 0, 0);
    setGrayscaleImg(canvas);
  }, [img, photo.grayscale]);

  // 추출(다운로드) 직전, 이 슬롯이 실제로 그릴 준비가 됐는지 부모에 알린다.
  // 원본 교체 시 useImage는 src가 바뀌는 즉시 img를 undefined로 되돌리므로,
  // 여기서 img(및 흑백이면 grayscaleImg)가 채워진 시점이 진짜 "로드 완료" 시점이다.
  useEffect(() => {
    if (!onReadyChange) return;
    const ready = photo.grayscale ? !!grayscaleImg : !!img;
    onReadyChange(photo.id, photo.src, ready);
  }, [img, grayscaleImg, photo.grayscale, photo.id, photo.src, onReadyChange]);

  // 데스크탑은 hover, 모바일은 선택(탭) 시 노출
  const showDelete = interactive && (hovered || selected);

  return (
    <Group
      x={mmToScreenPx(cell.x, scale)}
      y={mmToScreenPx(cell.y, scale)}
      {...(draggingAcross ? {} : { clipX: 0, clipY: 0, clipWidth: cw, clipHeight: ch })}
      onClick={() => {
        if (!onCellTap()) select(photo.id);
      }}
      onTap={() => {
        if (!onCellTap()) select(photo.id);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <KImage
        ref={imgRef}
        image={photo.grayscale ? grayscaleImg : img}
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
        onTouchStart={(e) => {
          if (!isMobile || !canMoveAcrossCells) return;
          const t = e.evt.touches[0];
          touchStart.current = { x: t.clientX, y: t.clientY };
          clearLongPressTimer();
          longPressTimer.current = window.setTimeout(() => {
            longPressArmed.current = true;
            setLongPressReady(true);
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
          }, LONG_PRESS_MS);
        }}
        onTouchMove={(e) => {
          if (!longPressTimer.current || !touchStart.current) return;
          const t = e.evt.touches[0];
          const dist = Math.hypot(t.clientX - touchStart.current.x, t.clientY - touchStart.current.y);
          if (dist > LONG_PRESS_MOVE_TOLERANCE_PX) clearLongPressTimer();
        }}
        onTouchEnd={() => {
          clearLongPressTimer();
          touchStart.current = null;
        }}
        onDragStart={(e) => {
          dragOrigin.current = { x: e.target.x(), y: e.target.y() };
          // 모바일은 꾹 눌러 대기한 드래그만, 데스크탑은 바로 슬롯 이동 허용
          const allowCrossCell = canMoveAcrossCells && (!isMobile || longPressArmed.current);
          if (allowCrossCell) {
            setDraggingAcross(true);
            e.target.getParent()?.moveToTop();
          }
        }}
        onDragMove={(e) => {
          const allowCrossCell = canMoveAcrossCells && (!isMobile || longPressArmed.current);
          if (!allowCrossCell) return;
          // 손가락을 누르고 있다가 드래그 도중 대기 시간이 끝난 경우도 뒤늦게 슬롯 이동 모드로 전환
          if (!draggingAcross) {
            setDraggingAcross(true);
            e.target.getParent()?.moveToTop();
          }
          const stage = e.target.getStage();
          const pointer = stage?.getPointerPosition();
          if (!pointer) return;
          const hoverCell = resolveCellAtStagePoint(pointer.x, pointer.y);
          onDragHoverChange(hoverCell && hoverCell.id !== cell.id ? hoverCell.id : null);
        }}
        onDragEnd={(e) => {
          const o = dragOrigin.current;
          if (!o) return;
          const allowCrossCell = canMoveAcrossCells && (!isMobile || longPressArmed.current);
          const stage = e.target.getStage();
          const pointer = stage?.getPointerPosition();
          const targetCell = allowCrossCell && pointer ? resolveCellAtStagePoint(pointer.x, pointer.y) : undefined;
          if (targetCell && targetCell.id !== cell.id) {
            movePhotoToCell(photo.id, targetCell.id);
            e.target.position(o);
          } else {
            nudgePhotoInCell(
              photo.id,
              screenPxToMm(e.target.x() - o.x, scale),
              screenPxToMm(e.target.y() - o.y, scale),
            );
            // 위치는 스토어 상태(mm)에서 다시 파생되므로 노드 좌표 원복
            e.target.position({ x: cw / 2 + mmToScreenPx(photo.offsetX, scale), y: ch / 2 + mmToScreenPx(photo.offsetY, scale) });
          }
          dragOrigin.current = null;
          setDraggingAcross(false);
          setLongPressReady(false);
          longPressArmed.current = false;
          clearLongPressTimer();
          onDragHoverChange(null);
        }}
      />

      {/* 사진 테두리 디자인 (출력물에도 반영) */}
      <PhotoFrameOverlay frame={photoFrame} cw={cw} ch={ch} />

      {interactive && selected && (
        <Rect x={0} y={0} width={cw} height={ch} stroke="#9d7a54" strokeWidth={2} listening={false} />
      )}

      {/* 꾹 눌러 슬롯 이동이 활성화됐음을 알리는 표시 (아직 드래그를 시작하기 전) */}
      {longPressReady && !draggingAcross && (
        <Rect
          x={0}
          y={0}
          width={cw}
          height={ch}
          stroke="#9d7a54"
          strokeWidth={3}
          dash={[6, 4]}
          listening={false}
        />
      )}

      {/* 사진 위에 커서를 올리면(모바일: 선택하면) 나타나는 삭제 버튼 */}
      {showDelete && (
        <Group
          x={cw - deleteBadgeR - 8}
          y={deleteBadgeR + 8}
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
          <Circle radius={deleteBadgeR} fill="rgba(24,24,27,0.72)" stroke="#ffffff" strokeWidth={1.5} />
          <Line points={[-5, -5, 5, 5]} stroke="#ffffff" strokeWidth={2} lineCap="round" />
          <Line points={[5, -5, -5, 5]} stroke="#ffffff" strokeWidth={2} lineCap="round" />
        </Group>
      )}
    </Group>
  );
}

/**
 * 용지 위에 자유 배치하는 텍스트박스. 슬롯에 묶이지 않고 어디로든 드래그할 수 있다.
 * 실제 문구 편집은 설정 패널의 입력창에서 하고, 캔버스에서는 위치·선택만 다룬다.
 */
function TextBoxNode({
  textBox,
  scale,
  selected,
  interactive,
  draggable,
  paperWmm,
  paperHmm,
  deleteBadgeR,
  onSelect,
}: {
  textBox: TextBox;
  scale: number;
  selected: boolean;
  interactive: boolean;
  draggable: boolean;
  paperWmm: number;
  paperHmm: number;
  deleteBadgeR: number;
  onSelect: () => void;
}) {
  const { updateText, removeText } = useEditorStore();
  const textRef = useRef<Konva.Text>(null);
  const [hovered, setHovered] = useState(false);
  const [boxHeight, setBoxHeight] = useState(0);

  const tw = mmToScreenPx(textBox.width, scale);
  const fontSizePx = mmToScreenPx(textBox.fontSizeMm, scale);

  useEffect(() => {
    setBoxHeight(textRef.current?.height() ?? fontSizePx * 1.4);
  }, [textBox.text, textBox.width, fontSizePx]);

  const setCursor = (node: Konva.Node, cursor: string) => {
    const stage = node.getStage();
    if (stage) stage.container().style.cursor = cursor;
  };

  const showDelete = interactive && (hovered || selected);

  return (
    <Group
      x={mmToScreenPx(textBox.x, scale)}
      y={mmToScreenPx(textBox.y, scale)}
      rotation={textBox.rotation}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onMouseEnter={(e) => {
        setHovered(true);
        if (interactive) setCursor(e.target, 'move');
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        if (interactive) setCursor(e.target, 'default');
      }}
      onDragEnd={(e) => {
        const xMm = screenPxToMm(e.target.x(), scale);
        const yMm = screenPxToMm(e.target.y(), scale);
        updateText(textBox.id, {
          x: Math.max(0, Math.min(paperWmm - 10, xMm)),
          y: Math.max(0, Math.min(paperHmm - 10, yMm)),
        });
      }}
    >
      <KText
        ref={textRef}
        text={textBox.text}
        width={tw}
        fontSize={fontSizePx}
        fontStyle={textBox.bold ? 'bold' : 'normal'}
        fill={textBox.color}
        align={textBox.align}
        wrap="word"
      />

      {interactive && selected && (
        <Rect
          x={-4}
          y={-4}
          width={tw + 8}
          height={boxHeight + 8}
          stroke="#9d7a54"
          strokeWidth={2}
          listening={false}
        />
      )}

      {showDelete && (
        <Group
          x={tw - deleteBadgeR + 6}
          y={-deleteBadgeR - 6}
          onMouseEnter={(e) => setCursor(e.target, 'pointer')}
          onMouseLeave={(e) => setCursor(e.target, 'default')}
          onClick={(e) => {
            e.cancelBubble = true;
            setCursor(e.target, 'default');
            removeText(textBox.id);
          }}
          onTap={(e) => {
            e.cancelBubble = true;
            removeText(textBox.id);
          }}
        >
          <Circle radius={deleteBadgeR} fill="rgba(24,24,27,0.72)" stroke="#ffffff" strokeWidth={1.5} />
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
  useOriginals = false,
  onOriginalsReady,
}: {
  stageOut?: React.MutableRefObject<Konva.Stage | null>;
  mode?: 'edit' | 'export';
  /** 모바일 탭-투-배치: 라이브러리에서 고른 사진 id (드래그가 불가능한 터치 환경용) */
  placingId?: string | null;
  onPlaced?: () => void;
  /** true면 배치된 사진을 편집용 다운스케일 이미지 대신 IndexedDB의 고화질 원본으로 교체해 렌더링한다 */
  useOriginals?: boolean;
  /** 원본 교체가 끝나 캡처해도 되는 시점을 알린다 */
  onOriginalsReady?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  useEffect(() => {
    if (stageOut) stageOut.current = stageRef.current;
  });
  const [scale, setScale] = useState(2); // px per mm
  const [isMobile, setIsMobile] = useState(false);
  const [pinching, setPinching] = useState(false);
  /** 배치된 사진을 드래그해 다른 슬롯 위로 올렸을 때 하이라이트할 슬롯 id */
  const [dragHoverCellId, setDragHoverCellId] = useState<string | null>(null);
  /** useOriginals일 때 photoId → 원본 blob의 object URL */
  const [originalSrcMap, setOriginalSrcMap] = useState<Record<string, string>>({});
  const originalUrlsRef = useRef<string[]>([]);
  /** "photoId::src" → 그 src의 이미지(흑백이면 변환본까지)가 실제로 그려질 준비가 됐는지 */
  const [readyMap, setReadyMap] = useState<Record<string, boolean>>({});
  const handlePhotoReadyChange = useCallback((photoId: string, src: string, ready: boolean) => {
    const key = `${photoId}::${src}`;
    setReadyMap((m) => (m[key] === ready ? m : { ...m, [key]: ready }));
  }, []);
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
    texts,
    selectedTextId,
    selectText,
    removeText,
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

  // Tailwind md 브레이크포인트(768px)와 맞춰 삭제 버튼 크기를 모바일에서 줄인다
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // 다운로드 직전: 배치된 사진을 편집용 다운스케일 이미지 대신 IndexedDB의 고화질 원본으로 교체한다.
  useEffect(() => {
    if (!useOriginals) {
      if (originalUrlsRef.current.length) {
        originalUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
        originalUrlsRef.current = [];
      }
      setOriginalSrcMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        photos.map(async (p): Promise<[string, string]> => {
          try {
            const blob = await loadOriginal(p.originalKey);
            if (!blob) return [p.id, p.src];
            const url = URL.createObjectURL(blob);
            originalUrlsRef.current.push(url);
            return [p.id, url];
          } catch {
            return [p.id, p.src];
          }
        }),
      );
      if (cancelled) return;
      setOriginalSrcMap(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [useOriginals, photos]);

  // 원본 src로 교체된 각 슬롯이 실제로(이미지 로드 + 흑백 변환까지) 그려질 준비가
  // 됐을 때만 캡처를 허용한다. blob URL을 만든 시점(위 effect)에는 아직 <img>가
  // 로드되지 않아, 그 시점에 바로 캡처하면 흰 용지만 찍히는 레이스 컨디션이 있었다.
  useEffect(() => {
    if (!useOriginals) return;
    const allSwapped = photos.every((p) => originalSrcMap[p.id]);
    if (!allSwapped) return;
    const allReady = photos.every((p) => readyMap[`${p.id}::${originalSrcMap[p.id]}`]);
    if (allReady) onOriginalsReady?.();
  }, [useOriginals, photos, originalSrcMap, readyMap, onOriginalsReady]);

  // Delete / ESC 키 (기획안 v2 §8)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 텍스트 편집창 등 입력 요소에 포커스가 있을 때는 사진/텍스트박스 삭제로 새지 않게 한다
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        select(null);
        selectText(null);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) removePhoto(selectedId);
        if (selectedTextId) removeText(selectedTextId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, selectedTextId, select, selectText, removePhoto, removeText]);

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

  /** 스테이지 기준 px 좌표가 속한 슬롯 — 배치된 사진의 드래그 이동 대상 판별용 */
  const getCellAtStagePoint = (x: number, y: number) => {
    const { xMm, yMm } = toPaperMm(x, y);
    return cellAt(xMm, yMm);
  };

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
                const renderPhoto =
                  photo && originalSrcMap[photo.id] ? { ...photo, src: originalSrcMap[photo.id] } : photo;
                return renderPhoto ? (
                  <PhotoInCell
                    key={cell.id}
                    photo={renderPhoto}
                    cell={cell}
                    scale={scale}
                    selected={renderPhoto.id === selectedId}
                    interactive={isEdit}
                    draggable={isEdit && !pinching}
                    onCellTap={() => handleCellTap(cell.id)}
                    photoFrame={photoFrame}
                    deleteBadgeR={isMobile ? DELETE_BADGE_R_MOBILE : DELETE_BADGE_R}
                    canMoveAcrossCells={isEdit && cells.length > 1}
                    isMobile={isMobile}
                    resolveCellAtStagePoint={getCellAtStagePoint}
                    onDragHoverChange={setDragHoverCellId}
                    onReadyChange={handlePhotoReadyChange}
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

              {/* 사진을 드래그해 다른 슬롯 위로 올렸을 때 드롭 대상 하이라이트 */}
              {isEdit &&
                dragHoverCellId &&
                (() => {
                  const hoverCell = cells.find((c) => c.id === dragHoverCellId);
                  return hoverCell ? (
                    <Rect
                      x={mmToScreenPx(hoverCell.x, scale)}
                      y={mmToScreenPx(hoverCell.y, scale)}
                      width={mmToScreenPx(hoverCell.width, scale)}
                      height={mmToScreenPx(hoverCell.height, scale)}
                      fill="rgba(157,122,84,0.18)"
                      stroke="#9d7a54"
                      strokeWidth={2}
                      listening={false}
                    />
                  ) : null;
                })()}
            </Group>

            {/* 자유 배치 텍스트 (재단선 원점 기준) */}
            <Group x={bleedPx} y={bleedPx}>
              {texts.map((t) => (
                <TextBoxNode
                  key={t.id}
                  textBox={t}
                  scale={scale}
                  selected={t.id === selectedTextId}
                  interactive={isEdit}
                  draggable={isEdit && !pinching}
                  paperWmm={widthMm}
                  paperHmm={heightMm}
                  deleteBadgeR={isMobile ? DELETE_BADGE_R_MOBILE : DELETE_BADGE_R}
                  onSelect={() => selectText(t.id)}
                />
              ))}
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
