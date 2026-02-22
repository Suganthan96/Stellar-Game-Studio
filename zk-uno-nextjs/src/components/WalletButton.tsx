'use client';

import { useEffect, useRef } from 'react';
import { useWallet } from '@/hooks/useWallet';

export default function WalletButton() {
  const { address, setAddress, clearAddress } = useWallet();
  const containerRef = useRef<HTMLDivElement>(null);
  const initialisedRef = useRef(false);

  useEffect(() => {
    if (initialisedRef.current || !containerRef.current) return;
    initialisedRef.current = true;

    const container = containerRef.current;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        const { initKit, mountButton, subscribeToKit } = await import('@/lib/wallet');

        // Step 1: init the kit
        await initKit();

        // Step 2: insert the built-in button
        mountButton(container);

        // Step 3: listen to kit events → update Zustand store
        unsubscribe = await subscribeToKit(
          (addr) => setAddress(addr),   // STATE_UPDATED
          () => clearAddress(),          // DISCONNECT
        );
      } catch (e) {
        console.error('WalletButton: failed to init kit', e);
      }
    })();

    return () => { unsubscribe?.(); };
  }, [setAddress, clearAddress]);

  const shortAddress = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;

  return (
    <div className="flex items-center gap-2">
      {/* The kit mounts its own button into this div */}
      <div ref={containerRef} />

      {/* Show address badge next to the kit button once connected */}
      {shortAddress && (
        <span className="text-xs font-mono text-indigo-300 bg-indigo-900/50 px-3 py-1.5 rounded-lg select-all">
          {shortAddress}
        </span>
      )}
    </div>
  );
}
