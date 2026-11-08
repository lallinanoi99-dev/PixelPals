// A local BOT Chain stand-in for trying the site in live mode without spending gas.
// Starts an in-memory chain on http://127.0.0.1:8545 (chain ID 677), deploys PixelPals,
// hatches a few pals and gives them some history, then prints the URL to open.
// Usage (from the project root): node tools/compile.mjs && node tools/dev-chain.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory } from 'ethers';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { abi, bytecode } = JSON.parse(readFileSync(join(root, 'build/PixelPals.json'), 'utf8'));
const server = ganache.server({ logging: { quiet: true }, chain: { chainId: 677, hardfork: 'merge' }, wallet: { totalAccounts: 6 } });
await server.listen(8545);
const provider = new BrowserProvider(server.provider);
const signers = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => provider.getSigner(i)));
const GAS = { gasLimit: 1_000_000 };
const pals = await (await new ContractFactory(abi, bytecode, signers[0]).deploy()).waitForDeployment();
const addr = await pals.getAddress();
const day = async () => { await server.provider.request({ method: 'evm_increaseTime', params: [86400] }); await server.provider.request({ method: 'evm_mine', params: [] }); };
const care = async (s, id) => { for (const fn of ['feed', 'play', 'sleep']) await (await pals.connect(s)[fn](id, GAS)).wait(); };

for (const s of signers) for (let k = 0; k < 2; k++) await (await pals.connect(s).hatch(GAS)).wait();
await (await pals.connect(signers[0]).setName(1, 'Mochi', GAS)).wait();
await (await pals.connect(signers[1]).setName(3, 'Bean', GAS)).wait();
await (await pals.connect(signers[2]).setName(5, 'Pudding', GAS)).wait();
for (let d = 0; d < 15; d++) {
  await care(signers[0], 1);
  if (d < 8) await care(signers[1], 3);
  if (d % 2 === 0) await care(signers[2], 5);
  await day();
}
console.log(`dev chain on http://127.0.0.1:8545 — PixelPals at ${addr}`);
console.log(`open http://localhost:4617/?rpc=http://127.0.0.1:8545&contract=${addr}`);
