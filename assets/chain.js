// Everything that talks to BOT Chain (or to the preview simulation).
// Live mode: reads go through the public RPC (works without a wallet); writes go through MetaMask.
// Preview mode (no contract address configured): the same rules run locally in localStorage.
import { CONFIG } from './config.js';
import { renderSVG, stageOf, moodOf, SPECIES, STAGES, PALETTES, PATTERNS, ACCESSORIES, MOODS } from './sprites.js';

const params = new URLSearchParams(location.search);
const netKey = params.get('net') === 'testnet' ? 'testnet' : 'mainnet';
const NET = { ...CONFIG.networks[netKey], key: netKey };

// On localhost only: deploy.html remembers the address it just deployed, and
// ?rpc=…&contract=… points the site at a local dev chain (tools/dev-chain.mjs).
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  if (params.get('rpc') && params.get('contract')) {
    NET.rpc = params.get('rpc');
    NET.contract = params.get('contract');
  } else if (!NET.contract) {
    try { NET.contract = localStorage.getItem(`${CONFIG.storageKey}.contract.${NET.chainId}`) || ''; } catch { /* ignore */ }
  }
}

export const MODE = NET.contract && params.get('preview') === null ? 'live' : 'preview';
export { NET };
export const explorerAddress = (a) => `${NET.explorer}/address/${a}`;
export const explorerTx = (h) => `${NET.explorer}/tx/${h}`;
export const explorerToken = (id) => `${NET.explorer}/token/${NET.contract}/instance/${id}`;
export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

const ABI = [
  'function hatch() returns (uint256)',
  'function feed(uint256)',
  'function play(uint256)',
  'function sleep(uint256)',
  'function setName(uint256,string)',
  'function today() view returns (uint32)',
  'function totalHatched() view returns (uint256)',
  'function minted(address) view returns (uint8)',
  'function lastNamed(uint256) view returns (uint32)',
  'function ownerOf(uint256) view returns (address)',
  'function historyOf(uint256) view returns (uint64)',
  'function palsOf(address) view returns (uint256[])',
  'function tokenURI(uint256) view returns (string)',
  'function getPal(uint256) view returns (tuple(uint8 species,uint8 palette,uint8 pattern,uint8 accessory,uint32 careDays,uint32 lastCareDay,uint32 lastFed,uint32 lastPlayed,uint32 lastSlept,uint64 bornAt,string name))',
  'function palsRange(uint256,uint256) view returns (tuple(uint8 species,uint8 palette,uint8 pattern,uint8 accessory,uint32 careDays,uint32 lastCareDay,uint32 lastFed,uint32 lastPlayed,uint32 lastSlept,uint64 bornAt,string name)[],address[])',
  'event Hatched(uint256 indexed id, address indexed owner, uint8 species)',
  'event CareDay(uint256 indexed id, uint32 careDays)',
  'event Evolved(uint256 indexed id, uint8 stage)',
  'error SoldOut()',
  'error WalletFull()',
  'error NotOwner()',
  'error AlreadyDone()',
  'error BadName()',
  'error NameCooldown()',
  'error ERC721NonexistentToken(uint256)',
];

export const ACTIONS = ['feed', 'play', 'sleep'];
export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{0,15}$/;

// ------------------------------------------------------------------ events
const listeners = new Set();
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = (what) => listeners.forEach((fn) => fn(what));

export const wallet = { account: '', chainOk: true, hasWallet: typeof window.ethereum !== 'undefined' };

// friendly errors
export class PalError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const MESSAGES = {
  SoldOut: 'All eggs have hatched — visit the Playground.',
  WalletFull: 'You have 3 pals — that’s a full room!',
  NotOwner: 'Only this pal’s owner can do that.',
  AlreadyDone: '✓ Done today — come back tomorrow.',
  BadName: 'Names are 1–16 letters, numbers or spaces.',
  NameCooldown: 'You can rename a pal once a day.',
  ERC721NonexistentToken: 'This pal wandered off.',
  rejected: 'Cancelled in MetaMask.',
  noWallet: 'Install MetaMask to hatch and care for a pal.',
  wrongNetwork: 'Switch to BOT Chain to continue.',
};
const fail = (code, extra) => { throw new PalError(code, MESSAGES[code] || extra || 'Something went wrong.'); };

