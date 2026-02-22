'use client';

import Card, { type CardData } from './Card';
import { canPlay } from '@/lib/zkUnoService';

interface HandProps {
  cards: CardData[];
  selectedCard?: CardData | null;
  topColour: number;
  topValue: number;
  activeColour: number;
  isMyTurn: boolean;
  onCardClick?: (card: CardData) => void;
}

export default function Hand({ cards, selectedCard, topColour, topValue, activeColour, isMyTurn, onCardClick }: HandProps) {
  if (cards.length === 0) {
    return <div className="text-gray-400 text-sm py-4">No cards in hand.</div>;
  }

  return (
    <div className="flex flex-wrap gap-2 justify-center py-2">
      {cards.map((card, i) => {
        const playable = isMyTurn && canPlay(card, activeColour, topValue);
        const isSelected = selectedCard?.colour === card.colour && selectedCard?.value === card.value;
        return (
          <Card
            key={`${card.colour}-${card.value}-${i}`}
            card={card}
            selected={isSelected}
            playable={playable}
            onClick={playable || isSelected ? () => onCardClick?.(card) : undefined}
            size="md"
          />
        );
      })}
    </div>
  );
}
