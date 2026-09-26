'use client';

// 용지 캔버스(Konva): 용지·슬롯·사진·텍스트와 인쇄 가이드를 그리고, 드래그·핀치·탭 배치를 처리한다.
// 상태는 editorStore(mm 단위)에서 읽어 화면 px로 환산해 그리며, 다운로드 때는 같은 컴포넌트를 export 모드로 다시 그린다.

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect, Group, Image as KImage, Line, Circle, Text as KText } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/stores/editorStore';
import { useFrameStore } from '@/stores/frameStore';
import { mmToExportPx, mmToScreenPx, screenPxToMm } from '@/lib/convertMM';
import { resizeForPrint } from '@/lib/imagePipeline';
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

/**
 * 캔버스 가이드·편집 표시 색. Konva는 Tailwind 클래스를 못 쓰므로 tailwind.config.ts 토큰(DESIGN.md)을 값으로 옮겨 둔다.
 * 토큰을 바꾸면 여기도 같이 바꾼다. 출력물(export)에는 이 색들이 찍히지 않는다.
 */
const UI = {
  accent: '#0066cc', // accent — 선택 테두리·배치 대상 슬롯
  accentSoft: '#ebf3fc', // accent.soft — 배치 대기 중인 빈 슬롯
  ink: '#1d1d1f', // ink — 삭제 칩 아이콘
  chip: 'rgba(210, 210, 215, 0.64)', // chip — DESIGN.md button-icon-circular 반투명 회색
  slot: '#f5f5f7', // paper — 빈 슬롯
  hairline: '#e0e0e0', // line — 빈 슬롯 테두리
  bleed: '#d2d2d7', // bleed 영역 (surface-chip-translucent 불투명)
  trim: '#6e6e73', // ink.muted — 재단선
  cropMark: '#333333', // ink.80 — 재단 표시선
} as const;

/** 텍스트박스 삭제 버튼 반경 (화면 px 고정) — 데스크탑은 넉넉하게, 모바일은 캔버스를 덜 가리도록 살짝 작게 */
const DELETE_BADGE_R = 15;
const DELETE_BADGE_R_MOBILE = 11;

function setCursor(node: Konva.Node, cursor: string) {
  const stage = node.getStage();
  if (stage) stage.container().style.cursor = cursor;
}

/** 텍스트박스 삭제 버튼 (×). 사진은 캔버스를 가리지 않도록 × 없이 도구 상자·Delete 키로 지운다. 클릭이 상위 그룹의 선택 처리로 번지지 않게 막는다. */
function DeleteBadge({ x, y, r, onDelete }: { x: number; y: number; r: number; onDelete: () => void }) {
  return (
    <Group
      x={x}
      y={y}
      onMouseEnter={(e) => setCursor(e.target, 'pointer')}
      onMouseLeave={(e) => setCursor(e.target, 'default')}
      onClick={(e) => {
        e.cancelBubble = true;
        setCursor(e.target, 'default');
        onDelete();
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onDelete();
      }}
    >
      <Circle radius={r} fill={UI.chip} />
      <Line points={[-5, -5, 5, 5]} stroke={UI.ink} strokeWidth={2} lineCap="round" />
      <Line points={[5, -5, -5, 5]} stroke={UI.ink} strokeWidth={2} lineCap="round" />
    </Group>
  );
}

/** 도구 상자(PhotoToolbar) 화살표 한 번에 사진을 옮기는 거리(mm) */
export const NUDGE_MM = 2;

/** 선택한 사진 테두리 두께(화면 px) */
const SELECT_STROKE = 4;

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

