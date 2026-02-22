#!/usr/bin/env bun
/**
 * setup-verifier.ts
 *
 * End-to-end script that:
 *  1. Creates (or reuses) a dedicated "verifier admin" keypair
 *  2. Deploys the groth16-verifier contract from NethermindEth/stellar-risc0-verifier
 *  3. Deploys the risc0-router contract and registers the groth16-verifier
 *  4. Re-deploys the zk-uno game contract with the new admin (so we own it)
 *  5. Calls set_risc0_verifier on the zk-uno contract
 *  6. Updates deployment.json and .env with all new IDs + the admin secret
 *
 * Pre-requisites:
 *   - WASMs must already be built:
 *       /tmp/stellar-risc0-verifier/target/wasm32v1-none/release/groth16_verifier.wasm
 *       /tmp/stellar-risc0-verifier/target/wasm32v1-none/release/risc0_router.wasm
 *       target/wasm32v1-none/release/zk_uno.wasm (in this repo)
 *   - stellar CLI in PATH
 */

import { $ } from "bun";
import { existsSync } from "node:fs";

// ── Constants ──────────────────────────────────────────────────────────────────

const NETWORK = "testnet";
const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const MOCK_GAME_HUB_ID = "CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG";
const GROTH16_SELECTOR = "73c457ba"; // 4-byte selector embedded in groth16-verifier at build time

// WASMs – pre-built (from earlier build step)
const GROTH16_WASM = "/tmp/stellar-risc0-verifier/target/wasm32v1-none/release/groth16_verifier.wasm";
const ROUTER_WASM = "/tmp/stellar-risc0-verifier/target/wasm32v1-none/release/risc0_router.wasm";
const ZK_UNO_WASM = "/mnt/d/Projects/Stellar-Game-Studio/target/wasm32v1-none/release/zk_uno.wasm";

const ENV_FILE = "/mnt/d/Projects/Stellar-Game-Studio/.env";
const DEPLOYMENT_JSON = "/mnt/d/Projects/Stellar-Game-Studio/deployment.json";

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    result[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return result;
}

async function friendbotFund(address: string): Promise<void> {
  // Check if account already exists
  const checkRes = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
  if (checkRes.ok) {
    console.log(`  ✓ ${address} already funded`);
    return;
  }
  console.log(`  💰 Funding ${address} via friendbot...`);
  const res = await fetch(`https://friendbot.stellar.org?addr=${address}`);
  if (!res.ok) throw new Error(`Friendbot failed (${res.status}) for ${address}`);
  // Wait for account to appear
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const check = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
    if (check.ok) { console.log(`  ✓ Funded`); return; }
  }
  throw new Error(`Funded ${address} but account not appearing on Horizon`);
}

async function stellarDeploy(wasmPath: string, secret: string, extraArgs: string[]): Promise<string> {
  const args = [
    "contract", "deploy",
    "--wasm", wasmPath,
    "--source-account", secret,
    "--network", NETWORK,
    "--",
    ...extraArgs,
  ];
  // Remove trailing `--` if no extra args
  if (extraArgs.length === 0) args.splice(args.indexOf("--"), 1);

  const result = await $`stellar ${args}`.text();
  const contractId = result.trim().split("\n").at(-1)!.trim();
  if (!contractId.match(/^C[A-Z2-7]{55}$/)) {
    throw new Error(`Unexpected contract ID format: "${contractId}"\nFull output:\n${result}`);
  }
  return contractId;
}

