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
  Orientation,
  Photo,
} from '@/types';
import { PAPER_SIZES } from '@/lib/paperSizes';
import { calcCells, clampOffset, coverFit } from '@/lib/layoutCalc';

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
  addLibraryItems: (items: LibraryItem[]) => void;
  assignToCell: (libraryId: string, cellId: string) => void;
  updatePhoto: (id: string, patch: Partial<Photo>) => void;
  nudgePhotoInCell: (id: string, dxMm: number, dyMm: number) => void;
  zoomPhotoInCell: (id: string, factor: number) => void;
  removePhoto: (id: string) => void;
  select: (id: string | null) => void;
  hydrate: (state: Partial<EditorState>) => void;
}

function deriveCells(s: Pick<EditorState, 'widthMm' | 'heightMm' | 'layoutType' | 'orientation' | 'gutterMm'>): LayoutCell[] {
  return calcCells(s.widthMm, s.heightMm, s.layoutType, s.orientation, s.gutterMm);
}

const initialPaper = PAPER_SIZES[0]; // A4 세로

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
      cells: calcCells(initialPaper.widthMm, initialPaper.heightMm, 1, 'portrait', 2),

      library: [],
      photos: [],
      selectedId: null,

      setPaper: (id, custom) => {
        const base =
          id === 'custom' && custom
            ? { widthMm: Math.min(custom.w, custom.h), heightMm: Math.max(custom.w, custom.h) }
            : PAPER_SIZES.find((p) => p.id === id) ?? initialPaper;
        const { orientation } = get();
        const widthMm = orientation === 'portrait' ? base.widthMm : base.heightMm;
        const heightMm = orientation === 'portrait' ? base.heightMm : base.widthMm;
        set((s) => {
          const next = { ...s, paperId: id, widthMm, heightMm };
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
          return { ...next, cells: deriveCells(next), photos: [], selectedId: null };
        }),

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
          const next = { ...s, ...state };
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
        cells: s.cells,
        photos: s.photos,
      }),
    },
  ),
);

export const useEditorUndo = () => useEditorStore.temporal.getState();
