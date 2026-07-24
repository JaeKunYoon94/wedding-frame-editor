/** 모든 좌표·크기는 mm 단위 (기획안 v2 §3: mm가 진실의 원천) */

export type Orientation = "portrait" | "landscape";
export type LayoutMode = "grid" | "free";
export type LayoutType = 1 | 2 | 4 | 6; // MVP: 1/2/4/6장 (3/9장은 2차)
export type BleedMm = 3 | 5;
export type GutterMm = 0 | 2 | 5;

export interface PaperSize {
  id: string;
  label: string;
  /** 세로 기준 mm */
  widthMm: number;
  heightMm: number;
}

export interface LayoutCell {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Photo {
  id: string;
  /** 편집용 (장변 2000px 다운스케일) object URL */
  src: string;
  /** 추출용 원본 IndexedDB 키 */
  originalKey: string;
  naturalWidth: number;
  naturalHeight: number;

  x: number;
  y: number;
  width: number;
  height: number;

  rotation: number;
  scaleX: 1 | -1;
  scaleY: 1 | -1;
  /** 슬롯 내부 크롭 배율 (cover 기준 1.0 이상) */
  zoom: number;
  /** 슬롯 내부 오프셋 (mm) */
  offsetX: number;
  offsetY: number;

  brightness: number;
  contrast: number;
  saturation: number;

  zIndex: number;
  cellId?: string;
}

export interface LibraryItem {
  id: string;
  src: string;
  originalKey: string;
  naturalWidth: number;
  naturalHeight: number;
  fileName: string;
}
