'use client';

// 에디터 상태 저장소(zustand + zundo): 용지·레이아웃·여백·배치된 사진·텍스트와 이를 바꾸는 모든 동작.
// 메모리에만 있고 새로고침하면 사라진다(원본 사진 Blob만 IndexedDB). 모든 좌표·크기는 mm.
// 사진 좌표 모델: 사진은 슬롯(cell)에 속하고, width/height = 슬롯을 꽉 덮는 cover 크기(zoom=1 기준),
// 화면에 그려지는 크기 = width×zoom, offsetX/Y = 슬롯 중심에서 사진 중심까지의 거리(mm).

import { create } from 'zustand';
import { temporal } from 'zundo';
import { shallow } from 'zustand/shallow';
import type {
  BleedMm,
  LayoutCell,
  LayoutType,
  LibraryItem,
  Margins,
  Orientation,
  Photo,
  PhotoFrame,
  SingleShape,
  TextBox,
} from '@/types';
import { DEFAULT_PAPER_ID, PAPER_SIZES, getPaperSize } from '@/lib/paperSizes';
import { calcCells, clampOffset, coverFit } from '@/lib/layoutCalc';

export type MarginSide = keyof Margins;

/**
 * 기획안 v2 §13.
 * MVP에서는 용지·레이아웃·사진을 하나의 temporal 스토어로 통합해
 * Undo/Redo(zundo)가 세 영역을 함께 되돌리도록 한다.
 * (frame·export는 Undo 대상이 아니므로 별도 스토어 — 2차에서 분리 확장)
 */

interface EditorState {
  // paper
  paperId: string;
  widthMm: number; // 방향 적용 후 실측
  heightMm: number;
  orientation: Orientation;
  bleedMm: BleedMm;

  // layout
  layoutType: LayoutType;
  gutterMm: number;
  /** 재단선 안쪽 상하좌우 여백(mm) — 웨딩 사진용 흰 여백, 변마다 독립 조절 가능 (기획안 v2 §6 marginMm) */
  margins: Margins;
  /** 1장 레이아웃 슬롯 형태 */
  singleShape: SingleShape;
  /** 사진 테두리 디자인 (출력물에도 반영) */
  photoFrame: PhotoFrame;
  cells: LayoutCell[];

  // photos
  library: LibraryItem[];
  photos: Photo[];
  selectedId: string | null;

  // texts
  texts: TextBox[];
  selectedTextId: string | null;

  // actions
  setPaper: (id: string) => void;
  toggleOrientation: () => void;
  setBleed: (mm: BleedMm) => void;
  setLayout: (type: LayoutType) => void;
  setGutter: (mm: number) => void;
  /** 상하좌우 모두 같은 값으로 설정 */
  setMargin: (mm: number) => void;
  /** 한 변만 독립적으로 설정 */
  setMarginSide: (side: MarginSide, mm: number) => void;
  setSingleShape: (shape: SingleShape) => void;
  setPhotoFrame: (frame: PhotoFrame) => void;
  addLibraryItems: (items: LibraryItem[]) => void;
  /** 라이브러리 항목과 그 사진이 배치된 슬롯을 함께 지운다 (blob: URL 해제는 호출 측 책임) */
  removeLibraryItems: (ids: string[]) => void;
  assignToCell: (libraryId: string, cellId: string) => void;
  updatePhoto: (id: string, patch: Partial<Photo>) => void;
  nudgePhotoInCell: (id: string, dxMm: number, dyMm: number) => void;
  zoomPhotoInCell: (id: string, factor: number) => void;
  removePhoto: (id: string) => void;
  select: (id: string | null) => void;

  /** 용지 중앙에 새 텍스트박스를 추가하고 선택한다 */
  addText: () => void;
  updateText: (id: string, patch: Partial<TextBox>) => void;
  removeText: (id: string) => void;
  selectText: (id: string | null) => void;
}

/** 현재 용지·레이아웃·여백·간격으로 슬롯 좌표를 다시 계산한다 (상태를 바꾸는 동작마다 호출) */
function deriveCells(
  s: Pick<
    EditorState,
    'widthMm' | 'heightMm' | 'layoutType' | 'gutterMm' | 'margins' | 'singleShape'
  >,
): LayoutCell[] {
  return calcCells(s.widthMm, s.heightMm, s.layoutType, s.gutterMm, s.margins, s.singleShape);
}

