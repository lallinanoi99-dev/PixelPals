# Pixel Pals

A tiny pixel pet that lives on BOT Chain. Hatch it, feed it, play with it, tuck it in — and watch it grow from an egg into an adult. Its art is drawn by the contract itself, so it changes everywhere, forever.

*Free to hatch (gas only). 677 eggs, up to 3 per wallet. No payments, no admin, no royalties, no backend.*

## Status

| | |
|---|---|
| Live site | _not published yet_ |
| Contract (BOT Chain mainnet, chain ID 677) | _not deployed yet_ — paste the address here and into `assets/config.js` |
| Contract (testnet, chain ID 968) | _not deployed yet_ |

## What's inside

- `index.html`: the whole site. `/` is the storytelling website ("Mochi's first two weeks"), `/app` is the app, `/app/playground` the gallery, `?pal=42` a pal's page.
- `assets/sprites.js`: **the one source of truth for the art.** 3 species × 4 stages of 16×16 sprites, 8 palettes, 4 patterns, 5 accessories, 3 moods, plus `renderSVG()`, which returns exactly the SVG the contract returns.
- `contracts/PixelPals.sol`: two contracts in one file. `PixelPals` is the ERC-721 (OpenZeppelin 5) with all the game rules. `PixelPalsArt` draws the SVG and builds the token JSON; `PixelPals` deploys it automatically in its constructor, so you only ever deploy `PixelPals`. The art block inside `PixelPalsArt` is generated from `assets/sprites.js`.
- `assets/config.js`: contract addresses and links (the one place to edit after deploying).
- `assets/chain.js`: wallet + contract calls, plus **preview mode** (see below).
- `assets/site.js`: GSAP scroll story (ScrollTrigger, SplitText, Flip, MotionPath, Lenis).
- `assets/app.js`: hatch flow, the pixel room with Feed / Play / Sleep, evolution scene, share card, Playground, pal pages.
- `deploy.html`: one-click deploy from MetaMask to testnet or mainnet.
- `build/`: compiled ABI + bytecode and the standard JSON input for explorer verification.
- `tools/`: sprite packer, compiler, tests, a local dev chain and a dev server.

## How it works

- **Day** = `block.timestamp / 1 days` (UTC). Feed, Play and Sleep each work once per day per pal.
- The third action of a day adds a **care day**. Stages: Egg (0) → Baby (1) → Teen (7) → Adult (14). Stages only go up.
- **Mood** is computed in views from days since the last care day: 0–1 Happy, 2 Okay, 3+ Sad (with a rain cloud). It changes without any transaction. Pals never die; one full care day makes them happy again.
- **Traits** are rolled at hatch with `keccak256(block.prevrandao, msg.sender, id)`. This is *not* secure randomness — fine here, because traits are cosmetic only.
- **Art**: each sprite is 64 bytes of 2-bit pixels (empty / outline / body / accent). The contract decodes them, applies the palette and pattern, and emits one `<rect>` per horizontal run, with `shape-rendering="crispEdges"`. Faces, accessories and the rain cloud are small overlays.
- **Care history**: a 64-bit bitmap per pal (`historyOf`) powers the 14-day care dots and streaks without reading event logs.
- Names: 1–16 letters, numbers or spaces, once per day per pal.

Contract surface: `hatch()`, `feed(id)`, `play(id)`, `sleep(id)`, `setName(id, name)`; views `getPal`, `stageOf`, `moodOf`, `historyOf`, `palsOf`, `palsRange`, `totalHatched`, `today`, `tokenURI`, and `art` (the address of the art contract, whose `svg(look)` returns just the image). Events `Hatched`, `Cared`, `CareDay`, `Evolved`, `Named`.

Size (limit 24 KB per contract):

| | optimizer on (200 runs) | optimizer off |
|---|---|---|
| `PixelPals` | 10.0 KB | 17.9 KB |
| `PixelPalsArt` | 8.0 KB | 10.8 KB |

Both fit either way, so a missed optimizer checkbox in Remix can't block the deploy. Hatch ≈ 139k gas, a care action ≈ 35–59k gas. Deploying costs more than a single contract would, because it creates both.

## Sound and music

Everything you hear is synthesized live with Web Audio in `assets/sound.js` — no audio files, nothing to license.

- **Music**: three original chiptune loops — a bouncy *story* theme on the website, a cozy music-box *room* theme in the app, and a soft *rain* theme for the rainy chapter and for sad pals.
- **Effects**: crunchy munching while a pal eats, boings and ball bounces while it plays, a lullaby with snores and Zzz while it sleeps, plus a care-day jingle, an evolution fanfare, egg wiggles and cracking, slot-reel ticks, rain, a rainbow sparkle, and soft button clicks.
- **Tiny voices**: every pal babbles in its own voice — cats meow-squeak, dinos grumble low, blobs bubble. Babies squeak higher than adults, and mood changes the melody (happy bounces, sad droops). Pals say hello when you open their room, chatter now and then, and react when you click (pet) them. On the website, hero pals squeak as your cursor reaches them and the bento pals say hi on hover.