// memo: 한 사진을 드래그·줌해도 나머지 슬롯은 photo 객체가 그대로이므로 다시 렌더하지 않는다.
// (부모가 넘기는 콜백은 모두 useCallback으로 고정돼 있어야 효과가 있다)
const PhotoInCell = memo(function PhotoInCell({
  photo,
  cell,
  scale,
  selected,
  interactive,
  draggable,
  onCellTap,
  photoFrame,
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
  onCellTap: (cellId: string) => boolean;
  photoFrame: PhotoFrame;
  /** 이 슬롯의 이미지(흑백 변환 포함)가 실제로 그릴 준비가 됐는지 알림 (추출 캡처 타이밍용) */
  onReadyChange?: (photoId: string, src: string, ready: boolean) => void;
}) {
  const [img] = useImage(photo.src, 'anonymous');
  // 흑백은 Konva 필터+cache(고정 해상도 비트맵) 대신, 로드된 이미지의 원본 해상도 그대로
  // 캔버스에 재드로잉해 변환한다. cache 방식은 pixelRatio 상한에 걸리면 확대·출력 시
  // 컬러 사진보다 화질이 떨어지므로, 원본 픽셀 수를 그대로 보존하는 이 방식을 쓴다.
  const [grayscaleImg, setGrayscaleImg] = useState<HTMLCanvasElement | undefined>(undefined);
  // 액션만 골라 구독 — 스토어 전체를 구독하면 아무 상태가 바뀌어도 모든 슬롯이 다시 렌더된다
  const { select, nudgePhotoInCell } = useEditorStore(
    useShallow((s) => ({ select: s.select, nudgePhotoInCell: s.nudgePhotoInCell })),
  );
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

  const cw = mmToScreenPx(cell.width, scale);
  const ch = mmToScreenPx(cell.height, scale);
  const pw = mmToScreenPx(photo.width * photo.zoom, scale);
  const ph = mmToScreenPx(photo.height * photo.zoom, scale);

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

  return (
    <Group
      x={mmToScreenPx(cell.x, scale)}
      y={mmToScreenPx(cell.y, scale)}
      clipX={0}
      clipY={0}
      clipWidth={cw}
      clipHeight={ch}
      onClick={() => {
        if (!onCellTap(cell.id)) select(photo.id);
      }}
      onTap={() => {
        if (!onCellTap(cell.id)) select(photo.id);
      }}
    >
      <KImage
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
        // 드래그는 슬롯 안에서 보이는 부분 조절만 한다 (슬롯 간 이동은 없앰 — 사진 교체는 라이브러리에서 탭/드래그 배치로)
        onDragStart={(e) => {
          dragOrigin.current = { x: e.target.x(), y: e.target.y() };
        }}
        onDragEnd={(e) => {
          const o = dragOrigin.current;
          if (!o) return;
          nudgePhotoInCell(photo.id, screenPxToMm(e.target.x() - o.x, scale), screenPxToMm(e.target.y() - o.y, scale));
          // 위치는 스토어 상태(mm)에서 다시 파생되므로 노드 좌표 원복
          e.target.position({ x: cw / 2 + mmToScreenPx(photo.offsetX, scale), y: ch / 2 + mmToScreenPx(photo.offsetY, scale) });
          dragOrigin.current = null;
        }}
      />

      {/* 사진 테두리 디자인 (출력물에도 반영) */}
      <PhotoFrameOverlay frame={photoFrame} cw={cw} ch={ch} />

      {interactive && selected && (
        // 선택 테두리: 슬롯 clip에 선 절반이 잘리지 않도록 선 두께의 절반만큼 안쪽으로 들여 그린다
        <Rect
          x={SELECT_STROKE / 2}
          y={SELECT_STROKE / 2}
          width={cw - SELECT_STROKE}
          height={ch - SELECT_STROKE}
          stroke={UI.accent}
          strokeWidth={SELECT_STROKE}
          listening={false}
        />
      )}

    </Group>
  );
});

/**
 * 용지 위에 자유 배치하는 텍스트박스. 슬롯에 묶이지 않고 어디로든 드래그할 수 있다.
 * 실제 문구 편집은 설정 패널의 입력창에서 하고, 캔버스에서는 위치·선택만 다룬다.
 */
