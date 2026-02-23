// Auto-generated bindings for ZK-UNO contract
// Copied from bindings/zk_uno/src/index.ts — do not hand-edit.
// Re-export everything from the jsr-installed package path or inline below.

import { Buffer } from 'buffer';
import { Address } from '@stellar/stellar-sdk';
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/contract';
import type {
  u32,
  i128,
  Option,
} from '@stellar/stellar-sdk/contract';

export type { u32, i128, Option };
export * from '@stellar/stellar-sdk';
export * as contract from '@stellar/stellar-sdk/contract';
export * as rpc from '@stellar/stellar-sdk/rpc';

if (typeof window !== 'undefined') {
  // @ts-ignore
  window.Buffer = window.Buffer || Buffer;
}

export const networks = {
  testnet: {
    networkPassphrase: 'Test SDF Network ; September 2015',
    contractId: 'CDWRYMMESDY3GQYANCSYKJF4MCR7CI72D2326BDZ73ATR26U42RUTGYE',
  },
} as const;

export interface Game {
  active_colour: u32;
  current_turn: u32;
  draw_count: u32;
  hand_hash_p1: Option<Buffer>;
  hand_hash_p2: Option<Buffer>;
  player1: string;
  player1_points: i128;
  player2: string;
  player2_points: i128;
  top_colour: u32;
  top_value: u32;
  winner: Option<string>;
}

