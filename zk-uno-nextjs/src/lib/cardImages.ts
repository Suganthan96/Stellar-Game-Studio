/**
 * Maps ZK-UNO card numbers (colour, value) → public PNG path
 *
 * Colour encoding (from zkUnoService.ts):
 *   0 = Red, 1 = Yellow, 2 = Green, 3 = Blue, 4 = Wild
 *
 * Value encoding:
 *   0-9  = numbers
 *   10   = Skip
 *   11   = Reverse
 *   12   = Draw Two
 *   13   = Wild
 *   14   = Wild Draw Four
 */

const COLOUR_PREFIXES: Record<number, string> = {
  0: 'Red',
  1: 'Yellow',
  2: 'Green',
  3: 'Blue',
};

const VALUE_SUFFIXES: Record<number, string> = {
  0: '0', 1: '1', 2: '2', 3: '3', 4: '4',
  5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: 'Skip',
  11: 'Reverse',
  12: 'Draw',
  13: 'Wild',
  14: 'Wild_Draw',
};

/**
 * Returns the /uno-assets/ public path for a given card.
 * e.g. getCardImage(0, 5)  → '/uno-assets/Red_5.png'
 *      getCardImage(4, 13) → '/uno-assets/Wild.png'
 *      getCardImage(4, 14) → '/uno-assets/Wild_Draw.png'
 */
export function getCardImage(colour: number, value: number): string {
  // Wild cards have no colour prefix
  if (colour === 4) {
    if (value === 14) return '/uno-assets/Wild_Draw.png';
    return '/uno-assets/Wild.png';
  }

  const prefix = COLOUR_PREFIXES[colour];
  const suffix = VALUE_SUFFIXES[value];

  if (!prefix || !suffix) {
    // fallback to deck back
    return '/uno-assets/Deck.png';
  }

  return `/uno-assets/${prefix}_${suffix}.png`;
}

/** Deck face-down card */
export const CARD_BACK = '/uno-assets/Deck.png';

/** All card filenames for the landing page animated grid */
export const ALL_CARD_FILENAMES = [
  'Blue_0.png', 'Blue_1.png', 'Blue_2.png', 'Blue_3.png', 'Blue_4.png',
  'Blue_5.png', 'Blue_6.png', 'Blue_7.png', 'Blue_8.png', 'Blue_9.png',
  'Blue_Draw.png', 'Blue_Reverse.png', 'Blue_Skip.png',
  'Green_0.png', 'Green_1.png', 'Green_2.png', 'Green_3.png', 'Green_4.png',
  'Green_5.png', 'Green_6.png', 'Green_7.png', 'Green_8.png', 'Green_9.png',
  'Green_Draw.png', 'Green_Reverse.png', 'Green_Skip.png',
  'Red_0.png', 'Red_1.png', 'Red_2.png', 'Red_3.png', 'Red_4.png',
  'Red_5.png', 'Red_6.png', 'Red_7.png', 'Red_8.png', 'Red_9.png',
  'Red_Draw.png', 'Red_Reverse.png', 'Red_Skip.png',
  'Yellow_0.png', 'Yellow_1.png', 'Yellow_2.png', 'Yellow_3.png', 'Yellow_4.png',
  'Yellow_5.png', 'Yellow_6.png', 'Yellow_7.png', 'Yellow_8.png', 'Yellow_9.png',
  'Yellow_Draw.png', 'Yellow_Reverse.png', 'Yellow_Skip.png',
  'Wild.png', 'Wild_Draw.png',
];

/** Returns 28 shuffled card paths for the GridMotion background */
export function getRandomCardImages(count: number = 28): string[] {
  const shuffled = [...ALL_CARD_FILENAMES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((f) => `/uno-assets/${f}`);
}
