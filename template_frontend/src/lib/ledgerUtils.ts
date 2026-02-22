import { rpc } from '@stellar/stellar-sdk';
import { RPC_URL } from './config';

export async function calculateValidUntilLedger(ttlMinutes: number): Promise<number> {
  const server = new rpc.Server(RPC_URL);
  const latestLedger = await server.getLatestLedger();
  const LEDGERS_PER_MINUTE = 12;
  return latestLedger.sequence + Math.ceil(ttlMinutes * LEDGERS_PER_MINUTE);
}
