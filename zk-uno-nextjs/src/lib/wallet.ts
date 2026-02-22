/**
 * Wallet singleton — initialises StellarWalletsKit once in the browser.
 * All functions guard against SSR by checking typeof window.
 */

let _initialised = false;

/** Initialise the kit (no-op if already done). Must be called in browser. */
export async function initKit(): Promise<void> {
  if (typeof window === 'undefined' || _initialised) return;
  _initialised = true;

  const { StellarWalletsKit } = await import('@jsr/creit-tech__stellar-wallets-kit/sdk');
  const { defaultModules } = await import('@jsr/creit-tech__stellar-wallets-kit/modules/utils');

  StellarWalletsKit.init({ modules: defaultModules() });
}

/** Mount the kit's built-in connect/profile button into a container element. */
export async function mountButton(container: HTMLElement): Promise<void> {
  const { StellarWalletsKit } = await import('@jsr/creit-tech__stellar-wallets-kit/sdk');
  StellarWalletsKit.createButton(container);
}

/** Subscribe to kit state updates. Returns an unsubscribe function. */
export async function subscribeToKit(
  onStateUpdate: (address: string | undefined) => void,
  onDisconnect: () => void,
): Promise<() => void> {
  const { StellarWalletsKit } = await import('@jsr/creit-tech__stellar-wallets-kit/sdk');
  const { KitEventType } = await import('@jsr/creit-tech__stellar-wallets-kit/types');

  const unsubState = StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event: any) => {
    onStateUpdate(event.payload.address);
  });
  const unsubDisconnect = StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
    onDisconnect();
  });

  return () => {
    unsubState();
    unsubDisconnect();
  };
}

/** Sign a transaction XDR and return the signed XDR string. */
export async function signTransaction(
  xdr: string,
  networkPassphrase: string,
  address: string,
): Promise<string> {
  const { StellarWalletsKit } = await import('@jsr/creit-tech__stellar-wallets-kit/sdk');
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, { networkPassphrase, address });
  return signedTxXdr;
}

/** Sign an auth entry preimage XDR. */
export async function signAuthEntry(
  entryPreimageXdr: string,
  networkPassphrase: string,
  address: string,
): Promise<string> {
  const { StellarWalletsKit } = await import('@jsr/creit-tech__stellar-wallets-kit/sdk');
  let result: { signedAuthEntry?: string; error?: unknown };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = await (StellarWalletsKit as any).signAuthEntry(
      entryPreimageXdr,
      { networkPassphrase, address },
    );
  } catch (e) {
    // Some wallets (e.g. xBull) reject with a plain object, not an Error
    if (e instanceof Error) throw e;
    const obj = e as Record<string, unknown>;
    throw new Error(
      typeof obj?.message === 'string' ? obj.message :
      typeof obj?.error === 'string'   ? obj.error   :
      JSON.stringify(e)
    );
  }
  if (result?.error) {
    const err = result.error;
    if (err instanceof Error) throw err;
    const obj = err as Record<string, unknown>;
    throw new Error(
      typeof obj?.message === 'string' ? obj.message :
      typeof obj?.error === 'string'   ? obj.error   :
      String(err)
    );
  }
  return result.signedAuthEntry ?? '';
}