/**
 * 셀 크기만 바뀌고 셀 id 구성은 그대로일 때(여백·간격·용지·방향 변경) 배치된 사진을
 * 새 셀에 다시 cover-fit 한다. 사진을 잃지 않고 슬롯 크기만 조절하기 위함.
 * offset(mm)은 사진 크기 변화 비율만큼 스케일해 보이는 구도(중앙 지점)를 유지한다.
 */
function refitPhotos(cells: LayoutCell[], photos: Photo[]): Photo[] {
  return photos.map((p) => {
    const cell = cells.find((c) => c.id === p.cellId);
    if (!cell) return p;
    const fit = coverFit(cell.width, cell.height, p.naturalWidth, p.naturalHeight);
    const ratio = p.width > 0 ? fit.width / p.width : 1;
    const clamped = clampOffset(
      cell.width,
      cell.height,
      fit.width * p.zoom,
      fit.height * p.zoom,
      p.offsetX * ratio,
      p.offsetY * ratio,
    );
    return { ...p, x: cell.x, y: cell.y, width: fit.width, height: fit.height, ...clamped };
  });
}

/**
 * 여백 조절 전용: 슬롯(창)만 커지거나 줄고, 사진은 용지 위 실제 크기(mm)·위치를 그대로 유지한다.
 * 매트지를 넓히듯 여백이 사진 가장자리를 가리거나 드러낼 뿐, 사진이 작아지지 않게 하기 위함.
 * 새 슬롯을 덮지 못할 만큼 작아지는 경우(여백을 줄여 슬롯이 커질 때)에만 cover 크기까지 키운다.
 * ponytail: 줌 상한(5배)에 걸리면 그만큼은 줄어든다 — 여백을 극단적으로 키울 때만 해당.
 */
function keepPhotosOnPaper(prevCells: LayoutCell[], cells: LayoutCell[], photos: Photo[]): Photo[] {
  return photos.map((p) => {
    const prev = prevCells.find((c) => c.id === p.cellId);
    const cell = cells.find((c) => c.id === p.cellId);
    if (!prev || !cell) return p;
    const fit = coverFit(cell.width, cell.height, p.naturalWidth, p.naturalHeight);
    // 화면에 보이던 사진 폭(mm) = width × zoom → 새 cover 폭 기준 zoom으로 환산
    const zoom = Math.min(5, Math.max(1, (p.width * p.zoom) / fit.width));
    // 사진 중심의 용지 좌표를 고정: 슬롯 중심이 움직인 만큼 offset을 반대로 보정
    const cx = prev.x + prev.width / 2 + p.offsetX;
    const cy = prev.y + prev.height / 2 + p.offsetY;
    const clamped = clampOffset(
      cell.width,
      cell.height,
      fit.width * zoom,
      fit.height * zoom,
      cx - (cell.x + cell.width / 2),
      cy - (cell.y + cell.height / 2),
    );
    return { ...p, x: cell.x, y: cell.y, width: fit.width, height: fit.height, zoom, ...clamped };
  });
}

/** 기본 여백은 용지 크기에 비례: A4(짧은 변 210mm) 기준 30mm */
const MARGIN_RATIO = 30 / 210;
/** 여백을 아무리 늘려도 슬롯이 사라지지 않도록 남겨두는 최소 콘텐츠 영역(mm) */
const MIN_CONTENT_MM = 20;

/** 용지별 권장 기본 여백(mm) — 짧은 변 × (30/210) */
export function defaultMarginFor(widthMm: number, heightMm: number): number {
  return Math.round(Math.min(widthMm, heightMm) * MARGIN_RATIO);
}

/** 기본 간격도 용지 크기에 비례: A4(짧은 변 210mm) 기준 2mm */
const GUTTER_RATIO = 2 / 210;

/** 용지별 권장 기본 간격(mm) — 짧은 변 × (2/210) */
export function defaultGutterFor(widthMm: number, heightMm: number): number {
  return Math.round(Math.min(widthMm, heightMm) * GUTTER_RATIO);
}

/** 간격 슬라이더 상한도 용지 크기에 비례: A4 기준 20mm */
const GUTTER_MAX_RATIO = 20 / 210;

export function maxGutterFor(widthMm: number, heightMm: number): number {
  return Math.round(Math.min(widthMm, heightMm) * GUTTER_MAX_RATIO);
}