async function stellarInvoke(contractId: string, secret: string, fn: string, fnArgs: string[]): Promise<string> {
  const args = [
    "contract", "invoke",
    "--id", contractId,
    "--source-account", secret,
    "--network", NETWORK,
    "--",
    fn,
    ...fnArgs,
  ];
  const result = await $`stellar ${args}`.text();
  return result.trim();
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("\n🔐 ZK-UNO Verifier Setup\n");

// Step 0: Load existing .env
let envVars: Record<string, string> = {};
if (existsSync(ENV_FILE)) {
  const content = await Bun.file(ENV_FILE).text();
  envVars = parseEnv(content);
}

// Step 1: Create or reuse verifier admin keypair
const Keypair = (await import("@stellar/stellar-sdk")).Keypair;

let adminSecret: string;
let adminAddress: string;

const existingAdminSecret = envVars["VITE_VERIFIER_ADMIN_SECRET"] || envVars["RISC0_ADMIN_SECRET"] || "";

if (existingAdminSecret && existingAdminSecret !== "NOT_AVAILABLE") {
  console.log("♻️  Using existing verifier admin secret from .env");
  const kp = Keypair.fromSecret(existingAdminSecret);
  adminSecret = existingAdminSecret;
  adminAddress = kp.publicKey();
} else {
  console.log("🔑 Generating new verifier admin keypair...");
  const kp = Keypair.random();
  adminSecret = kp.secret();
  adminAddress = kp.publicKey();
}
console.log(`  Admin: ${adminAddress}`);

// Fund admin
await friendbotFund(adminAddress);

// Step 2: Deploy groth16-verifier (no constructor args)
console.log("\n📦 Deploying groth16-verifier...");
if (!existsSync(GROTH16_WASM.replace("/mnt/d", "D:"))) {
  // Try WSL path check differently
}
const groth16Id = await stellarDeploy(GROTH16_WASM, adminSecret, []);
console.log(`  ✅ groth16-verifier: ${groth16Id}`);

// Step 3: Deploy risc0-router (constructor: --owner <admin>)
console.log("\n📦 Deploying risc0-router...");
const routerId = await stellarDeploy(ROUTER_WASM, adminSecret, ["--owner", adminAddress]);
console.log(`  ✅ risc0-router: ${routerId}`);

// Step 4: Register groth16-verifier with the router
console.log("\n🔗 Registering groth16-verifier with router...");
console.log(`  Selector: ${GROTH16_SELECTOR}`);
await stellarInvoke(routerId, adminSecret, "add_verifier", [
  "--selector", GROTH16_SELECTOR,
  "--verifier", groth16Id,
]);
console.log(`  ✅ Verifier registered`);

// Step 5: Re-deploy zk-uno with the new admin (so we can call set_risc0_verifier)
console.log("\n📦 Re-deploying zk-uno with new admin...");

// First install (get WASM hash), then deploy with constructor
const installResult = await $`stellar contract install --wasm ${ZK_UNO_WASM} --source-account ${adminSecret} --network ${NETWORK}`.text();
const wasmHash = installResult.trim().split("\n").at(-1)!.trim();
console.log(`  WASM hash: ${wasmHash}`);

const deployResult = await $`stellar contract deploy --wasm-hash ${wasmHash} --source-account ${adminSecret} --network ${NETWORK} -- --admin ${adminAddress} --game-hub ${MOCK_GAME_HUB_ID}`.text();
const zkUnoId = deployResult.trim().split("\n").at(-1)!.trim();
if (!zkUnoId.match(/^C[A-Z2-7]{55}$/)) {
  throw new Error(`Bad zk-uno contract ID: "${zkUnoId}"`);
}
console.log(`  ✅ zk-uno: ${zkUnoId}`);

// Step 6: Set risc0-router as the verifier on zk-uno
console.log("\n⚙️  Setting risc0-router as verifier on zk-uno...");
await stellarInvoke(zkUnoId, adminSecret, "set_risc0_verifier", [
  "--verifier", routerId,
]);
console.log(`  ✅ set_risc0_verifier complete`);

// Step 7: Read back to confirm
const verifierCheck = await stellarInvoke(zkUnoId, adminSecret, "get_risc0_verifier", []);
console.log(`  ✅ get_risc0_verifier → ${verifierCheck}`);

// ── Persist results ────────────────────────────────────────────────────────────

// Update deployment.json
const deployment = {
  mockGameHubId: MOCK_GAME_HUB_ID,
  contracts: {
    "mock-game-hub": MOCK_GAME_HUB_ID,
    "dice-duel": "",
    "number-guess": "",
    "twenty-one": "",
    "zk-uno": zkUnoId,
    "groth16-verifier": groth16Id,
    "risc0-router": routerId,
  },
  network: NETWORK,
  rpcUrl: RPC_URL,
  networkPassphrase: NETWORK_PASSPHRASE,
  wallets: {
    admin: adminAddress,
    player1: envVars["VITE_DEV_PLAYER1_ADDRESS"] || "",
    player2: envVars["VITE_DEV_PLAYER2_ADDRESS"] || "",
  },
  risc0: {
    groth16VerifierId: groth16Id,
    routerId,
    selector: GROTH16_SELECTOR,
  },
  deployedAt: new Date().toISOString(),
};

await Bun.write(DEPLOYMENT_JSON, JSON.stringify(deployment, null, 2) + "\n");
console.log("\n✅ Updated deployment.json");

// Update .env
const p1Secret = envVars["VITE_DEV_PLAYER1_SECRET"] || "";
const p2Secret = envVars["VITE_DEV_PLAYER2_SECRET"] || "";
const p1Addr = envVars["VITE_DEV_PLAYER1_ADDRESS"] || "";
const p2Addr = envVars["VITE_DEV_PLAYER2_ADDRESS"] || "";

const newEnv = `# Auto-generated by setup-verifier.ts
# WARNING: Contains secret keys. Never commit to git!

VITE_SOROBAN_RPC_URL=${RPC_URL}
VITE_NETWORK_PASSPHRASE=${NETWORK_PASSPHRASE}
VITE_MOCK_GAME_HUB_CONTRACT_ID=${MOCK_GAME_HUB_ID}
VITE_DICE_DUEL_CONTRACT_ID=
VITE_NUMBER_GUESS_CONTRACT_ID=
VITE_TWENTY_ONE_CONTRACT_ID=
VITE_ZK_UNO_CONTRACT_ID=${zkUnoId}

# Verifier contracts
VITE_GROTH16_VERIFIER_CONTRACT_ID=${groth16Id}
VITE_RISC0_ROUTER_CONTRACT_ID=${routerId}

# Dev wallet addresses
VITE_DEV_ADMIN_ADDRESS=${adminAddress}
VITE_DEV_PLAYER1_ADDRESS=${p1Addr}
VITE_DEV_PLAYER2_ADDRESS=${p2Addr}

# Dev wallet secrets (WARNING: Never commit!)
VITE_VERIFIER_ADMIN_SECRET=${adminSecret}
VITE_DEV_PLAYER1_SECRET=${p1Secret}
VITE_DEV_PLAYER2_SECRET=${p2Secret}
`;

await Bun.write(ENV_FILE, newEnv);
console.log("✅ Updated .env");

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                   Deployment Summary                         ║
╠══════════════════════════════════════════════════════════════╣
║  Network          : ${NETWORK.padEnd(39)}║
║  Admin            : ${adminAddress.slice(0, 39).padEnd(39)}║
╠══════════════════════════════════════════════════════════════╣
║  groth16-verifier : ${groth16Id.slice(0, 39).padEnd(39)}║
║  risc0-router     : ${routerId.slice(0, 39).padEnd(39)}║
║  zk-uno           : ${zkUnoId.slice(0, 39).padEnd(39)}║
╠══════════════════════════════════════════════════════════════╣
║  Selector (hex)   : ${GROTH16_SELECTOR.padEnd(39)}║
╚══════════════════════════════════════════════════════════════╝

Next steps:
  1. Update IMAGE_IDs in contracts/zk-uno/src/lib.rs after rzup build
  2. Run: bun run setup-verifier (again) to redeploy with real IMAGE_IDs
  3. Wire ZkUnoGame.tsx to ZK service methods
`);