Browsers keep pages silent until the first click or tap, so a small hint invites one. The speaker button in the nav turns all sound on or off and is remembered. In the console, `(await import('/assets/sound.js')).soundState()` shows what the audio engine is doing.

## Run locally

```bash
node tools/serve.mjs
```

Then open http://localhost:4617. The server falls back to `index.html` for `/app` routes, like GitHub Pages does with `404.html`.

**Preview mode.** While `contract` in `assets/config.js` is empty, the app runs a local copy of the contract rules in the browser's localStorage, seeded with 48 demo pals. Without MetaMask it uses a preview wallet. In the app, *⏭ Tomorrow* and *+3 days* let you test growing up and moods. Add `?reset` to the URL to start over, or `?preview` to force preview mode once a contract is set.

**Live mode against a local chain** (no gas, no MetaMask needed for reading):

```bash
npm --prefix tools install
```

```bash
node tools/compile.mjs && node tools/dev-chain.mjs
```

It deploys to an in-memory chain on port 8545, hatches 12 pals with some care history, and prints a URL like `http://localhost:4617/?rpc=http://127.0.0.1:8545&contract=0x…`. The `rpc` / `contract` override only works on localhost.

## Tests

```bash
npm --prefix tools install
```

```bash
node tools/gen-sprites.mjs && node tools/compile.mjs && node tools/test-contract.mjs && node tools/test-art.mjs
```

- `test-contract.mjs` covers hatching, the 3-per-wallet and 677 caps, care days, evolution events, moods over time, history bits, names, transfers, and checks that `tokenURI`'s SVG equals `renderSVG()`.
- `test-art.mjs` renders 212 trait combinations (every species × stage × mood × accessory, every palette × pattern) through the deployed `PixelPalsArt` contract and checks each one is byte-identical to `renderSVG()`.

`tools/sheet.html` (open it through the dev server) shows a sprite sheet of every species and stage.

## Editing the art

1. Edit the sprites, palettes or overlays in `assets/sprites.js`.
2. Run `node tools/gen-sprites.mjs`. It rewrites the `// <art>` block (inside `PixelPalsArt`) in `contracts/PixelPals.sol` and the 12 website SVGs in `assets/sprites/`.
3. Compile and run both tests. Art changes must happen before the mainnet deploy — the deployed contract's art can't change.

## 1. Deploy the contract

Compiled with Solidity 0.8.20, optimizer 200 runs, EVM `paris`. The constructor takes no arguments.

1. Run the site locally and open http://localhost:4617/deploy.html in a browser with MetaMask.
2. Click **Deploy to Testnet (968)**, confirm in MetaMask, then try the app at http://localhost:4617/app?net=testnet. On localhost the app picks up the address you just deployed.
3. Click **Deploy to Mainnet (677)**.
4. Paste each address into the matching `contract: ''` field in `assets/config.js`, and into the Status table above. The mainnet `contract` feeds the app, the footer address and the explorer link.

Or use Remix:

1. Open https://remix.ethereum.org and create `PixelPals.sol` with the contents of `contracts/PixelPals.sol`. Remix fetches the `@openzeppelin/contracts` imports by itself.
2. In *Solidity compiler*: compiler **0.8.20**. Under *Advanced configurations*, set **EVM version `paris`** (newer EVM versions use opcodes BOT Chain may not support) and tick **Enable optimization** with 200 runs (recommended, but no longer required for size).
3. In *Deploy & run transactions*: environment *Injected Provider – MetaMask*, and in the **Contract** dropdown pick **`PixelPals`**, not `PixelPalsArt`. Click *Deploy*; `PixelPals` creates `PixelPalsArt` by itself.
4. The address to paste into `assets/config.js` is the `PixelPals` one.

| Network | Chain ID | RPC | Explorer |
|---|---|---|---|
| Testnet | 968 | https://rpc.bohr.life | https://scan.bohr.life |
| Mainnet | 677 | https://rpc.botchain.ai | https://scan.botchain.ai |

To verify the source on the explorer, use "Standard JSON input" with `build/PixelPals.standard-input.json` and compiler `v0.8.20+commit.a1b79de6`. Verify `PixelPals` at its address; `PixelPalsArt` (its address is in `PixelPals.art()`) uses the same file, with contract name `PixelPalsArt`. These settings match the build here (optimizer on, 200 runs, `paris`); a Remix deploy with other settings needs those same settings when verifying.

## 2. Publish the site (GitHub Pages)

1. Push this folder to a GitHub repository (`tools/node_modules` is git-ignored).
2. Settings → Pages → deploy from the default branch, root folder.
3. Custom domain: add it in Settings → Pages, which creates a `CNAME` file, and point your DNS at GitHub Pages.
4. Set `links.github` and `links.x` in `assets/config.js`, and change `og:image` in `index.html` to the absolute URL of `assets/og.png` so link previews show it.

`404.html` sends deep links such as `/app/playground` back to `index.html`, which restores the path. It also works on a `username.github.io/repo/` project page without a custom domain.

## Footer

The footer carries the clickable BOT Chain logo (→ https://botchain.ai), the chain ID and short contract address (click to copy), **View on explorer** (→ `https://scan.botchain.ai/address/<contract>`), and the live hatched count.
