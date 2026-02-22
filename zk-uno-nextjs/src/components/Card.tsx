'use client';

import { COLOUR_CLASSES, COLOUR_NAMES, VALUE_NAMES } from '@/lib/zkUnoService';

export interface CardData {
  colour: number;
  value: number;
}

interface CardProps {
  card: CardData;
  onClick?: () => void;
  selected?: boolean;
  playable?: boolean;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'w-10 h-14 text-xs',
  md: 'w-14 h-20 text-sm',
  lg: 'w-20 h-28 text-base',
};

// Darker shade for the inner oval / stripe — complements each colour
const COLOUR_DARK: Record<number, string> = {
  0: 'bg-red-700',
  1: 'bg-yellow-600',
  2: 'bg-green-700',
  3: 'bg-blue-700',
  4: 'bg-gray-900',
};

export default function Card({ card, onClick, selected, playable, faceDown, size = 'md', className = '' }: CardProps) {
  const colourClass = COLOUR_CLASSES[card.colour] ?? 'bg-gray-700';
  const darkClass   = COLOUR_DARK[card.colour]   ?? 'bg-gray-900';
  const sizeClass   = SIZE_CLASSES[size];
  const colourName  = COLOUR_NAMES[card.colour]  ?? '';

  if (faceDown) {
    return (
      <div
        className={`${sizeClass} rounded-lg border-2 border-gray-600 bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center select-none ${className}`}
      >
        <span className="text-gray-500 font-bold text-xs">UNO</span>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={[
        sizeClass,
        colourClass,
        'rounded-lg border-2 flex flex-col items-center justify-between p-1 font-bold select-none transition-all duration-200 overflow-hidden',
        selected ? 'border-white scale-110 shadow-lg shadow-white/30 -translate-y-3' : 'border-black/20',
        playable && !selected ? 'cursor-pointer hover:-translate-y-2 hover:border-white/80 hover:shadow-md hover:shadow-black/50' : '',
        !playable && onClick ? 'opacity-50 cursor-not-allowed' : '',
        onClick && playable ? 'cursor-pointer' : '',
        className,
      ].join(' ')}
    >
      {/* Top-left value */}
      <span className="text-white text-xs leading-none self-start drop-shadow">{VALUE_NAMES(card.value)}</span>

      {/* Centre oval with value */}
      <div className={`${darkClass} rounded-full w-3/4 h-2/5 flex items-center justify-center shadow-inner`}>
        <span className="text-white font-extrabold drop-shadow text-sm leading-none">{VALUE_NAMES(card.value)}</span>
      </div>

      {/* Bottom-right value (flipped) */}
      <span className="text-white text-xs leading-none self-end drop-shadow rotate-180">{VALUE_NAMES(card.value)}</span>
    </div>
  );
}
