// Renders every species × stage × mood × accessory (and every palette / pattern) through the
// deployed PixelPalsArt contract and checks each SVG is identical to assets/sprites.js renderSVG().
// Run after compile.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, Contract } from 'ethers';
import { renderSVG } from '../assets/sprites.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { abi, bytecode } = JSON.parse(readFileSync(join(root, 'build/PixelPals.json'), 'utf8'));
const provider = new BrowserProvider(ganache.provider({ logging: { quiet: true }, chain: { hardfork: 'merge' } }));
const signer = await provider.getSigner(0);
const pals = await (await new ContractFactory(abi, bytecode, signer).deploy()).waitForDeployment();
const art = new Contract(await pals.art(), ['function svg((uint256 species,uint256 stage,uint256 palette,uint256 pattern,uint256 accessory,uint256 mood,uint256 careDays)) pure returns (string)'], provider);

const check = async (t) => assert.equal(await art.svg({ ...t, careDays: 0 }), renderSVG(t), JSON.stringify(t));
let n = 0;
for (let species = 0; species < 3; species++)
  for (let stage = 0; stage < 4; stage++)
    for (let mood = 0; mood < 3; mood++)
      for (let accessory = 0; accessory < 5; accessory++) {
        await check({ species, stage, palette: (species * 3 + stage + accessory) % 8, pattern: (stage + mood + accessory) % 4, accessory, mood });
        n++;
      }
for (let palette = 0; palette < 8; palette++)
  for (let pattern = 0; pattern < 4; pattern++) { await check({ species: 2, stage: 3, palette, pattern, accessory: 1, mood: 0 }); n++; }
console.log(`Contract SVG identical to renderSVG() for ${n} trait combinations ✓`);
