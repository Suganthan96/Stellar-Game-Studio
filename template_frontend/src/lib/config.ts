// ─── Network config ───────────────────────────────────────────────────────────
export const RPC_URL =
  import.meta.env.VITE_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';

export const NETWORK_PASSPHRASE =
  import.meta.env.VITE_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015';

// ─── Contract IDs ─────────────────────────────────────────────────────────────
export const ZK_UNO_CONTRACT =
  import.meta.env.VITE_ZK_UNO_CONTRACT_ID ??
  'CDWRYMMESDY3GQYANCSYKJF4MCR7CI72D2326BDZ73ATR26U42RUTGYE';

export const MOCK_GAME_HUB_CONTRACT =
  import.meta.env.VITE_MOCK_GAME_HUB_CONTRACT_ID ??
  'CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG';

// ─── Prover server ────────────────────────────────────────────────────────────
export const PROVER_URL =
  import.meta.env.VITE_PROVER_URL ?? 'http://localhost:3001';

// ─── Dev / simulation addresses ─────────────────────────────────────────────
// Used as a neutral fee-source for tx simulation so that both player1 and
// player2 get Address credentials (not SourceAccount) in the auth list.
export const SIMULATION_SOURCE =
  import.meta.env.VITE_DEV_ADMIN_ADDRESS ??
  'GBUZBZ7NGZC4DIKFWQKP7CPM3634M4ITAUJJGF77LY6LC32PXHIA34LS';

// ─── Transaction defaults ─────────────────────────────────────────────────────
export const DEFAULT_TIMEOUT = 30;
export const MULTI_SIG_TTL_MINUTES = 60;
export const DEFAULT_AUTH_TTL_MINUTES = 5;
