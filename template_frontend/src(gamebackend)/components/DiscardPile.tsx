'use client';

import Card from './Card';
import { COLOUR_CLASSES } from '@/lib/zkUnoService';

const COLOUR_NAMES = ['Red', 'Yellow', 'Green', 'Blue', 'Wild'];

interface DiscardPileProps {
  topColour: number;
  topValue: number;
  activeColour: number;
}

export default function DiscardPile({ topColour, topValue, activeColour }: DiscardPileProps) {
  const isWild = topColour === 4;
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs text-gray-400 uppercase tracking-wider">Discard</span>
      <Card card={{ colour: topColour, value: topValue }} size="lg" />
      {isWild && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">Active:</span>
          <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${COLOUR_CLASSES[activeColour] ?? ''}`}>
            {COLOUR_NAMES[activeColour] ?? '?'}
          </span>
        </div>
      )}
    </div>
  );
}
