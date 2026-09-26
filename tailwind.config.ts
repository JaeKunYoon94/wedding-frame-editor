import type { Config } from 'tailwindcss';

// 디자인 토큰: 색·폰트·그림자·모션은 여기서만 정의하고 컴포넌트에는 임의 hex를 쓰지 않는다.
// 톤: DESIGN.md(Apple 분석) — "사진이 주인공인 갤러리". 흰색/파치먼트 면 + 단 하나의 액션 블루, 크롬엔 장식 없음.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 모든 본문·제목 (순검정 대신 near-black)
        ink: '#1d1d1f',
        // 페이지 바탕 = canvas-parchment
        paper: '#f5f5f7',
        // 패널·카드 면 = canvas(순백)
        sheet: '#ffffff',
        // 1px 헤어라인
        line: '#e0e0e0',
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
        // SF Pro가 있는 Apple 기기는 시스템 폰트, 그 외(Windows·Android)는 next/font로 자체 호스팅한 IBM Plex Sans KR
        display: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', 'var(--font-sans)', 'system-ui', 'sans-serif'],
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'var(--font-sans)', 'system-ui', 'sans-serif'],
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
