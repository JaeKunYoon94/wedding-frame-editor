import type { Config } from 'tailwindcss';

// 디자인 토큰: 색·폰트·그림자·모션은 여기서만 정의하고 컴포넌트에는 임의 hex를 쓰지 않는다.
// 톤: DESIGN.md(Apple 분석) — "사진이 주인공인 갤러리". 흰색/파치먼트 면 + 단 하나의 액션 블루, 크롬엔 장식 없음.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    // DESIGN.md 반경 문법: xs 5 · sm 8(작은 버튼·카드 속 이미지) · md 11(입력칸) · lg 18(카드·떠 있는 도구 상자) · full(pill).
    // Tailwind 기본값(2/4/6/12/16px…)을 통째로 바꿔 문법 밖의 반경이 생기지 않게 한다 (rounded-xl·2xl 등은 생성되지 않음).
    borderRadius: {
      none: '0px',
      xs: '5px',
      DEFAULT: '5px',
      sm: '8px',
      md: '11px',
      lg: '18px',
      full: '9999px',
    },
    extend: {
      // lg = 모바일↔데스크탑 레이아웃 전환점. 1920px 모니터에서 브라우저 확대 175%(CSS 폭 ≈1097px)부터 모바일 레이아웃이 되도록 1120px로 올린다.
      // ponytail: 확대율이 아니라 CSS 폭 기준이라 2560px 모니터는 175%에서도 데스크탑 — 확대율 자체를 봐야 하면 그때 바꾼다.
      screens: {
        lg: '1120px',
      },
      // DESIGN.md 타이포 토큰(크기·행간·자간). 한글 폰트는 SF Pro보다 자간이 넓어 px 대신 em으로 비슷하게 맞춘다
      fontSize: {
        hero: ['56px', { lineHeight: '1.07', letterSpacing: '-0.005em' }],
        display: ['40px', { lineHeight: '1.1', letterSpacing: '-0.005em' }],
        'display-sm': ['34px', { lineHeight: '1.1', letterSpacing: '-0.005em' }],
        tagline: ['21px', { lineHeight: '1.19', letterSpacing: '0.011em' }],
        body: ['17px', { lineHeight: '1.47', letterSpacing: '-0.022em' }],
        'button-large': ['18px', { lineHeight: '1' }],
      },
      colors: {
        ink: {
          // 모든 본문·제목 (순검정 대신 near-black)
          DEFAULT: '#1d1d1f',
          // ink-muted-80: 보조 본문·비선택 컨트롤 글자
          80: '#333333',
          // 캡션·안내문. DESIGN.md의 ink-muted-48(#7a7a7a)은 흰 바탕 대비 4.29:1로 WCAG AA 미달이라
          // Apple 보조 레이블 색 #6e6e73(흰 바탕 5.07:1, 파치먼트 4.6:1)을 쓴다
          muted: '#6e6e73',
        },
        // 삭제·오류 전용 (DESIGN.md엔 오류 색이 없어 보조로 둔다 — 액션 색으로 쓰지 않는다)
        danger: {
          DEFAULT: '#b91c1c',
          line: '#fecaca',
          soft: '#fef2f2',
        },
        // 페이지 바탕 = canvas-parchment
        paper: '#f5f5f7',
        // 패널·카드 면 = canvas(순백)
        sheet: '#ffffff',
        // 1px 헤어라인
        line: '#e0e0e0',
        // 사진 위에 뜨는 원형·캡슐 컨트롤 바탕 (DESIGN.md button-icon-circular: #d2d2d7 64%)
        chip: 'rgba(210, 210, 215, 0.64)',
        // 캔버스 작업대: 파치먼트 위에 흰 용지 + 제품 그림자로 띄운다
        desk: '#f5f5f7',
        accent: {
          // Action Blue — 모든 인터랙티브 요소의 유일한 색 (흰 글자 대비 5.6:1, AA 충족)
          DEFAULT: '#0066cc',
          // 키보드 포커스 링 전용
          focus: '#0071e3',
          // 드롭존·선택 배경용 옅은 블루 (DESIGN.md에 없는 보조 틴트 — Action Blue 약 8%)
          soft: '#ebf3fc',
        },
      },
      fontFamily: {
        // next/font로 자체 호스팅한 Noto Sans KR을 모든 기기에서 우선 사용 (로드 전·실패 시 시스템 폰트)
        display: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // 시스템의 유일한 그림자 — 표면 위에 놓인 "제품"(여기선 용지·사진)에만 쓴다. 버튼·카드·텍스트엔 쓰지 않는다.
        product: '3px 5px 30px 0 rgba(0, 0, 0, 0.22)',
      },
      keyframes: {
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-up': {
          from: { transform: 'translateY(16px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'rise-in': 'rise-in 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'sheet-up': 'sheet-up 0.22s ease-out both',
      },
    },
  },
  plugins: [],
};
export default config;