// ------------------------------------------------------------------ shared helpers
export function decorate(p, today) {
  const stage = stageOf(p.careDays);
  const mood = moodOf(today, p.lastCareDay);
  return {
    ...p,
    stage,
    mood,
    age: Math.max(0, today - Math.floor(p.bornAt / 86400)),
    doneToday: { feed: p.lastFed === today, play: p.lastPlayed === today, sleep: p.lastSlept === today },
    svg: renderSVG({ species: p.species, stage, palette: p.palette, pattern: p.pattern, accessory: p.accessory, mood }),
    label: p.name || `Pal #${p.id}`,
    traits: {
      Species: SPECIES[p.species], Stage: STAGES[stage], Palette: PALETTES[p.palette][0],
      Pattern: PATTERNS[p.pattern], Accessory: ACCESSORIES[p.accessory], Mood: MOODS[mood],
    },
  };
}

const num = (v) => Number(v);
const fromTuple = (id, t, owner) => ({
  id: num(id), species: num(t.species), palette: num(t.palette), pattern: num(t.pattern), accessory: num(t.accessory),
  careDays: num(t.careDays), lastCareDay: num(t.lastCareDay), lastFed: num(t.lastFed), lastPlayed: num(t.lastPlayed),
  lastSlept: num(t.lastSlept), bornAt: num(t.bornAt), name: t.name, owner,
});

// ================================================================== LIVE
let ethersReady;
function loadEthers() {
  if (window.ethers) return Promise.resolve(window.ethers);
  ethersReady ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.5/ethers.umd.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(window.ethers);
    s.onerror = () => reject(new Error('Could not load ethers.js'));
    document.head.append(s);
  });
  return ethersReady;
}

let reader;
async function readContract() {
  if (reader) return reader;
  const { JsonRpcProvider, Contract } = await loadEthers();
  const provider = new JsonRpcProvider(NET.rpc, NET.chainId, { staticNetwork: true });
  reader = new Contract(NET.contract, ABI, provider);
  return reader;
}

let dayCache = { day: 0, at: 0 };
const live = {
  async today() {
    if (Date.now() - dayCache.at < 60_000) return dayCache.day;
    const c = await readContract();
    dayCache = { day: num(await c.today()), at: Date.now() };
    return dayCache.day;
  },
  async total() { return num(await (await readContract()).totalHatched()); },
  async minted(a) { return num(await (await readContract()).minted(a)); },
  async getPal(id) {
    const c = await readContract();
    try {
      const [t, owner, today, hist] = await Promise.all([c.getPal(id), c.ownerOf(id), live.today(), c.historyOf(id)]);
      return { ...decorate(fromTuple(id, t, owner), today), history: Number(hist & 0x3fffn) };
    } catch (e) {
      if (/NonexistentToken|0x7e273289/.test(e.message || '') || e.revert?.name === 'ERC721NonexistentToken') return null;
      throw e;
    }
  },
  async palsOf(a) {
    const ids = await (await readContract()).palsOf(a);
    return Promise.all(ids.map((id) => live.getPal(num(id))));
  },
  async range(start, count) {
    const c = await readContract();
    const [[list, owners], today] = await Promise.all([c.palsRange(start, count), live.today()]);
    return list.map((t, i) => decorate(fromTuple(start + i, t, owners[i]), today));
  },
  async tokenURI(id) {
    const uri = await (await readContract()).tokenURI(id);
    const meta = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(uri.split(',')[1]), (c) => c.charCodeAt(0))));
    const svg = new TextDecoder().decode(Uint8Array.from(atob(meta.image.split(',')[1]), (c) => c.charCodeAt(0)));
    return { meta, svg };
  },
  async send(method, args, onSent) {
    const signer = await signerFor();
    const c = new (window.ethers.Contract)(NET.contract, ABI, signer);
    try {
      await c[method].staticCall(...args); // surfaces custom errors before MetaMask opens
      const tx = await c[method](...args);
      onSent?.(tx.hash);
      const receipt = await tx.wait();
      dayCache.at = 0;
      return { hash: tx.hash, logs: receipt.logs.map((l) => { try { return c.interface.parseLog(l); } catch { return null; } }).filter(Boolean) };
    } catch (e) {
      throw liveError(e, c.interface);
    }
  },
};