export interface Client {
  get_game: (args: { session_id: u32 }, options?: MethodOptions) => Promise<AssembledTransaction<Game>>;
  start_game: (args: { session_id: u32; player1: string; player2: string; player1_points: i128; player2_points: i128 }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
  draw_card_zk: (args: { session_id: u32; player: string; new_hand_hash: Buffer; zk_seal: Buffer }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
  play_card_zk: (args: { session_id: u32; player: string; played_colour: u32; played_value: u32; wild_colour: u32; new_hand_hash: Buffer; zk_seal: Buffer; is_winner: boolean; is_uno: boolean }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
  get_deck_card: (args: { session_id: u32; index: u32 }, options?: MethodOptions) => Promise<AssembledTransaction<readonly [u32, u32]>>;
  commit_hand_zk: (args: { session_id: u32; player: string; hand_hash: Buffer; zk_seal: Buffer }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
  declare_uno_zk: (args: { session_id: u32; player: string; zk_seal: Buffer }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
  get_risc0_verifier: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>;
  set_risc0_verifier: (args: { verifier: string }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([
        'AAAAAQAAAAAAAAAAAAAABEdhbWUAAAAMAAAAMU1heSBkaWZmZXIgZnJvbSB0b3BfY29sb3VyIGFmdGVyIGEgV2lsZCBpcyBwbGF5ZWQAAAAAAAANYWN0aXZlX2NvbG91cgAAAAAAAAQAAAAmMCA9IHBsYXllcjEncyB0dXJuLCAxID0gcGxheWVyMidzIHR1cm4AAAAAAAxjdXJyZW50X3R1cm4AAAAEAAAAOkluZGV4IG9mIHRoZSBuZXh0IGNhcmQgdG8gZHJhdyBmcm9tIHRoZSBkZXRlcm1pbmlzdGljIGRlY2sAAAAAAApkcmF3X2NvdW50AAAAAAAEAAAANGtlY2NhazI1NihoYW5kX2J5dGVzIHx8IHNhbHQpIOKAlCBORVZFUiB0aGUgcmF3IGhhbmQAAAAMaGFuZF9oYXNoX3AxAAAD6AAAA+4AAAAgAAAANGtlY2NhazI1NihoYW5kX2J5dGVzIHx8IHNhbHQpIOKAlCBORVZFUiB0aGUgcmF3IGhhbmQAAAAMaGFuZF9oYXNoX3AyAAAD6AAAA+4AAAAgAAAAAAAAAAdwbGF5ZXIxAAAAABMAAAAAAAAADnBsYXllcjFfcG9pbnRzAAAAAAALAAAAAAAAAAdwbGF5ZXIyAAAAABMAAAAAAAAADnBsYXllcjJfcG9pbnRzAAAAAAALAAAAAAAAAAp0b3BfY29sb3VyAAAAAAAEAAAAAAAAAAl0b3BfdmFsdWUAAAAAAAAEAAAAAAAAAAZ3aW5uZXIAAAAAA+gAAAAT',
        'AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADwAAAAAAAAAMR2FtZU5vdEZvdW5kAAAAAQAAAAAAAAAJTm90UGxheWVyAAAAAAAAAgAAAAAAAAAQR2FtZUFscmVhZHlFbmRlZAAAAAMAAAAAAAAAC05vdFlvdXJUdXJuAAAAAAQAAAAAAAAAEEhhbmROb3RDb21taXR0ZWQAAAAFAAAAAAAAAA9JbnZhbGlkSGFuZEhhc2gAAAAABgAAAAAAAAANQ2FyZE5vdEluSGFuZAAAAAAAAAcAAAAAAAAAC0ludmFsaWRDYXJkAAAAAAgAAAAAAAAAEElsbGVnYWxXaWxkRHJhdzQAAAAJAAAAAAAAAA9JbnZhbGlkSGFuZFNpemUAAAAACgAAAAAAAAAUSGFuZEFscmVhZHlDb21taXR0ZWQAAAALAAAAAAAAAA5aa1Byb29mSW52YWxpZAAAAAAADAAAAAAAAAAQWmtWZXJpZmllck5vdFNldAAAAA0AAAAAAAAAFlprQWN0aXZlQ29sb3VyTWlzbWF0Y2gAAAAAAA4AAAAAAAAAE1prRHJhd0NvdW50TWlzbWF0Y2gAAAAADw==',
        'AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABAAAAAEAAAAAAAAABEdhbWUAAAABAAAABAAAAAAAAAAAAAAADkdhbWVIdWJBZGRyZXNzAAAAAAAAAAAAAAAAAAVBZG1pbgAAAAAAAAAAAAAAAAAADVJpc2MwVmVyaWZpZXIAAAA=',
        'AAAAAAAAAAAAAAAIZ2V0X2dhbWUAAAABAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAQAAB9AAAAAER2FtZQ==',
        'AAAAAAAAAAAAAAAKc3RhcnRfZ2FtZQAAAAAABQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAHcGxheWVyMQAAAAATAAAAAAAAAAdwbGF5ZXIyAAAAABMAAAAAAAAADnBsYXllcjFfcG9pbnRzAAAAAAALAAAAAAAAAA5wbGF5ZXIyX3BvaW50cwAAAAAACwAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAAIJEcmF3IGEgY2FyZCB1c2luZyBhIFJJU0MgWmVybyBaSyBwcm9vZi4KCkpvdXJuYWwgKDcyIGJ5dGVzKToKc2Vzc2lvbl9pZF9iZTMyIHx8IG9sZF9oYXNoKDMyKSB8fCBuZXdfaGFzaCgzMikgfHwgZHJhd19jb3VudF9iZTMyKDQpAAAAAAAMZHJhd19jYXJkX3prAAAABAAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAA1uZXdfaGFuZF9oYXNoAAAAAAAD7gAAACAAAAAAAAAAB3prX3NlYWwAAAAADgAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAAatQbGF5IGEgY2FyZCB1c2luZyBhIFJJU0MgWmVybyBaSyBwcm9vZi4KCkpvdXJuYWwgKDc0IGJ5dGVzKToKc2Vzc2lvbl9pZF9iZTMyIHx8IG9sZF9oYXNoKDMyKSB8fCBuZXdfaGFzaCgzMikgfHwKcGxheWVkX2NvbG91cigxKSB8fCBwbGF5ZWRfdmFsdWUoMSkgfHwgd2lsZF9jb2xvdXIoMSkgfHwgYWN0aXZlX2NvbG91cigxKSB8fAppc193aW5uZXIoMSkgfHwgaXNfdW5vKDEpCgpUaGUgWksgcHJvb2YgZ3VhcmFudGVlcyBpc193aW5uZXIvaXNfdW5vIGFyZSBob25lc3RseSBjb21wdXRlZCBmcm9tIHRoZQpoYW5kIHVwZGF0ZS4gIFdoZW4gaXNfd2lubmVyIGlzIHRydWUsIHRoZSBjb250cmFjdCBmaW5hbGl6ZXMgdGhlIGdhbWUgYW5kCnJlcG9ydHMgdG8gdGhlIEdhbWUgSHViIOKAlCBoYW5kIHNpemUgaXMgbmV2ZXIgcmV2ZWFsZWQgb24tY2hhaW4uAAAAAAxwbGF5X2NhcmRfemsAAAAJAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAAAAAAADXBsYXllZF9jb2xvdXIAAAAAAAAEAAAAAAAAAAxwbGF5ZWRfdmFsdWUAAAAEAAAAAAAAAAt3aWxkX2NvbG91cgAAAAAEAAAAAAAAAA1uZXdfaGFuZF9oYXNoAAAAAAAD7gAAACAAAAAAAAAAB3prX3NlYWwAAAAADgAAAAAAAAAJaXNfd2lubmVyAAAAAAAAAQAAAAAAAAAGaXNfdW5vAAAAAAABAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIZ2FtZV9odWIAAAATAAAAAA==',
        'AAAAAAAAAAAAAAANZ2V0X2RlY2tfY2FyZAAAAAAAAAIAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAABWluZGV4AAAAAAAABAAAAAEAAAPtAAAAAgAAAAQAAAAE',
        'AAAAAAAAAGVDb21taXQgaW5pdGlhbCBoYW5kIGhhc2ggV0lUSCBhIFJJU0MgWmVybyBaSyBwcm9vZi4KCkpvdXJuYWwgKDM2IGJ5dGVzKTogc2Vzc2lvbl9pZF9iZTMyIHx8IGhhbmRfaGFzaAAAAAAAAA5jb21taXRfaGFuZF96awAAAAAABAAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAAloYW5kX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHemtfc2VhbAAAAAAOAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAARpQcm92ZSB5b3UgaGF2ZSBleGFjdGx5IDEgY2FyZCB3aXRob3V0IHJldmVhbGluZyBpdC4KCkpvdXJuYWwgKDM2IGJ5dGVzKTogc2Vzc2lvbl9pZF9iZTMyIHx8IGhhbmRfaGFzaApUaGUgWksgcHJvb2YgdGllcyB0aGUgcHJvb2YgdG8gdGhlIHBsYXllcidzIGN1cnJlbnRseS1zdG9yZWQgaGFuZF9oYXNoLApwcmV2ZW50aW5nIHRoZSBwcm9vZiBmcm9tIGJlaW5nIHJlcGxheWVkIGluIGEgZGlmZmVyZW50IHNlc3Npb24gb3IgZm9yIGEKcGxheWVyIHdpdGggYSBkaWZmZXJlbnQgaGFuZCBzdGF0ZS4AAAAAAA5kZWNsYXJlX3Vub196awAAAAAAAwAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAAd6a19zZWFsAAAAAA4AAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAAAAAAAASZ2V0X3Jpc2MwX3ZlcmlmaWVyAAAAAAAAAAAAAQAAA+gAAAAT',
        'AAAAAAAAAAAAAAASc2V0X3Jpc2MwX3ZlcmlmaWVyAAAAAAABAAAAAAAAAAh2ZXJpZmllcgAAABMAAAAA',
      ]),
      options
    );
  }
  public readonly fromJSON = {
    get_game: this.txFromJSON<Game>,
    start_game: this.txFromJSON<Result<void>>,
    draw_card_zk: this.txFromJSON<Result<void>>,
    play_card_zk: this.txFromJSON<Result<void>>,
    get_deck_card: this.txFromJSON<readonly [u32, u32]>,
    commit_hand_zk: this.txFromJSON<Result<void>>,
    declare_uno_zk: this.txFromJSON<Result<void>>,
    get_risc0_verifier: this.txFromJSON<Option<string>>,
    set_risc0_verifier: this.txFromJSON<null>,
  };
}
