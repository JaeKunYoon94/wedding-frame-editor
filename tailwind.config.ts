import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1c1917',
        paper: '#fafaf9',
        accent: '#9d7a54',
      },
    },
  },
  plugins: [],
};
export default config;
