'use client';

import { create } from 'zustand';
import { NETWORK_PASSPHRASE } from '@/lib/config';
import type { WalletSigner } from '@/lib/zkUnoService';

interface WalletState {
  address: string | null;
  /** Called by WalletButton when the kit fires STATE_UPDATED */
  setAddress: (address: string | undefined) => void;
  /** Called by WalletButton when the kit fires DISCONNECT */
  clearAddress: () => void;
  getSigner: () => WalletSigner | null;
}

export const useWallet = create<WalletState>((set, get) => ({
  address: null,

  setAddress: (address) => set({ address: address ?? null }),

  clearAddress: () => set({ address: null }),

  getSigner: (): WalletSigner | null => {
    const address = get().address;
    if (!address) return null;

    return {
      address,
      signTransaction: async (txXdr, opts) => {
        const { signTransaction } = await import('@/lib/wallet');
        const signedTxXdr = await signTransaction(
          txXdr,
          opts?.networkPassphrase ?? NETWORK_PASSPHRASE,
          address,
        );
        return { signedTxXdr };
      },
      signAuthEntry: async (entryXdr, opts) => {
        try {
          const { signAuthEntry } = await import('@/lib/wallet');
          const signedAuthEntry = await signAuthEntry(
            entryXdr,
            opts?.networkPassphrase ?? NETWORK_PASSPHRASE,
            address,
          );
          return { signedAuthEntry };
        } catch (error) {
          // Wallet kit may reject with a plain object (e.g. xBull: { code, message })
          const msg =
            error instanceof Error    ? error.message :
            typeof error === 'string' ? error :
            (error as Record<string, unknown>)?.message as string
              ?? (error as Record<string, unknown>)?.error as string
              ?? JSON.stringify(error);
          return { signedAuthEntry: '', error: new Error(msg) };
        }
      },
    };
  },
}));