const TextBoxNode = memo(function TextBoxNode({
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
  onSelect: (id: string) => void;
}) {
  const updateText = useEditorStore((s) => s.updateText);
  const removeText = useEditorStore((s) => s.removeText);
  const textRef = useRef<Konva.Text>(null);
  const [hovered, setHovered] = useState(false);
  const [boxHeight, setBoxHeight] = useState(0);

  const tw = mmToScreenPx(textBox.width, scale);
  const fontSizePx = mmToScreenPx(textBox.fontSizeMm, scale);

  useEffect(() => {
    setBoxHeight(textRef.current?.height() ?? fontSizePx * 1.4);
  }, [textBox.text, textBox.width, fontSizePx]);

  const showDelete = interactive && (hovered || selected);

  return (
    <Group
      x={mmToScreenPx(textBox.x, scale)}
      y={mmToScreenPx(textBox.y, scale)}
      rotation={textBox.rotation}
      draggable={draggable}
      onClick={() => onSelect(textBox.id)}
      onTap={() => onSelect(textBox.id)}
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
          stroke={UI.accent}
          strokeWidth={2}
          listening={false}
        />
      )}

      {showDelete && (
        <DeleteBadge
          x={tw - deleteBadgeR + 6}
          y={-deleteBadgeR - 6}
          r={deleteBadgeR}
          onDelete={() => removeText(textBox.id)}
        />
      )}
    </Group>
  );
});

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
  } = useEditorStore(
    // 라이브러리 목록(업로드) 변화에는 캔버스가 반응할 필요가 없으므로 필요한 값만 구독
    useShallow((s) => ({
      widthMm: s.widthMm,
      heightMm: s.heightMm,
      bleedMm: s.bleedMm,
      cells: s.cells,
      photos: s.photos,
      selectedId: s.selectedId,
      photoFrame: s.photoFrame,
      select: s.select,
      removePhoto: s.removePhoto,
      assignToCell: s.assignToCell,
      zoomPhotoInCell: s.zoomPhotoInCell,
      texts: s.texts,
      selectedTextId: s.selectedTextId,
      selectText: s.selectText,
      removeText: s.removeText,
    })),
  );
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
            const original = await loadOriginal(p.originalKey);
            if (!original) return [p.id, p.src];
            // 사진 전체(줌 포함)가 출력물에서 차지할 300dpi 픽셀 폭으로 미리 고품질 축소 (resizeForPrint 주석 참고).
            // 모바일 캔버스 상한으로 추출 dpi가 더 낮아지면 Konva가 나머지(2배 미만)만 줄인다.
            const blob = await resizeForPrint(original, Math.ceil(mmToExportPx(p.width * p.zoom)));
            if (cancelled) return [p.id, p.src];
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
  const toPaperMm = useCallback(
    (x: number, y: number) => ({
      xMm: screenPxToMm(x - padPx, scale) - bleedMm,
      yMm: screenPxToMm(y - padPx, scale) - bleedMm,
    }),
    [padPx, scale, bleedMm],
  );

  // 아래 두 콜백은 memo된 PhotoInCell에 그대로 넘기므로 useCallback으로 참조를 고정한다
  // (매 렌더 새 함수를 넘기면 memo가 무력화돼 모든 슬롯이 다시 그려진다)

  /** 배치 대기 중인 사진이 있으면 해당 슬롯에 넣고 true 반환 */
  const handleCellTap = useCallback(
    (cellId: string): boolean => {
      if (!placingId || !isEdit) return false;
      assignToCell(placingId, cellId);
      onPlaced?.();
      return true;
    },
    [placingId, isEdit, assignToCell, onPlaced],
  );

  const cellAt = useCallback(
    (xMm: number, yMm: number) =>
      cells.find((c) => xMm >= c.x && xMm <= c.x + c.width && yMm >= c.y && yMm <= c.y + c.height),
    [cells],
  );

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
      className="flex h-full w-full select-none items-center justify-center overflow-hidden bg-desk p-2 md:p-4"
      style={{ WebkitTouchCallout: 'none' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {/*
        그리는 순서(아래→위): 액자(미리보기) → bleed 회색 면 → 흰 용지 → 슬롯·사진 → 텍스트 → 재단선·재단 표시(가이드).
        좌표 원점: 바깥 Group은 액자 두께(padPx)만큼, 안쪽 Group은 bleed만큼 밀어 "재단선 왼쪽 위 = (0,0)"으로 맞춘다.
        그래서 store의 cell.x/y(mm, 재단선 기준)를 그대로 mmToScreenPx로 환산해 쓸 수 있다.
      */}
      <Stage
        ref={stageRef}
        width={stageW}
        height={stageH}
        className="shadow-product"
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
              fill={isEdit ? UI.bleed : '#ffffff'}
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
                    onCellTap={handleCellTap}
                    photoFrame={photoFrame}
                    onReadyChange={handlePhotoReadyChange}
                  />
                ) : isEdit ? (
                  <Rect
                    key={cell.id}
                    x={mmToScreenPx(cell.x, scale)}
                    y={mmToScreenPx(cell.y, scale)}
                    width={mmToScreenPx(cell.width, scale)}
                    height={mmToScreenPx(cell.height, scale)}
                    fill={placingId ? UI.accentSoft : UI.slot}
                    stroke={placingId ? UI.accent : UI.hairline}
                    strokeWidth={placingId ? 2 : 1}
                    onClick={() => handleCellTap(cell.id)}
                    onTap={() => handleCellTap(cell.id)}
                    onMouseEnter={(e) => placingId && setCursor(e.target, 'copy')}
                    onMouseLeave={(e) => setCursor(e.target, 'default')}
                  />
                ) : null;
              })}

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
                  onSelect={selectText}
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
                  stroke={UI.trim}
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
                      <Line points={[cx, cy + dy * 4, cx, cy + dy * bleedPx]} stroke={UI.cropMark} strokeWidth={1} />
                      <Line points={[cx + dx * 4, cy, cx + dx * bleedPx, cy]} stroke={UI.cropMark} strokeWidth={1} />
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
