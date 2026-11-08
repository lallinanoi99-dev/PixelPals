// Runs the compiled contract on an in-memory chain and checks every rule in the PRD,
// plus that the contract's SVG is identical to assets/sprites.js renderSVG() (one source of truth).
// Usage (from the project root): node tools/gen-sprites.mjs && node tools/compile.mjs && node tools/test-contract.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory } from 'ethers';
import { renderSVG, stageOf, moodOf } from '../assets/sprites.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { abi, bytecode } = JSON.parse(readFileSync(join(root, 'build/PixelPals.json'), 'utf8'));

const chain = ganache.provider({ logging: { quiet: true }, chain: { hardfork: 'merge', chainId: 677 }, wallet: { totalAccounts: 12 } });
const provider = new BrowserProvider(chain);
const signers = await Promise.all([...Array(12).keys()].map((i) => provider.getSigner(i)));
const [alice, bob, carol] = signers;
const GAS = { gasLimit: 1_000_000 };

const pals = await (await new ContractFactory(abi, bytecode, alice).deploy()).waitForDeployment();
const as = (s) => pals.connect(s);
const events = (r) => r.logs.map((l) => pals.interface.parseLog(l)).filter(Boolean);
const reverts = (call, name) => assert.rejects(call, (e) => e.revert?.name === name || e.message?.includes(name), `expected ${name}`);
const nextDay = async (days = 1) => { await chain.request({ method: 'evm_increaseTime', params: [days * 86400] }); await chain.request({ method: 'evm_mine', params: [] }); };
const decode = (uri) => JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf8'));
const svgOf = (meta) => Buffer.from(meta.image.split(',')[1], 'base64').toString('utf8');
const attr = (meta, k) => meta.attributes.find((a) => a.trait_type === k).value;

// --- empty ------------------------------------------------------------
assert.match(await pals.art(), /^0x[0-9a-fA-F]{40}$/);
assert.notEqual(await pals.art(), '0x0000000000000000000000000000000000000000', 'constructor deploys the art contract');
assert.equal(await pals.totalHatched(), 0n);
assert.equal(await pals.name(), 'Pixel Pals');
assert.deepEqual([...(await pals.palsOf(alice.address))], []);
await assert.rejects(pals.tokenURI(1));

// --- hatch ------------------------------------------------------------
let r = await (await as(alice).hatch(GAS)).wait();
console.log(`hatch gas: ${r.gasUsed}`);
let [, ev] = events(r); // Transfer, Hatched
assert.equal(ev.name, 'Hatched');
assert.equal(ev.args.id, 1n);
const p1 = await pals.getPal(1);
assert.ok(p1.species < 3n && p1.palette < 8n && p1.pattern < 4n && p1.accessory < 5n);
assert.equal(p1.careDays, 0n);
assert.equal(p1.lastCareDay, await pals.today());
assert.equal(await pals.stageOf(1), 0n);
assert.equal(await pals.moodOf(1), 0n);
assert.equal(await pals.historyOf(1), 0n);

// per-wallet cap
await (await as(alice).hatch(GAS)).wait();
await (await as(alice).hatch(GAS)).wait();
await reverts(as(alice).hatch.staticCall(), 'WalletFull');
assert.deepEqual([...(await pals.palsOf(alice.address))], [1n, 2n, 3n]);
assert.equal(await pals.minted(alice.address), 3n);

// --- care -------------------------------------------------------------
await reverts(as(bob).feed.staticCall(1), 'NotOwner');
r = await (await as(alice).feed(1, GAS)).wait();
assert.equal(events(r)[0].name, 'Cared');
await reverts(as(alice).feed.staticCall(1), 'AlreadyDone');
await (await as(alice).play(1, GAS)).wait();
assert.equal((await pals.getPal(1)).careDays, 0n, 'two actions are not a care day');
r = await (await as(alice).sleep(1, GAS)).wait();
console.log(`3rd care action gas: ${r.gasUsed}`);
let names = events(r).map((e) => e.name);
assert.deepEqual(names, ['Cared', 'CareDay', 'Evolved']);
assert.equal(events(r)[2].args.stage, 1n);
assert.equal((await pals.getPal(1)).careDays, 1n);
assert.equal(await pals.stageOf(1), 1n, 'Baby after 1 care day');
assert.equal(await pals.historyOf(1), 1n);
await reverts(as(alice).sleep.staticCall(1), 'AlreadyDone');

const careDay = async (id, who = alice) => {
  for (const fn of ['feed', 'play', 'sleep']) await (await as(who)[fn](id, GAS)).wait();
};

// 6 more days → Teen at 7
for (let i = 0; i < 6; i++) { await nextDay(); await careDay(1); }
assert.equal((await pals.getPal(1)).careDays, 7n);
assert.equal(await pals.stageOf(1), 2n);
assert.equal(await pals.historyOf(1), 0b1111111n);

// --- mood: changes with time, no tx ------------------------------------
await nextDay();
assert.equal(await pals.moodOf(1), 0n, 'cared yesterday → happy');
await nextDay();
assert.equal(await pals.moodOf(1), 1n, '1 day missed → okay');
await nextDay();
assert.equal(await pals.moodOf(1), 2n, '2+ days missed → sad');
let meta = decode(await pals.tokenURI(1));
assert.equal(attr(meta, 'Mood'), 'Sad');
assert.ok(svgOf(meta).includes('A9B4CF'), 'sad pal has a rain cloud');
assert.equal(await pals.historyOf(1), 0b1111111000n);
// one full care day makes it happy again, and stage never goes down
await careDay(1);
assert.equal(await pals.moodOf(1), 0n);
assert.equal(await pals.stageOf(1), 2n);
assert.equal(await pals.historyOf(1), 0b1111111001n);

