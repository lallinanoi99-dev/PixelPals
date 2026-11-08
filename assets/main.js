// Entry point: routing between the story site ("/") and the app ("/app", "/app/playground", "?pal=").
import { CONFIG } from './config.js';
import { renderSVG, svgDataUri } from './sprites.js';
import { MODE, NET, api, wallet, connect, initWallet, onChange, switchNetwork, short } from './chain.js';
import { sfx, music, isOn, setSound, onSoundChange } from './sound.js';

export const BASE = window.PP_BASE || '/';
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ helpers
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const srcCache = new Map();
/** data URI for a pal look; key = "species,stage,palette,pattern,accessory,mood" */
export function palSrc(key) {
  if (!srcCache.has(key)) {
    const [species, stage, palette, pattern, accessory, mood, bare] = key.split(',');
    const n = (v) => Number(v) || 0;
    srcCache.set(key, svgDataUri(renderSVG({ species: n(species), stage: n(stage), palette: n(palette), pattern: n(pattern), accessory: n(accessory), mood: n(mood), bare: bare === 'b' })));
  }
  return srcCache.get(key);
}
export const palKey = (p, over = {}) => {
  const q = { ...p, ...over };
  return [q.species, q.stage, q.palette, q.pattern, q.accessory, q.mood].join(',');
};
export function hydrate(root = document) {
  $$('img[data-pal]', root).forEach((img) => { img.src = palSrc(img.dataset.pal); });
}

let toastTimer;
export function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

export function route() {
  const rel = '/' + location.pathname.slice(BASE.length).replace(/\/+$/, '');
  const pal = new URLSearchParams(location.search).get('pal');
  if (pal !== null) return { name: 'pal', id: pal };
  if (rel.startsWith('/app/playground')) return { name: 'playground' };
  if (rel.startsWith('/app')) return { name: 'app' };
  return { name: 'site' };
}

/** Keeps ?net / ?preview when moving around. */
export function href(path) {
  const keep = new URLSearchParams();
  const cur = new URLSearchParams(location.search);
  for (const k of ['net', 'preview', 'rpc', 'contract']) if (cur.has(k)) keep.set(k, cur.get(k));
  const [p, q] = path.split('?');
  new URLSearchParams(q || '').forEach((v, k) => keep.set(k, v));
  const qs = keep.toString();
  return BASE + p.replace(/^\.?\//, '') + (qs ? '?' + qs : '');
}

// ------------------------------------------------------------------ nav + wallet
function renderWallet() {
  $$('[data-connect]').forEach((b) => {
    if (wallet.account) {
      b.textContent = short(wallet.account);
      b.classList.add('connected');
      b.title = 'Connected';
    } else {
      b.textContent = wallet.hasWallet || MODE === 'preview' ? 'Connect wallet' : 'Install MetaMask';
      b.classList.remove('connected');
    }
  });
  renderBanner();
}

export function renderBanner() {
  const b = $('#banner');
  const inApp = route().name !== 'site';
  if (MODE === 'live' && wallet.account && !wallet.chainOk) {
    b.innerHTML = `<span>You’re on another network.</span><button class="pill pill-ink" type="button">Switch to ${NET.name}</button>`;
    b.querySelector('button').onclick = () => switchNetwork().catch((e) => toast(e.message));
    b.hidden = false;
  } else if (inApp && MODE === 'live' && !wallet.hasWallet) {
    b.innerHTML = '<span>Install MetaMask to hatch and care for a pal — the story and Playground still work.</span><a class="pill pill-ink" href="https://metamask.io/download/" target="_blank" rel="noopener">Install MetaMask</a>';
    b.hidden = false;
  } else {
    b.hidden = true;
  }
  document.body.classList.toggle('has-banner', !b.hidden);
}

$$('[data-connect]').forEach((b) =>
  b.addEventListener('click', async () => {
    if (wallet.account) return;
    if (!wallet.hasWallet && MODE === 'live') return window.open('https://metamask.io/download/', '_blank', 'noopener');
    try { await connect(); } catch (e) { toast(e.message); }
  }),
);

// ------------------------------------------------------------------ sound toggle
function setupSound() {
  const btn = $('[data-sound]');
  const paint = (on) => {
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Sound on — click to mute' : 'Sound off — click for music and sounds';
    btn.classList.toggle('playing', on);
  };
  paint(isOn());
  onSoundChange(paint);
  btn.addEventListener('click', () => {
    setSound(!isOn());
    if (isOn()) { sfx.tada(); toast('Sound on 🎵'); } else toast('Sound off');
  });
  // a one-time hint, since browsers keep pages silent until the first click
  let seen = false;
  try { seen = localStorage.getItem(`${CONFIG.storageKey}.soundHint`) === '1'; } catch { /* ignore */ }
  if (!seen && isOn()) {
    const hint = document.createElement('div');
    hint.className = 'sound-hint';
    hint.textContent = '♪ tap anywhere for music';
    document.body.append(hint);
    setTimeout(() => hint.classList.add('show'), 1800);
    const hide = () => { hint.classList.remove('show'); setTimeout(() => hint.remove(), 400); try { localStorage.setItem(`${CONFIG.storageKey}.soundHint`, '1'); } catch { /* ignore */ } };
    addEventListener('pointerdown', hide, { once: true });
    setTimeout(hide, 9000);
  }
  // every button gets a soft click
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-sound]')) return;
    if (e.target.closest('.pill, .pxbtn, .pal-tab, .nav-links a, .brand, .faq summary, .card, .bento-card, select')) sfx.click();
  });
}

