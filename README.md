# 웨딩 액자 에디터 (Wedding Frame Editor)

결혼식 사진을 업로드해 액자 출력용 **300dpi 인쇄 파일**을 브라우저에서 직접 만드는 WYSIWYG 편집 서비스.

> 기획안 v2 기준 1차(MVP) 골격 구현. 상세 정책은 `docs/기획안_v2.md` 참조.

## 핵심 원칙

- **mm가 진실의 원천** — 모든 상태 좌표는 mm로 저장, 화면은 `mm × screenScale`, 추출은 `mm / 25.4 × 300` (`src/lib/convertMM.ts`)
- **완전 클라이언트 사이드** — 사진은 서버로 전송되지 않음. 원본은 IndexedDB, 편집은 장변 2000px 다운스케일본 사용
- **슬롯 고정 + 내부 크롭** — 고정 레이아웃 슬롯에 clip된 사진을 내부에서 이동/확대 (`src/lib/layoutCalc.ts`)

## 실행

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run build
```

## 구현 현황 (1차 MVP)

| 영역 | 상태 |
| --- | --- |
| 용지 선택(6종 + Custom, A2 상한 검증) · 세로/가로 토글 | ✅ |
| 레이아웃 1/2/4/6장 (방향 자동 변형) · gutter 0/2/5mm | ✅ |
| 업로드 파이프라인 (HEIC 변환·EXIF 보정·원본/편집용 이중 관리) | ✅ |
| Bleed(3/5mm)·재단선·안전선(5mm 고정)·재단 표시선 | ✅ |
| 슬롯 드롭 → cover 자동 채움 · 내부 이동/확대(wheel)·회전·반전 | ✅ |
| Undo/Redo (zundo, 50단계) · Delete/ESC/Cmd+Z 단축키 | ✅ |
| PNG/JPG/300dpi PDF 추출 · 모바일 대용량 규격 감지 | ✅ |
| 자동 저장 (2초 디바운스 → IndexedDB) | ✅ 설정값 (사진 포함 복구는 TODO) |
| 추출 시 원본(originalKey) 교체 렌더링 | 🔲 TODO — 현재는 편집용 2000px 소스로 추출 |
| 복구 프롬프트("이어서 하시겠습니까?") | 🔲 TODO |
| 터치 핀치 줌 | 🔲 TODO |
| 밝기/대비/채도 필터 · 자유 배치 · 액자/매트지 미리보기 | 2차 릴리스 |
| AI 얼굴 인식 배치 · 커스텀 레이아웃 편집기 | 3차 릴리스 |

## 폴더 구조

```
src/
├─ app/                 # 랜딩(/), 에디터(/editor)
├─ components/
│  ├─ Editor.tsx        # 3패널(데스크탑)/바텀시트(모바일) 통합
│  ├─ canvas/           # PaperCanvas (인쇄 가이드·슬롯·사진 노드)
│  └─ panels/           # LibraryPanel(업로드·사진목록), SettingsPanel
├─ stores/editorStore.ts# 용지·레이아웃·사진 통합 스토어 (zundo)
├─ hooks/useAutoSave.ts
├─ lib/                 # convertMM, paperSizes, layoutCalc,
│                       # imagePipeline, exportPdf, storage
└─ types/
```

## 주의

- 출력 파일은 sRGB 기반 인쇄 파일입니다 (브라우저 캔버스 한계). CMYK 변환은 장기 로드맵.
- 모바일에서 A3 이상 300dpi 추출은 기기 한계로 차단되며 데스크탑 안내가 표시됩니다.