function liveError(e, iface) {
  if (e instanceof PalError) return e;
  if (e.code === 'ACTION_REJECTED' || e.code === 4001 || e.info?.error?.code === 4001) return new PalError('rejected', MESSAGES.rejected);
  const name = e.revert?.name || (() => { try { return iface.parseError(e.data)?.name; } catch { return null; } })();
  if (name && MESSAGES[name]) return new PalError(name, MESSAGES[name]);
  return new PalError('failed', e.shortMessage || e.message || 'Transaction failed.');
}

async function switchChain() {
  const chainId = '0x' + NET.chainId.toString(16);
  try {
    await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (e) {
    const unknown = e.code === 4902 || e?.data?.originalError?.code === 4902 || /unrecognized chain/i.test(e.message || '');
    if (!unknown) throw e;
    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{ chainId, chainName: NET.name, nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 }, rpcUrls: [NET.rpc], blockExplorerUrls: [NET.explorer] }],
    });
  }
}

async function signerFor() {
  if (!window.ethereum) fail('noWallet');
  const { BrowserProvider } = await loadEthers();
  if (!wallet.account) await connect();
  if (!wallet.chainOk) {
    try { await switchChain(); } catch (e) { if (e.code === 4001) fail('rejected'); fail('wrongNetwork'); }
    await refreshChain();
    if (!wallet.chainOk) fail('wrongNetwork');
  }
  return new BrowserProvider(window.ethereum).getSigner();
}

async function refreshChain() {
  if (!window.ethereum) return;
  const id = await ethereum.request({ method: 'eth_chainId' });
  wallet.chainOk = parseInt(id, 16) === NET.chainId;
}

// ================================================================== PREVIEW
// A faithful local copy of the contract rules, so every screen can be tried before deploying.
const PKEY = `${CONFIG.storageKey}.preview.v2`;
const PREVIEW_WALLET = '0xA11CE00000000000000000000000000000009a15';
const DEMO_NAMES = ['Sakura', 'Bean', 'Pudding', 'Sprout', 'Tofu', 'Biscuit', 'Noodle', 'Peaches', 'Boba', 'Kiwi', 'Waffle', 'Pickle',
  'Dumpling', 'Pip', 'Clover', 'Sesame', 'Gummy', 'Taro', 'Nori', 'Miso', 'Latte', 'Jelly', 'Poppy', 'Button', 'Mango', 'Yuzu',
  'Cocoa', 'Bao', 'Marble', 'Sunny', 'Pebble', 'Toffee', 'Fig', 'Daisy', 'Juniper', 'Comet', 'Honey', 'Maple', 'Pistachio', 'Lychee'];

function realToday() { return Math.floor(Date.now() / 86_400_000); }

function seedPreview() {
  let s = 677;
  const rnd = (n) => ((s = (s * 16807) % 2147483647), s % n);
  const t = realToday();
  const pals = [];
  const owners = [];
  for (let i = 0; i < 16; i++) owners.push('0x' + [...Array(40)].map(() => '0123456789abcdef'[rnd(16)]).join(''));
  // Mochi first: strawberry-milk Blob with a bow, all grown up
  pals.push({ id: 1, species: 2, palette: 0, pattern: 0, accessory: 1, careDays: 14, lastCareDay: t - 1, lastFed: t - 1, lastPlayed: t - 1, lastSlept: t - 1, bornAt: (t - 15) * 86400, name: 'Mochi', owner: owners[0], history: 0b11111111111111 });
  for (let id = 2; id <= 48; id++) {
    const age = 1 + rnd(30);
    const careDays = rnd(4) === 0 ? 0 : Math.min(age, rnd(3) === 0 ? 14 + rnd(10) : rnd(14));
    const lastCareDay = t - [0, 0, 1, 1, 1, 2, 3, 5][rnd(8)];
    pals.push({
      id, species: rnd(3), palette: rnd(8), pattern: rnd(4), accessory: rnd(5), careDays, lastCareDay,
      lastFed: lastCareDay, lastPlayed: lastCareDay, lastSlept: lastCareDay, bornAt: (t - age) * 86400,
      name: rnd(3) ? DEMO_NAMES[id % DEMO_NAMES.length] : '', owner: owners[rnd(owners.length)], history: 0,
    });
  }
  return { v: 2, dayOffset: 0, pals, minted: {}, lastNamed: {}, account: '' };
}