/** "네 변 동일" 프리셋용 상한 — 상+하, 좌+우가 동시에 늘어나도 콘텐츠 영역이 남도록 제한 */
export function maxMarginFor(widthMm: number, heightMm: number): number {
  return Math.max(0, Math.floor((Math.min(widthMm, heightMm) - MIN_CONTENT_MM) / 2));
}

/**
 * 특정 한 변의 여백 상한 — '네 변 동일'과 같은 상한(maxMarginFor)을 넘지 않고,
 * 마주보는 변 값을 고려해 콘텐츠 영역이 최소 크기 아래로 줄지 않게 제한
 */
export function maxMarginForSide(widthMm: number, heightMm: number, side: MarginSide, margins: Margins): number {
  const isVertical = side === 'top' || side === 'bottom';
  const dimension = isVertical ? heightMm : widthMm;
  const opposite = isVertical
    ? side === 'top'
      ? margins.bottom
      : margins.top
    : side === 'left'
      ? margins.right
      : margins.left;
  return Math.max(0, Math.min(maxMarginFor(widthMm, heightMm), Math.floor(dimension - MIN_CONTENT_MM - opposite)));
}

const initialPaper = getPaperSize(DEFAULT_PAPER_ID) ?? PAPER_SIZES[0]; // A4 세로
const INITIAL_MARGIN_MM = defaultMarginFor(initialPaper.widthMm, initialPaper.heightMm); // A4 → 30mm
const INITIAL_MARGINS: Margins = {
  top: INITIAL_MARGIN_MM,
  right: INITIAL_MARGIN_MM,
  bottom: INITIAL_MARGIN_MM,
  left: INITIAL_MARGIN_MM,
};
const INITIAL_GUTTER_MM = defaultGutterFor(initialPaper.widthMm, initialPaper.heightMm); // A4 → 2mm

/** Undo/Redo 대상 — 선택 상태·라이브러리(업로드 목록)는 되돌리지 않는다 */
function toHistoryState(s: EditorState) {
  return {
    paperId: s.paperId,
    widthMm: s.widthMm,
    heightMm: s.heightMm,
    orientation: s.orientation,
    bleedMm: s.bleedMm,
    layoutType: s.layoutType,
    gutterMm: s.gutterMm,
    margins: s.margins,
    singleShape: s.singleShape,
    photoFrame: s.photoFrame,
    cells: s.cells,
    photos: s.photos,
    texts: s.texts,
  };
}
type HistoryState = ReturnType<typeof toHistoryState>;

