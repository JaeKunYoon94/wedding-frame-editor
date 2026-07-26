'use client';

import { create } from 'zustand';
import { temporal } from 'zundo';
import type {
  BleedMm,
  GutterMm,
  LayoutCell,
  LayoutMode,
  LayoutType,
  LibraryItem,
  Margins,
  Orientation,
  Photo,
  PhotoFrame,
  SingleShape,
} from '@/types';
import { DEFAULT_PAPER_ID, PAPER_SIZES, getPaperSize } from '@/lib/paperSizes';
import { LAYOUT_COUNTS, calcCells, clampOffset, coverFit } from '@/lib/layoutCalc';

export type MarginSide = keyof Margins;

/**
 * 기획안 v2 §13.
 * MVP에서는 용지·레이아웃·사진을 하나의 temporal 스토어로 통합해
 * Undo/Redo(zundo)가 세 영역을 함께 되돌리도록 한다.
 * (frame·export는 Undo 대상이 아니므로 별도 스토어 — 2차에서 분리 확장)
 */

export const SAFE_AREA_MM = 5 as const; // 고정 (기획안 v2 §5)

interface EditorState {
  // paper
  paperId: string;
  widthMm: number; // 방향 적용 후 실측
  heightMm: number;
  orientation: Orientation;
  bleedMm: BleedMm;

  // layout
  layoutMode: LayoutMode;
  layoutType: LayoutType;
  gutterMm: GutterMm;
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

  // actions
  setPaper: (id: string, custom?: { w: number; h: number }) => void;
  toggleOrientation: () => void;
  setBleed: (mm: BleedMm) => void;
  setLayout: (type: LayoutType) => void;
  setGutter: (mm: GutterMm) => void;
  /** 상하좌우 모두 같은 값으로 설정 */
  setMargin: (mm: number) => void;
  /** 한 변만 독립적으로 설정 */
  setMarginSide: (side: MarginSide, mm: number) => void;
  setSingleShape: (shape: SingleShape) => void;
  setPhotoFrame: (frame: PhotoFrame) => void;
  addLibraryItems: (items: LibraryItem[]) => void;
  assignToCell: (libraryId: string, cellId: string) => void;
  updatePhoto: (id: string, patch: Partial<Photo>) => void;
  nudgePhotoInCell: (id: string, dxMm: number, dyMm: number) => void;
  zoomPhotoInCell: (id: string, factor: number) => void;
  removePhoto: (id: string) => void;
  select: (id: string | null) => void;
  hydrate: (state: Partial<EditorState>) => void;
}

function deriveCells(
  s: Pick<
    EditorState,
    'widthMm' | 'heightMm' | 'layoutType' | 'orientation' | 'gutterMm' | 'margins' | 'singleShape'
  >,
): LayoutCell[] {
  return calcCells(s.widthMm, s.heightMm, s.layoutType, s.orientation, s.gutterMm, s.margins, s.singleShape);
}

/**
 * 셀 크기만 바뀌고 셀 id 구성은 그대로일 때(여백·간격 조절) 배치된 사진을
 * 새 셀에 다시 cover-fit 한다. 사진을 잃지 않고 흰 여백만 조절하기 위함.
 */
function refitPhotos(cells: LayoutCell[], photos: Photo[]): Photo[] {
  return photos.map((p) => {
    const cell = cells.find((c) => c.id === p.cellId);
    if (!cell) return p;
    const fit = coverFit(cell.width, cell.height, p.naturalWidth, p.naturalHeight);
    const clamped = clampOffset(
      cell.width,
      cell.height,
      fit.width * p.zoom,
      fit.height * p.zoom,
      p.offsetX,
      p.offsetY,
    );
    return { ...p, x: cell.x, y: cell.y, width: fit.width, height: fit.height, ...clamped };
  });
}

/** 웨딩 사진 기본값: 재단선 안쪽에 넉넉한 흰 여백 (네 변 동일) */
const DEFAULT_MARGIN_MM = 12;
export const MARGIN_MAX_MM = 50;
/** 여백을 아무리 늘려도 슬롯이 사라지지 않도록 남겨두는 최소 콘텐츠 영역(mm) */
const MIN_CONTENT_MM = 20;

/** "네 변 동일" 프리셋용 상한 — 상+하, 좌+우가 동시에 늘어나도 콘텐츠 영역이 남도록 제한 */
export function maxMarginFor(widthMm: number, heightMm: number): number {
  const byPaper = Math.floor((Math.min(widthMm, heightMm) - MIN_CONTENT_MM) / 2);
  return Math.max(0, Math.min(MARGIN_MAX_MM, byPaper));
}

/** 특정 한 변의 여백 상한 — 마주보는 변 값을 고려해 콘텐츠 영역이 음수가 되지 않게 제한 */
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
  return Math.max(0, Math.min(MARGIN_MAX_MM, Math.floor(dimension - MIN_CONTENT_MM - opposite)));
}