function loadPreview() {
  if (params.has('reset')) { try { localStorage.removeItem(PKEY); } catch { /* ignore */ } }
  try { const d = JSON.parse(localStorage.getItem(PKEY)); if (d?.v === 2) return d; } catch { /* ignore */ }
  return seedPreview();
}
let P = MODE === 'preview' ? loadPreview() : null;
const savePreview = () => { try { localStorage.setItem(PKEY, JSON.stringify(P)); } catch { /* ignore */ } };
const pToday = () => realToday() + P.dayOffset;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pHistory = (p, today) => { const gap = today - p.lastCareDay; return gap >= 64 ? 0 : (p.history * 2 ** gap) % 2 ** 14; };

const preview = {
  async today() { return pToday(); },
  async total() { return P.pals.length; },
  async minted(a) { return P.minted[a.toLowerCase()] || 0; },
  async getPal(id) {
    const p = P.pals[id - 1];
    return p ? { ...decorate(p, pToday()), history: pHistory(p, pToday()) } : null;
  },
  async palsOf(a) {
    return P.pals.filter((p) => p.owner.toLowerCase() === a.toLowerCase()).map((p) => ({ ...decorate(p, pToday()), history: pHistory(p, pToday()) }));
  },
  async range(start, count) {
    return P.pals.slice(start - 1, start - 1 + count).map((p) => decorate(p, pToday()));
  },
  async tokenURI(id) {
    const p = await preview.getPal(id);
    if (!p) fail('ERC721NonexistentToken');
    const meta = { name: p.name ? `${p.name} · Pixel Pal #${id}` : `Pixel Pal #${id}`, attributes: Object.entries(p.traits).map(([trait_type, value]) => ({ trait_type, value })).concat({ trait_type: 'Care days', value: p.careDays }) };
    return { meta, svg: p.svg };
  },
  async send(method, args, onSent) {
    if (!wallet.account) await connect();
    const me = wallet.account.toLowerCase();
    const d = pToday();
    const logs = [];
    const pal = (id) => { const p = P.pals[id - 1]; if (!p) fail('ERC721NonexistentToken'); if (p.owner.toLowerCase() !== me) fail('NotOwner'); return p; };
    // validate first (like staticCall), then "mine"
    if (method === 'hatch') {
      if (P.pals.length >= CONFIG.maxSupply) fail('SoldOut');
      if ((P.minted[me] || 0) >= CONFIG.maxPerWallet) fail('WalletFull');
    } else if (method === 'setName') {
      pal(args[0]);
      if (!NAME_RE.test(args[1])) fail('BadName');
      if (P.lastNamed[args[0]] === d) fail('NameCooldown');
    } else {
      const p = pal(args[0]);
      const key = { feed: 'lastFed', play: 'lastPlayed', sleep: 'lastSlept' }[method];
      if (p[key] === d) fail('AlreadyDone');
    }
    onSent?.('0xpreview');
    await wait(1600);

    if (method === 'hatch') {
      const id = P.pals.length + 1;
      const r = crypto.getRandomValues(new Uint8Array(4));
      P.pals.push({ id, species: r[0] % 3, palette: r[1] % 8, pattern: r[2] % 4, accessory: r[3] % 5, careDays: 0, lastCareDay: d, lastFed: 0, lastPlayed: 0, lastSlept: 0, bornAt: Math.floor(Date.now() / 1000), name: '', owner: wallet.account, history: 0 });
      P.minted[me] = (P.minted[me] || 0) + 1;
      logs.push({ name: 'Hatched', args: { id: BigInt(id) } });
    } else if (method === 'setName') {
      P.lastNamed[args[0]] = d;
      P.pals[args[0] - 1].name = args[1];
      logs.push({ name: 'Named', args: {} });
    } else {
      const p = P.pals[args[0] - 1];
      p[{ feed: 'lastFed', play: 'lastPlayed', sleep: 'lastSlept' }[method]] = d;
      if (p.lastFed === d && p.lastPlayed === d && p.lastSlept === d) {
        const before = stageOf(p.careDays);
        const gap = d - p.lastCareDay;
        p.history = gap >= 64 ? 1 : ((p.history * 2 ** gap) % 2 ** 30) + 1;
        p.careDays += 1;
        p.lastCareDay = d;
        logs.push({ name: 'CareDay', args: { careDays: BigInt(p.careDays) } });
        const s = stageOf(p.careDays);
        if (s !== before) logs.push({ name: 'Evolved', args: { stage: BigInt(s) } });
      }
    }
    savePreview();
    return { hash: '0xpreview', logs };
  },
};