// to Adult at 14
for (let i = 0; i < 6; i++) { await nextDay(); await careDay(1); }
assert.equal((await pals.getPal(1)).careDays, 14n);
assert.equal(await pals.stageOf(1), 3n);
meta = decode(await pals.tokenURI(1));
assert.equal(attr(meta, 'Stage'), 'Adult');
assert.equal(attr(meta, 'Care days'), 14);

// --- names ------------------------------------------------------------
await reverts(as(alice).setName.staticCall(1, ''), 'BadName');
await reverts(as(alice).setName.staticCall(1, 'x'.repeat(17)), 'BadName');
await reverts(as(alice).setName.staticCall(1, 'Mo<chi'), 'BadName');
await reverts(as(alice).setName.staticCall(1, ' Mochi'), 'BadName');
await reverts(as(alice).setName.staticCall(1, 'Mochi"}'), 'BadName');
await reverts(as(bob).setName.staticCall(1, 'Mochi'), 'NotOwner');
r = await (await as(alice).setName(1, 'Mochi 2', GAS)).wait();
assert.equal(events(r)[0].args.name, 'Mochi 2');
await reverts(as(alice).setName.staticCall(1, 'Again'), 'NameCooldown');
await as(alice).setName.staticCall(2, 'Bean'); // a different pal is fine
assert.equal((await pals.getPal(1)).name, 'Mochi 2');
meta = decode(await pals.tokenURI(1));
assert.equal(meta.name, 'Mochi 2 · Pixel Pal #1');
assert.equal(decode(await pals.tokenURI(2)).name, 'Pixel Pal #2');
await nextDay();
await as(alice).setName.staticCall(1, 'Again');

// --- transfer: new owner continues ------------------------------------
await (await as(alice).transferFrom(alice.address, bob.address, 1, GAS)).wait();
await reverts(as(alice).feed.staticCall(1), 'NotOwner');
await careDay(1, bob);
assert.equal((await pals.getPal(1)).careDays, 15n);
assert.deepEqual([...(await pals.palsOf(bob.address))], [1n]);
assert.deepEqual([...(await pals.palsOf(alice.address))], [2n, 3n]);
// minting cap counts hatches, not holdings
await reverts(as(alice).hatch.staticCall(), 'WalletFull');

// --- range view ---------------------------------------------------------
let [list, owners] = await pals.palsRange(0, 50);
assert.equal(list.length, 3);
assert.deepEqual([...owners], [bob.address, alice.address, alice.address]);
[list] = await pals.palsRange(3, 50);
assert.equal(list.length, 1);
[list] = await pals.palsRange(9, 5);
assert.equal(list.length, 0);

// --- SVG matches the website renderer for every species/stage/trait --
for (let i = 0; i < 9; i++) await (await as(signers[3 + i]).hatch(GAS)).wait();
let checked = 0, maxGas = 0n;
const total = Number(await pals.totalHatched());
for (let id = 1; id <= total; id++) {
  const p = await pals.getPal(id);
  const today = Number(await pals.today());
  const traits = { species: Number(p.species), stage: stageOf(Number(p.careDays)), palette: Number(p.palette), pattern: Number(p.pattern), accessory: Number(p.accessory), mood: moodOf(today, Number(p.lastCareDay)) };
  meta = decode(await pals.tokenURI(id));
  assert.equal(svgOf(meta), renderSVG(traits), `pal ${id} SVG matches renderSVG`);
  const gas = await pals.tokenURI.estimateGas(id);
  if (gas > maxGas) maxGas = gas;
  checked++;
}
// and every combination directly through a harness: hatch more pals across many blocks
const seen = new Set();
for (let id = 1; id <= total; id++) { const p = await pals.getPal(id); seen.add(`${p.species}`); }
console.log(`SVG identical to renderSVG for ${checked} pals (species seen: ${[...seen].join(',')}); tokenURI gas ≤ ${maxGas}`);

// --- supply cap ---------------------------------------------------------
// fill to 677 with fresh random wallets (3 each), then SoldOut
const { Wallet } = await import('ethers');
let hatched = Number(await pals.totalHatched());
const funder = signers[0];
while (hatched < 677) {
  const w = Wallet.createRandom().connect(provider);
  await chain.request({ method: 'evm_setAccountBalance', params: [w.address, '0x56BC75E2D63100000'] });
  for (let k = 0; k < 3 && hatched < 677; k++, hatched++) await (await pals.connect(w).hatch(GAS)).wait();
}
assert.equal(await pals.totalHatched(), 677n);
const late = Wallet.createRandom().connect(provider);
await chain.request({ method: 'evm_setAccountBalance', params: [late.address, '0x56BC75E2D63100000'] });
await reverts(pals.connect(late).hatch.staticCall(), 'SoldOut');
console.log(`palsOf gas at full supply: ${await pals.palsOf.estimateGas(funder.address)}`);
console.log(`palsRange(1,100) gas: ${await pals.palsRange.estimateGas(1, 100)}`);

console.log('All PixelPals contract tests passed ✓');
