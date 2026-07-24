/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // konva는 node 환경 canvas 모듈을 찾으려 함 → 브라우저 전용으로 사용
    config.externals = [...(config.externals ?? []), { canvas: 'canvas' }];
    return config;
  },
};
export default nextConfig;