export const useEditorStore = create<EditorState>()(
  temporal(
    (set, get) => ({
      paperId: initialPaper.id,
      widthMm: initialPaper.widthMm,
      heightMm: initialPaper.heightMm,
      orientation: 'portrait',
      bleedMm: 3,

      layoutType: 1,
      gutterMm: INITIAL_GUTTER_MM,
      margins: INITIAL_MARGINS,
      singleShape: 'rect',
      photoFrame: 'none',
      cells: calcCells(initialPaper.widthMm, initialPaper.heightMm, 1, INITIAL_GUTTER_MM, INITIAL_MARGINS, 'rect'),

      library: [],
      photos: [],
      selectedId: null,

      texts: [],
      selectedTextId: null,

      /** 용지 변경: 방향(세로/가로)은 유지하고, 여백·간격은 새 용지 크기에 비례해 조정 */
      setPaper: (id) => {
        const base = getPaperSize(id) ?? initialPaper;
        const { orientation } = get();
        const widthMm = orientation === 'portrait' ? base.widthMm : base.heightMm;
        const heightMm = orientation === 'portrait' ? base.heightMm : base.widthMm;
        set((s) => {
          // 여백·간격은 용지 크기에 비례해 유지: 짧은 변 비율만큼 스케일 (A4 30mm → A2 60mm)
          const scale = Math.min(widthMm, heightMm) / Math.min(s.widthMm, s.heightMm);
          const gutterMm = Math.min(maxGutterFor(widthMm, heightMm), Math.round(s.gutterMm * scale));
          const sides = Object.keys(s.margins) as MarginSide[];
          const margins = { ...s.margins };
          for (const side of sides) margins[side] = Math.round(margins[side] * scale);
          // 변마다 상한을 재계산해 새 용지에서도 콘텐츠 영역이 남도록 클램프
          // (앞 변을 줄인 결과를 뒤 변 상한 계산에 반영하므로 순서대로 처리)
          for (const side of sides) {
            margins[side] = Math.min(margins[side], maxMarginForSide(widthMm, heightMm, side, margins));
          }
          const next = { ...s, paperId: id, widthMm, heightMm, margins, gutterMm };
          const cells = deriveCells(next);
          // 레이아웃(셀 id)은 그대로이므로 배치된 사진은 유지하고 새 용지 크기에 다시 맞춘다
          return { ...next, cells, photos: refitPhotos(cells, s.photos) };
        });
      },

      toggleOrientation: () =>
        set((s) => {
          const orientation: Orientation = s.orientation === 'portrait' ? 'landscape' : 'portrait';
          const next = { ...s, orientation, widthMm: s.heightMm, heightMm: s.widthMm };
          const cells = deriveCells(next);
          // 방향만 바뀌고 셀 id는 같으므로 사진을 유지한 채 새 셀에 다시 맞춘다
          return { ...next, cells, photos: refitPhotos(cells, s.photos) };
        }),

      setBleed: (bleedMm) => set({ bleedMm }),

      setLayout: (layoutType) =>
        set((s) => {
          // 분할 수가 바뀌면 슬롯 id 구성이 달라져 사진을 옮겨 담을 기준이 없으므로 배치를 비운다
          // (라이브러리의 업로드 사진은 그대로 남는다)
          const next = { ...s, layoutType };
          return { ...next, cells: deriveCells(next), photos: [], selectedId: null };
        }),

      setGutter: (mm) =>
        set((s) => {
          const gutterMm = Math.max(0, Math.min(maxGutterFor(s.widthMm, s.heightMm), Math.round(mm)));
          const next = { ...s, gutterMm };
          const cells = deriveCells(next);
          // 셀 구성은 그대로이므로 배치된 사진은 유지하고 새 크기에 다시 맞춘다
          return { ...next, cells, photos: refitPhotos(cells, s.photos) };
        }),

      setMargin: (mm) =>
        set((s) => {
          const clamped = Math.max(0, Math.min(maxMarginFor(s.widthMm, s.heightMm), Math.round(mm)));
          const margins: Margins = { top: clamped, right: clamped, bottom: clamped, left: clamped };
          const next = { ...s, margins };
          const cells = deriveCells(next);
          // 사진은 크기·위치 그대로 두고 여백(창)만 바뀌게 한다
          return { ...next, cells, photos: keepPhotosOnPaper(s.cells, cells, s.photos) };
        }),

      setMarginSide: (side, mm) =>
        set((s) => {
          const max = maxMarginForSide(s.widthMm, s.heightMm, side, s.margins);
          const clamped = Math.max(0, Math.min(max, Math.round(mm)));
          const margins: Margins = { ...s.margins, [side]: clamped };
          const next = { ...s, margins };
          const cells = deriveCells(next);
          // 사진은 크기·위치 그대로 두고 여백(창)만 바뀌게 한다
          return { ...next, cells, photos: keepPhotosOnPaper(s.cells, cells, s.photos) };
        }),

      setSingleShape: (singleShape) =>
        set((s) => {
          const next = { ...s, singleShape };
          const cells = deriveCells(next);
          // 1장 슬롯의 형태만 바뀌므로 배치된 사진은 유지하고 새 셀에 다시 맞춘다
          return { ...next, cells, photos: refitPhotos(cells, s.photos) };
        }),

      setPhotoFrame: (photoFrame) => set({ photoFrame }),

      addLibraryItems: (items) => set((s) => ({ library: [...s.library, ...items] })),

      removeLibraryItems: (ids) =>
        set((s) => {
          // 배치된 사진은 라이브러리 항목과 같은 src(blob: URL)를 공유하므로 src로 찾아 함께 지운다
          const gone = new Set(s.library.filter((l) => ids.includes(l.id)).map((l) => l.src));
          const photos = s.photos.filter((p) => !gone.has(p.src));
          return {
            library: s.library.filter((l) => !ids.includes(l.id)),
            photos,
            selectedId: photos.some((p) => p.id === s.selectedId) ? s.selectedId : null,
          };
        }),

      /** 기획안 v2 §6: 드롭 시 cover 자동 채움 + 중앙 정렬 */
      assignToCell: (libraryId, cellId) => {
        const { library, cells, photos } = get();
        const item = library.find((l) => l.id === libraryId);
        const cell = cells.find((c) => c.id === cellId);
        if (!item || !cell) return;
        const fit = coverFit(cell.width, cell.height, item.naturalWidth, item.naturalHeight);
        const photo: Photo = {
          id: crypto.randomUUID(),
          src: item.src,
          originalKey: item.originalKey,
          naturalWidth: item.naturalWidth,
          naturalHeight: item.naturalHeight,
          x: cell.x,
          y: cell.y,
          width: fit.width,
          height: fit.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          zoom: 1,
          offsetX: 0,
          offsetY: 0,
          brightness: 0,
          contrast: 0,
          saturation: 0,
          grayscale: false,
          zIndex: photos.length,
          cellId,
        };
        set({
          photos: [...photos.filter((p) => p.cellId !== cellId), photo],
          selectedId: photo.id,
          selectedTextId: null,
        });
      },

      updatePhoto: (id, patch) =>
        set((s) => ({ photos: s.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

      /** 슬롯 안에서 사진 이동(드래그·화살표). 슬롯에 빈틈이 생기지 않도록 이동 범위를 clampOffset으로 제한 */
      nudgePhotoInCell: (id, dx, dy) => {
        const { photos, cells } = get();
        const p = photos.find((x) => x.id === id);
        const cell = p?.cellId ? cells.find((c) => c.id === p.cellId) : undefined;
        if (!p || !cell) return;
        const clamped = clampOffset(
          cell.width,
          cell.height,
          p.width * p.zoom,
          p.height * p.zoom,
          p.offsetX + dx,
          p.offsetY + dy,
        );
        get().updatePhoto(id, clamped);
      },

      /**
       * 슬롯 안에서 확대/축소(버튼·핀치). zoom 1(=cover, 슬롯을 딱 덮는 크기)~5배.
       * 1 미만으로 줄이면 슬롯에 빈틈이 생기므로 막고, 줄어든 만큼 offset도 다시 제한한다.
       */
      zoomPhotoInCell: (id, factor) => {
        const { photos, cells } = get();
        const p = photos.find((x) => x.id === id);
        const cell = p?.cellId ? cells.find((c) => c.id === p.cellId) : undefined;
        if (!p || !cell) return;
        const zoom = Math.min(5, Math.max(1, p.zoom * factor));
        const clamped = clampOffset(
          cell.width,
          cell.height,
          p.width * zoom,
          p.height * zoom,
          p.offsetX,
          p.offsetY,
        );
        get().updatePhoto(id, { zoom, ...clamped });
      },

      removePhoto: (id) =>
        set((s) => ({
          photos: s.photos.filter((p) => p.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        })),

      select: (selectedId) => set({ selectedId, selectedTextId: null }),

      addText: () => {
        const { widthMm, heightMm, texts } = get();
        const width = Math.min(80, widthMm * 0.6);
        const fontSizeMm = Math.max(4, Math.round(widthMm * 0.03));
        const text: TextBox = {
          id: crypto.randomUUID(),
          text: '텍스트를 입력하세요',
          x: (widthMm - width) / 2,
          y: (heightMm - fontSizeMm) / 2,
          width,
          fontSizeMm,
          color: '#1d1d1f', // DESIGN.md ink
          align: 'center',
          bold: false,
          rotation: 0,
          zIndex: texts.length,
        };
        set({ texts: [...texts, text], selectedTextId: text.id, selectedId: null });
      },

      updateText: (id, patch) =>
        set((s) => ({ texts: s.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

      removeText: (id) =>
        set((s) => ({
          texts: s.texts.filter((t) => t.id !== id),
          selectedTextId: s.selectedTextId === id ? null : s.selectedTextId,
        })),

      selectText: (selectedTextId) => set({ selectedTextId, selectedId: null }),
    }),
    {
      limit: 50, // 기획안 v2 §8: 히스토리 상한 50
      // 선택(select/selectText)처럼 partialize 대상이 안 바뀌는 set까지 히스토리에 쌓이면
      // 실행취소를 눌러도 화면이 그대로인 "빈 단계"가 생기므로, 변경이 없으면 기록하지 않는다.
      // ponytail: 텍스트 입력은 글자마다 한 단계씩 기록된다 — 입력 단위 묶기(디바운스)는 미적용.
      partialize: toHistoryState,
      equality: (past: HistoryState, current: HistoryState) => shallow(past, current),
    },
  ),
);

