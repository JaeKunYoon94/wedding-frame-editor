/** 기획안 v2 §3 좌표계 정책. 변경 금지. */
export const MM_PER_INCH = 25.4;
export const EXPORT_DPI = 300;

/** 추출용: mm → 300dpi px */
export const mmToExportPx = (mm: number): number => (mm / MM_PER_INCH) * EXPORT_DPI;

/** 화면용: mm → 화면 px */
export const mmToScreenPx = (mm: number, screenScale: number): number => mm * screenScale;

/** 화면 px → mm (제스처 입력 역변환) */
export const screenPxToMm = (px: number, screenScale: number): number => px / screenScale;
