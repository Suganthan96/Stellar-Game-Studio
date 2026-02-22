/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx}',
    './src/hooks/**/*.{js,ts,jsx,tsx}',
  ],
  safelist: [
    // UNO card colours — must not be purged (used dynamically from COLOUR_CLASSES array)
    'bg-red-500',
    'bg-yellow-400',
    'bg-green-500',
    'bg-blue-500',
    'bg-gray-700',
    // Dark inner oval shades (used dynamically in Card.tsx COLOUR_DARK map)
    'bg-red-700',
    'bg-yellow-600',
    'bg-green-700',
    'bg-blue-700',
    'bg-gray-900',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