// Preview-only helpers (shown as a small toolbar in the app)
export function previewSkipDay(days = 1) {
  if (MODE !== 'preview') return;
  P.dayOffset += days;
  savePreview();
  emit('day');
}
export function previewReset() {
  if (MODE !== 'preview') return;
  P = seedPreview();
  savePreview();
  emit('account');
}

// ================================================================== public API
const impl = MODE === 'live' ? live : preview;

export const api = {
  today: () => impl.today(),
  total: () => impl.total(),
  minted: (a) => impl.minted(a),
  getPal: (id) => impl.getPal(id),
  palsOf: (a) => impl.palsOf(a),
  range: (start, count) => impl.range(start, count),
  tokenURI: (id) => impl.tokenURI(id),
  /** All pals, in pages of 100 (for the Playground). */
  async all() {
    const total = await impl.total();
    const pages = [];
    for (let s = 1; s <= total; s += 100) pages.push(impl.range(s, 100));
    return (await Promise.all(pages)).flat();
  },
  hatch: (onSent) => impl.send('hatch', [], onSent),
  care: (id, action, onSent) => impl.send(ACTIONS[action], [id], onSent),
  setName: (id, name, onSent) => impl.send('setName', [id, name], onSent),
};

export async function connect() {
  if (MODE === 'preview' && !window.ethereum) {
    wallet.account = PREVIEW_WALLET;
    P.account = wallet.account;
    savePreview();
    emit('account');
    return wallet.account;
  }
  if (!window.ethereum) fail('noWallet');
  try {
    const [a] = await ethereum.request({ method: 'eth_requestAccounts' });
    wallet.account = a || '';
    if (MODE === 'live') {
      await refreshChain();
      if (!wallet.chainOk) { try { await switchChain(); } catch { /* banner offers it again */ } await refreshChain(); }
    }
  } catch (e) {
    if (e.code === 4001) fail('rejected');
    throw e;
  }
  emit('account');
  return wallet.account;
}

export async function switchNetwork() {
  try { await switchChain(); } catch (e) { if (e.code === 4001) fail('rejected'); throw e; }
  await refreshChain();
  emit('chain');
}

// restore a previous session silently
export async function initWallet() {
  if (MODE === 'preview' && !window.ethereum) {
    wallet.account = P.account || '';
  } else if (window.ethereum) {
    try {
      const [a] = await ethereum.request({ method: 'eth_accounts' });
      wallet.account = a || '';
      if (MODE === 'live') await refreshChain(); else wallet.chainOk = true;
    } catch { /* ignore */ }
    ethereum.on?.('accountsChanged', (accs) => { wallet.account = accs[0] || ''; emit('account'); });
    ethereum.on?.('chainChanged', async () => { if (MODE === 'live') await refreshChain(); emit('chain'); });
  }
  emit('account');
}

/** Seconds until the next UTC midnight (when Feed / Play / Sleep reset). */
export function secondsToReset() {
  const now = Date.now() / 1000;
  return Math.ceil(86400 - (now % 86400));
}