const initialPaper = getPaperSize(DEFAULT_PAPER_ID) ?? PAPER_SIZES[0]; // A4 세로

export const useEditorStore = create<EditorState>()(
  temporal(
    (set, get) => ({
      paperId: initialPaper.id,
      widthMm: initialPaper.widthMm,
      heightMm: initialPaper.heightMm,
      orientation: 'portrait',
      bleedMm: 3,

      layoutMode: 'grid',
      layoutType: 1,
      gutterMm: 2,
      margins: {
        top: DEFAULT_MARGIN_MM,
        right: DEFAULT_MARGIN_MM,
        bottom: DEFAULT_MARGIN_MM,
        left: DEFAULT_MARGIN_MM,
      },
      singleShape: 'rect',
      photoFrame: 'none',
      cells: calcCells(
        initialPaper.widthMm,
        initialPaper.heightMm,
        1,
        'portrait',
        2,
        { top: DEFAULT_MARGIN_MM, right: DEFAULT_MARGIN_MM, bottom: DEFAULT_MARGIN_MM, left: DEFAULT_MARGIN_MM },
        'rect',
      ),

      library: [],
      photos: [],
      selectedId: null,

      setPaper: (id, custom) => {
        const base =
          id === 'custom' && custom
            ? { widthMm: Math.min(custom.w, custom.h), heightMm: Math.max(custom.w, custom.h) }
            : getPaperSize(id) ?? initialPaper;
        const { orientation } = get();
        const widthMm = orientation === 'portrait' ? base.widthMm : base.heightMm;
        const heightMm = orientation === 'portrait' ? base.heightMm : base.widthMm;
        set((s) => {
          // 변마다 상한을 재계산해 새 용지에서도 콘텐츠 영역이 남도록 클램프
          const clampSide = (side: MarginSide, value: number, m: Margins) =>
            Math.min(value, maxMarginForSide(widthMm, heightMm, side, m));
          let margins = { ...s.margins };
          (Object.keys(margins) as MarginSide[]).forEach((side) => {
            margins = { ...margins, [side]: clampSide(side, margins[side], margins) };
          });
          const next = { ...s, paperId: id, widthMm, heightMm, margins };
          return { ...next, cells: deriveCells(next), photos: [] , selectedId: null };
        });
      },

      toggleOrientation: () =>
        set((s) => {
          const orientation: Orientation = s.orientation === 'portrait' ? 'landscape' : 'portrait';
          const next = { ...s, orientation, widthMm: s.heightMm, heightMm: s.widthMm };
          return { ...next, cells: deriveCells(next), photos: [], selectedId: null };
        }),

      setBleed: (bleedMm) => set({ bleedMm }),

      setLayout: (layoutType) =>
        set((s) => {
          const next = { ...s, layoutType };
          return { ...next, cells: deriveCells(next), photos: [], selectedId: null };
        }),

      setGutter: (gutterMm) =>
        set((s) => {
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
          return { ...next, cells, photos: refitPhotos(cells, s.photos) };
        }),

      setMarginSide: (side, mm) =>
        set((s) => {
          const max = maxMarginForSide(s.widthMm, s.heightMm, side, s.margins);
          const clamped = Math.max(0, Math.min(max, Math.round(mm)));
          const margins: Margins = { ...s.margins, [side]: clamped };
          const next = { ...s, margins };
          const cells = deriveCells(next);
          return { ...next, cells, photos: refitPhotos(cells, s.photos) };
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
          zIndex: photos.length,
          cellId,
        };
        set({
          photos: [...photos.filter((p) => p.cellId !== cellId), photo],
          selectedId: photo.id,
        });
      },

      updatePhoto: (id, patch) =>
        set((s) => ({ photos: s.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

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

      select: (selectedId) => set({ selectedId }),

      hydrate: (state) =>
        set((s) => {
          const merged = { ...s, ...state };
          // 지원하지 않는 과거 레이아웃 값은 가장 가까운 지원 장수로 스냅
          const layoutType = (LAYOUT_COUNTS as readonly LayoutType[]).includes(merged.layoutType)
            ? merged.layoutType
            : (LAYOUT_COUNTS as readonly LayoutType[]).reduce((best, n) =>
                Math.abs(n - merged.layoutType) < Math.abs(best - merged.layoutType) ? n : best,
              );
          const next = { ...merged, layoutType };
          return { ...next, cells: deriveCells(next) };
        }),
    }),
    {
      limit: 50, // 기획안 v2 §8: 히스토리 상한 50
      partialize: (s) => ({
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
      }),
    },
  ),
);

export const useEditorUndo = () => useEditorStore.temporal.getState();
