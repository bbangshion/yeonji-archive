import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0C0D11',
        surface: '#141620',
        raised: '#1A1D28',
        line: '#30364C',
        paper: '#F4F5F8',
        ash: '#A7ADBD',
        blush: '#A6B7FF',
        violet: '#5974FF',
      },
      fontFamily: {
        sans: ['Inter', 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        ambient: '0 14px 44px rgba(0,0,0,.19)',
      },
      transitionTimingFunction: {
        plush: 'cubic-bezier(0.25, 1, 0.5, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
