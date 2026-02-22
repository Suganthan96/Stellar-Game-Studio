'use client';

import { COLOUR_CLASSES, VALUE_NAMES } from '@/lib/zkUnoService';

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

export default function Card({ card, onClick, selected, playable, faceDown, size = 'md', className = '' }: CardProps) {
  const colourClass = COLOUR_CLASSES[card.colour] ?? 'bg-gray-700';
  const sizeClass = SIZE_CLASSES[size];

  if (faceDown) {
    return (
      <div
        className={`${sizeClass} rounded-lg border-2 border-gray-600 bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center select-none ${className}`}
      >
        <span className="text-gray-500 font-bold">UNO</span>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={[
        sizeClass,
        colourClass,
        'rounded-lg border-2 flex flex-col items-center justify-center font-bold select-none transition-all duration-200',
        selected ? 'border-white scale-110 shadow-lg shadow-white/30 -translate-y-3' : 'border-black/30',
        playable && !selected ? 'cursor-pointer hover:-translate-y-2 hover:border-white/70 hover:shadow-md' : '',
        !playable && onClick ? 'opacity-50 cursor-not-allowed' : '',
        onClick && playable ? 'cursor-pointer' : '',
        className,
      ].join(' ')}
    >
      <span className="text-white drop-shadow text-lg leading-tight">{VALUE_NAMES(card.value)}</span>
    </div>
  );
}
