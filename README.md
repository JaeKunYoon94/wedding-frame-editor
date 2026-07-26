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
| 용지 선택(A2~A5) · 세로/가로 토글 | ✅ |
| 레이아웃 1·4·9·16장 · 정사각형 슬롯(1장은 정사각형/직사각형 선택) · gutter 슬라이더(용지비율 프리셋) | ✅ |
| 상하좌우 여백 — 네 변 동일(용지비율 프리셋, 기본 A4 기준 30mm) 또는 변마다 개별 조절 | ✅ |
| Bleed 0/3/5mm · 재단선 · 재단 표시선 (화면 가이드 전용, 출력물엔 미포함) | ✅ |
| PNG/JPG/PDF 추출 — 모바일 포함, 페이지=용지 실측, 대용량은 기기 한계에 맞춰 자동 축소 | ✅ |
| 슬롯 드롭 → cover 자동 채움 · 내부 이동/회전·반전 · 슬롯 간 드래그 이동(모바일: 꾹 누르기) | ✅ |
| 사진 hover(모바일: 선택) 시 ✕ 삭제 버튼 | ✅ |
| 터치: 탭-투-배치 · 두 손가락 핀치 줌 | ✅ |
| 라이브러리 순번 배지 · 배치된 사진 명암 표시 · 썸네일 재드래그 중복 방지 | ✅ |
| 업로드 파이프라인 (HEIC 변환·EXIF 보정·원본/편집용 이중 관리) | ✅ |
| Undo/Redo (zundo, 50단계) · Delete/ESC/Cmd+Z 단축키 | ✅ |
| 자동 저장 (2초 디바운스 → IndexedDB) | ✅ 설정값 (사진 포함 복구는 TODO) |
| 사진 테두리 디자인 — 폴라로이드/인생네컷 | 🔲 구현됨, `PHOTO_FRAME_ENABLED`로 숨김 |
| 목업 미리보기 — 조판을 흰 액자로 선반/벽 장면에 합성 | 🔲 구현됨, `MOCKUP_PREVIEW_ENABLED`로 숨김 |
| 액자/매트지 미리보기 | 🔲 구현됨, `FRAME_PREVIEW_ENABLED`로 숨김 |
| 추출 시 원본(originalKey) 교체 렌더링 | ✅ |
| 복구 프롬프트("이어서 하시겠습니까?") | 🔲 TODO |
| 흑백 필터 (사진 선택 시 필터 패널 노출) | ✅ |
| 자유 배치 텍스트 (용지 위 드래그 배치, 글자 크기·색상·정렬·굵기 설정, 출력물 반영) | ✅ |
| 밝기/대비/채도 필터 | 2차 릴리스 |
| AI 얼굴 인식 배치 · 커스텀 레이아웃 편집기 | 3차 릴리스 |

## 폴더 구조

```
src/
├─ app/                 # 랜딩(/), 에디터(/editor)
├─ components/
│  ├─ Editor.tsx        # 3패널(데스크탑)/바텀시트(모바일) 통합, 캔버스는 단일 마운트
│  ├─ canvas/           # PaperCanvas (인쇄 가이드·슬롯·사진 노드), FramePreview
│  └─ panels/           # LibraryPanel, SettingsPanel, FramePanel
├─ stores/              # editorStore(zundo), frameStore(미리보기 전용)
├─ hooks/useAutoSave.ts
├─ lib/                 # convertMM, paperSizes, layoutCalc, frames,
│                       # imagePipeline, exportPdf, storage
└─ types/
```

## 출력 파일 규칙

- PDF/이미지 페이지 크기는 **용지 실측 그대로**입니다 (A4 → 정확히 210×297mm, 300dpi 2480×3508px).
- 화면의 회색 bleed·재단선·안전선·재단 표시선과 액자는 **가이드일 뿐 출력물에 포함되지 않습니다.**
  추출 직전 `PaperCanvas`를 `mode='export'`로 다시 그린 뒤 재단 영역만 crop합니다.
- 화면의 재단 여백(bleed)은 출력 파일에 포함되지 않습니다. 출력 크기는 항상 용지 실측입니다.

## README 자동 갱신

`git push` 직전에 `.githooks/pre-push`가 `readme-updater` 서브에이전트(`.claude/agents/readme-updater.md`)를
실행해 README를 코드 변경과 맞춥니다. 최초 1회만 아래 설정이 필요합니다.

```bash
git config core.hooksPath .githooks
```

README가 수정되면 push가 중단됩니다. 내용을 확인하고 커밋한 뒤 다시 push하세요.
건너뛰려면 `SKIP_README_AGENT=1 git push`.

`.claude/agents/ui-ux-reviewer.md`는 UI 변경 후 실제 브라우저(Playwright)로 데스크탑·모바일
화면을 조작해 레이아웃·터치 타겟·카피 일관성을 점검하는 서브에이전트다. 필요할 때 호출한다.

`.claude/agents/security-reviewer.md`는 XSS·안전하지 않은 역직렬화·업로드 처리·개인정보(사진)
유출 경로·의존성 위험을 이 앱의 위협 모델(서버 없음, 완전 클라이언트 사이드) 기준으로 점검하는
서브에이전트다.

## 주의

- 출력 파일은 sRGB 기반 인쇄 파일입니다 (브라우저 캔버스 한계). CMYK 변환은 장기 로드맵.
- 모바일에서도 PDF/이미지를 받을 수 있습니다. 기기 캔버스 한계를 넘는 대형 규격(A2 등)은 비율을 유지한 채 해상도를 낮춰 추출합니다.
