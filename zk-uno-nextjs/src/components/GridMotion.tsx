'use client';

import { useEffect, useRef, FC } from 'react';
import { gsap } from 'gsap';

interface GridMotionProps {
  items?: string[];
  gradientColor?: string;
}

const GridMotion: FC<GridMotionProps> = ({ items = [], gradientColor = 'black' }) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const mouseXRef = useRef<number>(
    typeof window !== 'undefined' ? window.innerWidth / 2 : 600
  );

  const combinedItems = items.length > 0 ? items.slice(0, 25) : Array.from({ length: 25 }, (_, i) => `Item ${i + 1}`);

  useEffect(() => {
    gsap.ticker.lagSmoothing(0);

    const handleMouseMove = (e: MouseEvent): void => {
      mouseXRef.current = e.clientX;
    };

    const updateMotion = (): void => {
      const maxMoveAmount = 300;
      const baseDuration = 0.8;
      const inertiaFactors = [0.6, 0.4, 0.3, 0.2];

      rowRefs.current.forEach((row, index) => {
        if (row) {
          const direction = index % 2 === 0 ? 1 : -1;
          const moveAmount =
            ((mouseXRef.current / window.innerWidth) * maxMoveAmount - maxMoveAmount / 2) * direction;
          gsap.to(row, {
            x: moveAmount,
            duration: baseDuration + inertiaFactors[index % inertiaFactors.length],
            ease: 'power3.out',
            overwrite: 'auto',
          });
        }
      });
    };

    const removeAnimationLoop = gsap.ticker.add(updateMotion);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      removeAnimationLoop();
    };
  }, []);

  return (
    <div ref={gridRef} className="h-full w-full overflow-hidden">
      <section
        className="w-full h-screen overflow-hidden relative flex items-center justify-center"
        style={{ background: `radial-gradient(circle, ${gradientColor} 0%, transparent 100%)` }}
      >
        <div className="absolute inset-0 pointer-events-none z-[4]" />
        <div className="gap-0 flex-none relative w-[170vw] h-[170vh] grid grid-rows-5 grid-cols-1 rotate-[-15deg] origin-center z-[2]">
          {Array.from({ length: 5 }, (_, rowIndex) => (
            <div
              key={rowIndex}
              className="grid gap-0 grid-cols-5 -my-4"
              style={{ willChange: 'transform, filter' }}
              ref={(el) => {
                if (el) rowRefs.current[rowIndex] = el;
              }}
            >
              {Array.from({ length: 5 }, (_, itemIndex) => {
                const content = combinedItems[rowIndex * 5 + itemIndex];
                const isUrl =
                  typeof content === 'string' &&
                  (content.startsWith('http') ||
                    content.startsWith('/') ||
                    content.startsWith('blob:'));
                return (
                  <div key={itemIndex} className="relative aspect-[7/3] -mx-16">
                    <div className="relative w-full h-full flex items-center justify-center text-white text-[1.5rem]">
                      {isUrl ? (
                        <img
                          src={content}
                          alt="UNO card"
                          className="w-full h-full object-contain rotate-90"
                        />
                      ) : (
                        <div className="p-4 text-center z-[1]">{content}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="relative w-full h-full top-0 left-0 pointer-events-none" />
      </section>
    </div>
  );
};

export default GridMotion;