// ------------------------------------------------------------------ footer
const GLYPHS = {
  p: ['.....', '.....', '####.', '#...#', '####.', '#....', '#....'],
  i: ['.#.', '...', '##.', '.#.', '.#.', '.#.', '###'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.####'],
  l: ['##.', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
};
const WM_COLORS = ['#FFC8DD', '#FFF1A8', '#C8F2DC', '#BDE0FE', '#D9C8FF', '#FFD6BA', '#FFB3A7', '#E8D5F5', '#C8F2DC'];

function buildWordmark() {
  const wm = $('.wordmark');
  let li = 0;
  for (const word of ['pixel', 'pals']) {
    const line = document.createElement('div');
    line.className = 'wm-line';
    for (const ch of word) {
      const g = GLYPHS[ch];
      const letter = document.createElement('div');
      letter.className = 'wm-letter';
      letter.style.setProperty('--cols', g[0].length);
      g.forEach((row) => [...row].forEach((c) => {
        const i = document.createElement('i');
        if (c === '#') { i.style.background = WM_COLORS[li]; i.className = 'on'; }
        letter.append(i);
      }));
      line.append(letter);
      li++;
    }
    wm.append(line);
  }
  // Mochi sleeps on the x-height of the first "p" (its top two rows are empty)
  const place = () => {
    const first = $('.wm-letter', wm);
    const r0 = first.children[0].getBoundingClientRect();
    const cell = first.children[first.style.getPropertyValue('--cols') * 1].getBoundingClientRect().top - r0.top;
    $('.wordmark-mochi').style.bottom = `calc(100% - ${cell * 2}px - 4px)`;
  };
  place();
  addEventListener('resize', place);
}

function setupFooter() {
  const main = CONFIG.networks.mainnet;
  $$('[data-link]').forEach((a) => { a.href = CONFIG.links[a.dataset.link]; });
  $$('[data-contract-short]').forEach((s) => { s.textContent = main.contract ? short(main.contract) : 'not deployed yet'; });
  $$('[data-explorer]').forEach((a) => { a.href = main.contract ? `${main.explorer}/address/${main.contract}` : main.explorer; });
  $('[data-copy-contract]').addEventListener('click', async () => {
    if (!main.contract) return toast('The mainnet contract isn’t deployed yet.');
    try { await navigator.clipboard.writeText(main.contract); toast('Contract address copied ✓'); } catch { toast(main.contract, 6000); }
  });
  buildWordmark();
}

// ------------------------------------------------------------------ live numbers
export async function refreshCounts() {
  try {
    const total = await api.total();
    $$('[data-total]').forEach((el) => { el.textContent = total; });
    $$('[data-left]').forEach((el) => { el.textContent = CONFIG.maxSupply - total; });
    return total;
  } catch {
    $$('[data-total],[data-left]').forEach((el) => { el.textContent = '—'; });
    return null;
  }
}

// ------------------------------------------------------------------ boot
hydrate();
setupSound();
setupFooter();
renderWallet();
onChange(renderWallet);
initWallet();
refreshCounts();

// in-page links to the story from the app go back to the site
$$('[data-site-link]').forEach((a) => { a.href = href(a.getAttribute('href')); });
$$('a[data-route]').forEach((a) => { a.href = href(a.getAttribute('href')); });

const r = route();
document.documentElement.dataset.route = r.name;
music(r.name === 'site' ? 'story' : 'room');
if (r.name === 'site') {
  import('./site.js').then((m) => m.initSite());
} else {
  $('#site').remove();
  $('#app').hidden = false;
  document.body.classList.add('in-app');
  import('./app.js').then((m) => m.initApp());
}
