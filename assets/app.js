// The app: /app (hatch + daily care), /app/playground (gallery), ?pal=N (a pal's page).
import { $, $$, palSrc, palKey, href, route, toast, reduced, refreshCounts, renderBanner } from './main.js';
import { CONFIG } from './config.js';
import {
  MODE, NET, api, wallet, connect, onChange, short, explorerToken, explorerAddress, NAME_RE,
  secondsToReset, previewSkipDay, previewReset,
} from './chain.js';
import { SPECIES, STAGES, PALETTES, PATTERNS, ACCESSORIES, MOODS, STAGE_AT, svgDataUri } from './sprites.js';
import { fillReel } from './site.js';
import { sfx, voice, music, loop, duck } from './sound.js';

const { gsap } = window;
const app = $('#app');
const MOOD_FACE = ['😊', '😐', '😢'];
const SPECIES_ICON = ['🐱', '🦖', '🫧'];
const ACTION_INFO = [
  { key: 'feed', icon: '🍓', label: 'Feed', doing: 'Munch munch…' },
  { key: 'play', icon: '🎾', label: 'Play', doing: 'Fetch!' },
  { key: 'sleep', icon: '🌙', label: 'Sleep', doing: 'Zzz…' },
];
const SEL_KEY = `${CONFIG.storageKey}.selected`;
const URI_KEY = `${CONFIG.storageKey}.uri.${NET.chainId}`;

const state = { pals: [], selected: 0, minted: 0, total: 0, busy: false, loadedFor: null };
let cleanups = [];
const cleanup = () => { cleanups.forEach((fn) => fn()); cleanups = []; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const loadingHTML = (msg = 'loading') => `<div class="loading"><div class="loading-dots"><i></i><i></i><i></i></div>${msg}</div>`;
const bareSrc = (p, over) => palSrc(palKey(p, over) + ',b');

export function initApp() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-route]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
    e.preventDefault();
    go(a.getAttribute('href'));
  });
  addEventListener('popstate', render);
  onChange((what) => {
    state.loadedFor = null; // account, network or (preview) day changed
    render();
  });
  render();
}

export function go(path) {
  const url = path.startsWith('/') || path.startsWith('http') ? path : href(path);
  if (url !== location.pathname + location.search) history.pushState(null, '', url);
  render();
  scrollTo({ top: 0 });
}

function setNav(name) {
  $$('.nav-links a').forEach((a) => a.removeAttribute('aria-current'));
  if (name === 'playground' || name === 'pal') $$('.nav-links a[href*="playground"]').forEach((a) => a.setAttribute('aria-current', 'page'));
}

function render() {
  cleanup();
  const r = route();
  setNav(r.name);
  renderBanner();
  document.title = { playground: 'Playground · Pixel Pals', pal: 'A pal · Pixel Pals' }[r.name] || 'My pals · Pixel Pals';
  music(r.name === 'app' ? 'room' : 'story');
  if (r.name === 'playground') return renderPlayground();
  if (r.name === 'pal') return renderPalPage(r.id);
  return renderHome();
}

// ================================================================== HOME
async function loadMine(force = false) {
  if (!wallet.account) return;
  if (!force && state.loadedFor === wallet.account) return;
  const [pals, minted, total] = await Promise.all([api.palsOf(wallet.account), api.minted(wallet.account), api.total()]);
  state.pals = pals.filter(Boolean).sort((a, b) => a.id - b.id);
  state.minted = minted;
  state.total = total;
  state.loadedFor = wallet.account;
  let saved = 0;
  try { saved = Number(localStorage.getItem(SEL_KEY)); } catch { /* ignore */ }
  if (!state.pals.some((p) => p.id === state.selected)) state.selected = state.pals.some((p) => p.id === saved) ? saved : state.pals[0]?.id || 0;
}

async function renderHome() {
  if (!wallet.account) return renderConnect();
  app.innerHTML = `<div class="app">${loadingHTML('finding your pals')}</div>`;
  try {
    await loadMine();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="app"><div class="empty"><img class="px" src="${palSrc('1,2,4,0,0,1,b')}" alt=""><h2>The chain is a bit slow.</h2><p>We couldn’t reach BOT Chain just now.</p><button class="pill pill-ink" type="button" data-retry>Try again</button></div></div>`;
    $('[data-retry]').onclick = () => { state.loadedFor = null; render(); };
    return;
  }
  if (!state.pals.length || new URLSearchParams(location.search).has('hatch')) return renderHatch();
  renderRoom();
}

function renderConnect() {
  const noWallet = MODE === 'live' && !wallet.hasWallet;
  app.innerHTML = `<div class="app"><div class="empty">
    <div class="hatch-stage" style="margin:0 auto"><div class="big-egg wobble"><img class="px" src="${palSrc('2,0,0,0,0,0,b')}" alt="An egg"></div><div class="cushion"></div></div>
    <h2>Your egg is waiting.</h2>
    <p>${noWallet ? 'Install MetaMask to hatch and care for a pal. The story and the Playground work without it.' : `Connect your wallet to hatch a pal or visit the ones you have. Free to hatch — only gas on ${NET.name}.`}</p>
    ${noWallet ? '<a class="pill pill-ink" href="https://metamask.io/download/" target="_blank" rel="noopener">Install MetaMask</a>' : '<button class="pill pill-ink" type="button" data-go-connect>Connect wallet</button>'}
    <p style="margin-top:16px"><a href="app/playground" data-route>Visit the Playground →</a></p>
    ${previewBar()}
  </div></div>`;
  $('[data-go-connect]')?.addEventListener('click', () => connect().catch((e) => toast(e.message)));
  bindPreviewBar();
}

function previewBar() {
  if (MODE !== 'preview') return '';
  return `<div class="preview-bar" style="max-width:420px;margin:24px auto 0;text-align:left"><b>Preview mode</b> — no contract address is set yet, so pals live in this browser and follow the same rules as the contract.
    <div><button class="pill pill-line" type="button" data-skip-day>⏭ Skip to tomorrow</button><button class="pill pill-line" type="button" data-reset>Reset preview</button></div></div>`;
}
function bindPreviewBar() {
  $('[data-skip-day]')?.addEventListener('click', () => { previewSkipDay(); sfx.newDay(); toast('A new day dawns in preview mode ☀️'); });
  $('[data-reset]')?.addEventListener('click', () => { previewReset(); toast('Preview reset'); });
}

// ------------------------------------------------------------------ hatch flow
function renderHatch() {
  const soldOut = state.total >= CONFIG.maxSupply;
  const full = state.minted >= CONFIG.maxPerWallet;
  const left = CONFIG.maxSupply - state.total;
  app.innerHTML = `<div class="app"><div class="hatch">
    <p class="label">${state.pals.length ? 'a new egg' : 'step 1 · hatch'}</p>
    <h1 class="serif">${soldOut ? 'All eggs have hatched.' : full ? 'That’s a full room!' : 'Hatch your pal.'}</h1>
    <p class="hatch-sub">${soldOut ? 'All 677 pals are out in the world. Visit the Playground to meet them.' : full ? 'You have 3 pals — that’s a full room! Look after the ones you have.' : `Free to hatch — you only pay gas. ${left} of 677 eggs left.`}</p>
    <div class="hatch-stage"><div class="big-egg wobble"><img class="px" src="${palSrc('2,0,0,0,0,0,b')}" alt="Your egg"></div><div class="cushion"></div></div>
    <div class="hatch-actions">
      ${soldOut || full
        ? `<a class="pill pill-ink" href="app/playground" data-route>Visit the Playground</a>${state.pals.length ? '<a class="pill pill-line" href="app" data-route>Back to my pals</a>' : ''}`
        : '<button class="pill pill-ink" type="button" data-hatch style="min-width:220px">Hatch my pal</button>'}
      <p class="hatch-note" aria-live="polite"></p>
      ${state.pals.length && !soldOut && !full ? '<a href="app" data-route class="hatch-note">← back to my pals</a>' : ''}
    </div>
    ${previewBar()}
  </div></div>`;
  bindPreviewBar();
  const btn = $('[data-hatch]');
  if (!btn) return;
  const egg = $('.hatch-stage .big-egg img');
  const note = $('.hatch-note');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    note.textContent = 'Confirm in MetaMask…';
    const stopWiggle = loop(sfx.wiggle, 0.18);
    const shake = reduced ? null : gsap.to(egg, { rotate: 8, duration: 0.09, yoyo: true, repeat: -1, ease: 'sine.inOut', transformOrigin: '50% 90%' });
    egg.style.animation = 'none';
    try {
      const res = await api.hatch(() => { note.textContent = 'Hatching… the egg is wiggling!'; });
      const ev = res.logs.find((l) => l.name === 'Hatched');
      const id = Number(ev.args.id);
      shake?.kill();
      stopWiggle();
      state.loadedFor = null;
      await loadMine(true);
      state.selected = id;
      try { localStorage.setItem(SEL_KEY, id); } catch { /* ignore */ }
      refreshCounts();
      revealPal(id);
    } catch (e) {
      shake?.kill();
      stopWiggle();
      sfx.shrug();
      gsap.to(egg, { rotate: 0, duration: 0.2 });
      egg.style.animation = '';
      btn.disabled = false;
      note.textContent = e.message || 'Hatching failed — try again.';
      if (e.code === 'WalletFull' || e.code === 'SoldOut') { state.loadedFor = null; setTimeout(render, 1500); }
    }
  });
}

async function revealPal(id) {
  const pal = state.pals.find((p) => p.id === id) || (await api.getPal(id));
  const stage = $('.hatch-stage');
  const egg = $('.big-egg', stage);
  const actions = $('.hatch-actions');
  $('.hatch h1').textContent = 'Crack!';
  $('.hatch-sub').textContent = 'Every pal is a surprise…';
  actions.innerHTML = '';

  // crack: shell pieces fly off
  const shells = [...Array(8)].map((_, i) => {
    const s = document.createElement('i');
    s.className = 'shell';
    s.style.background = '#' + PALETTES[0][2];
    stage.append(s);
    return s;
  });
  const tl = gsap.timeline();
  [0, 0.15, 0.3, 0.45].forEach((t) => tl.call(sfx.wiggle, null, t));
  tl.call(sfx.crack, null, 0.6);
  if (!reduced) {
    tl.to(egg, { scale: 1.08, duration: 0.15, yoyo: true, repeat: 3 })
      .to(egg, { opacity: 0, scale: 1.3, duration: 0.2 })
      .fromTo(shells, { x: 0, y: -40, opacity: 1 }, { x: (i) => Math.cos(i / 8 * 6.28) * 160, y: (i) => Math.sin(i / 8 * 6.28) * 120 - 40, rotate: () => gsap.utils.random(-200, 200), opacity: 0, duration: 0.9, ease: 'power2.out' }, '<');
  } else {
    tl.set(egg, { opacity: 0 });
  }
  await tl;
  shells.forEach((s) => s.remove());

  // trait roll, one reel at a time
  const finals = [SPECIES[pal.species], PALETTES[pal.palette][0], PATTERNS[pal.pattern], ACCESSORIES[pal.accessory]];
  const pools = [SPECIES, PALETTES.map((p) => p[0]), PATTERNS, ACCESSORIES];
  stage.insertAdjacentHTML('beforebegin', `<div class="slots">${['species', 'palette', 'pattern', 'accessory'].map((l) => `<div class="slot"><span class="slot-label">${l}</span><div class="slot-window"><div class="slot-reel"></div></div></div>`).join('')}</div>`);
  const reels = $$('.hatch .slot-reel');
  for (let i = 0; i < 4; i++) {
    const opts = [...pools[i], ...pools[i]].sort(() => Math.random() - 0.5).slice(0, 9);
    const n = fillReel(reels[i], finals[i], opts);
    const stopTicks = loop(sfx.tick, 0.07);
    if (reduced) gsap.set(reels[i], { y: -(n - 1) * 44 });
    else await gsap.fromTo(reels[i], { y: 0 }, { y: -(n - 1) * 44, duration: 0.9 + i * 0.15, ease: 'power3.out' });
    stopTicks();
    sfx.ding(i);
  }

  stage.innerHTML = `<div class="hatch-new"><img class="px" src="${bareSrc(pal)}" alt="Your new pal, still an egg"></div>
    <div class="baby-peek"><img class="px" src="${bareSrc(pal, { stage: 1, mood: 0 })}" alt="What it looks like as a baby"><span>after 1 care day</span></div>`;
  sfx.tada();
  voice({ species: pal.species, stage: 1, syllables: 3, at: 0.5 });
  $('.hatch-new').addEventListener('click', () => { sfx.wiggle(); voice({ species: pal.species, stage: 1, syllables: 2 }); });
  if (!reduced) {
    gsap.from('.hatch-new', { scale: 0, rotate: -30, duration: 0.7, ease: 'back.out(2.4)' });
    gsap.from('.baby-peek', { scale: 0, opacity: 0, duration: 0.5, delay: 0.5, ease: 'back.out(3)' });
  }
  $('.hatch h1').textContent = 'Say hi to your pal!';
  $('.hatch-sub').textContent = `A ${PALETTES[pal.palette][0]} ${SPECIES[pal.species]}${pal.accessory ? ' with a ' + ACCESSORIES[pal.accessory].toLowerCase() : ''}. It’s still an egg — feed, play and sleep today to hatch it into a baby. Give it a name?`;
  actions.innerHTML = `<form class="name-form" novalidate>
      <label class="skip" for="pal-name">Name</label>
      <input id="pal-name" maxlength="16" placeholder="e.g. Mochi" autocomplete="off">
      <button class="pill pill-ink" type="submit">Name it</button>
      <button class="pill pill-line" type="button" data-skip>Skip for now</button>
    </form><p class="field-error" aria-live="polite"></p>`;
  $('[data-skip]').onclick = () => go('app');
  bindNameForm($('.name-form', actions), pal.id, () => go('app'));
}

function bindNameForm(form, id, done) {
  const input = $('input', form);
  const err = form.nextElementSibling;
  input.focus({ preventScroll: true });
  input.addEventListener('input', () => { err.textContent = input.value && !NAME_RE.test(input.value) ? 'Use 1–16 letters, numbers or spaces (no space first).' : ''; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!NAME_RE.test(name)) { err.textContent = 'Use 1–16 letters, numbers or spaces.'; input.focus(); return; }
    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    err.textContent = 'Confirm in MetaMask…';
    try {
      await api.setName(id, name, () => { err.textContent = 'Saving the name on-chain…'; });
      state.loadedFor = null;
      toast(`Hi, ${name}! 👋`);
      const named = state.pals.find((x) => x.id === id);
      sfx.done();
      voice({ species: named?.species ?? 2, stage: named?.stage || 1, syllables: 4, at: 0.2 });
      done();
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
    }
  });
}

// ------------------------------------------------------------------ the room
let uriCache = {};
try { uriCache = JSON.parse(localStorage.getItem(URI_KEY)) || {}; } catch { /* ignore */ }

/** The live on-chain image (tokenURI), cached in the browser and refreshed in the background. */
async function liveImage(p, img) {
  const k = `${p.id}:${p.careDays}:${p.mood}`;
  if (uriCache[p.id]?.k === k) img.src = svgDataUri(uriCache[p.id].svg);
  else img.src = palSrc(palKey(p));
  try {
    const { svg } = await api.tokenURI(p.id);
    uriCache[p.id] = { k, svg };
    try { localStorage.setItem(URI_KEY, JSON.stringify(uriCache)); } catch { /* ignore */ }
    if (img.isConnected) img.src = svgDataUri(svg);
  } catch { /* keep the cached / local copy */ }
}

function streakOf(history, doneAllToday) {
  let n = 0;
  for (let i = doneAllToday ? 0 : 1; i < 14; i++) { if (history & (1 << i)) n++; else break; }
  return n;
}

function progress(p) {
  if (p.stage >= 3) return { text: `${p.careDays} care days · Adult`, pct: 100, next: null };
  const next = STAGE_AT[p.stage + 1];
  const prev = STAGE_AT[p.stage];
  return { text: `${p.careDays} / ${next} to ${STAGES[p.stage + 1]}`, pct: Math.round(((p.careDays - prev) / (next - prev)) * 100), next };
}

function fmtReset() {
  const s = secondsToReset();
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

let walker = null;
let lastGreeted = 0;

function renderRoom() {
  cleanup(); // stop the previous room's walk, timers and countdown
  const p = state.pals.find((x) => x.id === state.selected) || state.pals[0];
  state.selected = p.id;
  try { localStorage.setItem(SEL_KEY, p.id); } catch { /* ignore */ }
  const prog = progress(p);
  const allDone = p.doneToday.feed && p.doneToday.play && p.doneToday.sleep;
  const streak = streakOf(p.history || 0, allDone);
  const canHatch = state.minted < CONFIG.maxPerWallet && state.total < CONFIG.maxSupply;
  const age = p.age;

  app.innerHTML = `<div class="app"><div class="app-grid">
    <aside class="side-left">
      <div class="panel">
        <h3>my pals · ${state.pals.length}/3</h3>
        <div class="pal-switch" role="tablist" aria-label="Your pals">
          ${state.pals.map((x) => `<button type="button" class="pal-tab" role="tab" aria-current="${x.id === p.id}" data-pal-id="${x.id}">
            <img class="px" alt="" data-live="${x.id}"><span><b>${esc(x.label)}</b><small>${STAGES[x.stage]} · ${MOOD_FACE[x.mood]}</small></span></button>`).join('')}
          ${canHatch ? '<a class="pal-tab add" href="app?hatch" data-route>+ hatch another</a>' : ''}
        </div>
      </div>
      ${MODE === 'preview' ? `<div class="preview-bar"><b>Preview mode</b> — no contract yet, so pals live in this browser with the contract’s rules. Skip a day to test growing up and moods.<div><button class="pill pill-line" type="button" data-skip-day>⏭ Tomorrow</button><button class="pill pill-line" type="button" data-skip-3>⏭⏭ +3 days</button><button class="pill pill-line" type="button" data-reset>Reset</button></div></div>` : ''}
    </aside>

    <section class="device-col" aria-label="${esc(p.label)}’s room">
      <div class="device">
        <div class="device-screen">
          <div class="device-top">
            <button type="button" class="pal-name" title="Rename" data-rename>${esc(p.label)}</button>
            <span class="stage-badge">${STAGES[p.stage]}</span>
            <span class="mood-face" title="${MOODS[p.mood]}" aria-label="Mood: ${MOODS[p.mood]}">${MOOD_FACE[p.mood]}</span>
            ${streak > 1 ? `<span class="streak" title="Care days in a row">🔥 ${streak}</span>` : ''}
            <span class="progress-text">${prog.text}</span>
          </div>
          <div class="room" id="room">
            <div class="room-wall"></div><div class="room-window"></div><div class="room-floor"></div>
            <div class="room-bed"></div><div class="room-bowl"><i></i></div><div class="room-ball"></div>
            <div class="room-pal"><img class="px" alt="${esc(p.label)}" src="${bareSrc(p)}"></div>
            <div class="zzz">z<span>z</span><span>Z</span></div>
            <div class="room-night"></div>
            <div class="room-msg"></div>
          </div>
        </div>
        <div class="device-buttons">
          ${ACTION_INFO.map((a, i) => {
            const done = p.doneToday[a.key];
            return `<button type="button" class="pxbtn b-${a.key} ${done ? 'done' : 'avail'}" data-action="${i}" ${done ? 'aria-disabled="true"' : ''} aria-label="${a.label}${done ? ' — done today' : ''}">
              <span class="ico" aria-hidden="true">${done ? '✓' : a.icon}</span>${a.label}<small>${done ? 'Done today' : 'Ready'}</small></button>`;
          }).join('')}
        </div>
        <p class="reset-line">${allDone ? `✓ All done today — come back in ${fmtReset()}` : `Feed, play and sleep today for +1 care day · resets in ${fmtReset()}`}</p>
        <div class="device-speaker" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      </div>
    </section>

    <aside class="side-right">
      <div class="panel stats">
        <h3>on-chain image</h3>
        <img class="px" data-live="${p.id}" alt="${esc(p.label)} as drawn by the contract" style="width:100%;aspect-ratio:1;height:auto;border-radius:16px;border:1.5px solid var(--ink)">
        <p style="font:11px var(--mono);color:var(--muted);margin:8px 0 18px">tokenURI · drawn live by the contract</p>
        <div class="row"><div class="bar-label"><span>${STAGES[p.stage]}</span><span>${prog.next ? STAGES[p.stage + 1] : '★'}</span></div><div class="bar" role="progressbar" aria-valuenow="${prog.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${prog.pct}%"></i></div></div>
        <div class="row"><h3>last 14 days</h3>${dotsHTML(p.history || 0)}</div>
        <div class="row"><h3>traits</h3><div class="traits">${traitChips(p)}</div></div>
        <dl class="meta-list">
          <dt>Care days</dt><dd>${p.careDays}</dd>
          <dt>Streak</dt><dd>${streak} ${streak === 1 ? 'day' : 'days'}</dd>
          <dt>Age</dt><dd>${age} ${age === 1 ? 'day' : 'days'}</dd>
          <dt>Pal</dt><dd>#${p.id}</dd>
        </dl>
        <div class="panel-links">
          <button class="pill pill-ink" type="button" data-share>Share my pal</button>
          <a class="pill pill-line" href="app/playground?pal=${p.id}" data-route>Pal page</a>
          ${MODE === 'live' ? `<a class="pill pill-line" href="${explorerToken(p.id)}" target="_blank" rel="noopener">View on explorer ↗</a>` : ''}
        </div>
      </div>
    </aside>
  </div></div>`;

  $$('[data-live]').forEach((img) => liveImage(state.pals.find((x) => x.id === Number(img.dataset.live)), img));
  $$('[data-pal-id]').forEach((b) => b.addEventListener('click', () => { if (Number(b.dataset.palId) !== state.selected) sfx.whoosh(); state.selected = Number(b.dataset.palId); renderRoom(); }));
  $$('[data-action]').forEach((b) => b.addEventListener('click', () => doCare(p, Number(b.dataset.action), b)));
  $('[data-rename]').addEventListener('click', () => rename(p));
  $('[data-share]').addEventListener('click', () => shareCard(p));
  $('[data-skip-3]')?.addEventListener('click', () => { previewSkipDay(3); sfx.sniffle(); toast('Three days pass… 🌧️'); });
  bindPreviewBar();

  // the pal wanders around its room
  walker = startWalk($('#room'));
  cleanups.push(() => walker.kill());

  // sound: rainy music for a sad pal, a hello when you switch to it, chatter now and then
  music(p.mood === 2 ? 'rain' : 'room');
  const say = (o = {}) => voice({ species: p.species, stage: p.stage, mood: p.mood, ...o });
  if (lastGreeted !== p.id) { lastGreeted = p.id; say({ syllables: 3, at: 0.3 }); }
  let chatter;
  const chat = () => {
    chatter = setTimeout(() => {
      if (!state.busy) { if (p.mood === 2 && Math.random() < 0.5) sfx.sniffle(); else say({ syllables: 1 + Math.floor(Math.random() * 3), vol: 0.12 }); }
      chat();
    }, 9000 + Math.random() * 9000);
  };
  chat();
  cleanups.push(() => clearTimeout(chatter));
  const palEl = $('#room .room-pal');
  palEl.addEventListener('click', () => {
    if (state.busy) return;
    sfx.pet();
    say({ syllables: 2, mood: Math.min(p.mood, 1), at: 0.1 });
    const heart = document.createElement('span');
    heart.textContent = p.mood === 2 ? '💧' : '💗';
    heart.style.cssText = 'position:absolute;z-index:6;font-size:22px;pointer-events:none';
    const r = palEl.getBoundingClientRect(), rr = $('#room').getBoundingClientRect();
    heart.style.left = `${r.left - rr.left + r.width / 2 - 10}px`;
    heart.style.top = `${r.top - rr.top}px`;
    $('#room').append(heart);
    gsap.to(heart, { y: -50, opacity: 0, duration: 1.1, ease: 'power1.out', onComplete: () => heart.remove() });
    gsap.fromTo(palEl, { scaleY: 0.85 }, { scaleY: 1, duration: 0.5, ease: 'elastic.out(1.4, 0.3)', transformOrigin: '50% 100%' });
  });

  // countdown to the UTC reset
  const t = setInterval(() => {
    const line = $('.reset-line');
    if (line) line.textContent = allDone ? `✓ All done today — come back in ${fmtReset()}` : `Feed, play and sleep today for +1 care day · resets in ${fmtReset()}`;
    if (secondsToReset() > 86390) { state.loadedFor = null; render(); }
  }, 10_000);
  cleanups.push(() => clearInterval(t));

  // swipe between pals on phones
  const dev = $('.device');
  let x0 = null;
  dev.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  dev.addEventListener('touchend', (e) => {
    if (x0 === null || state.pals.length < 2) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) < 60) return;
    const i = state.pals.findIndex((x) => x.id === state.selected);
    state.selected = state.pals[(i + (dx < 0 ? 1 : -1) + state.pals.length) % state.pals.length].id;
    sfx.whoosh();
    renderRoom();
  });
}

function traitChips(p) {
  return [
    `${SPECIES_ICON[p.species]} <b>${SPECIES[p.species]}</b>`,
    `🎨 ${PALETTES[p.palette][0]}`,
    `✦ ${PATTERNS[p.pattern]}`,
    `🎀 ${ACCESSORIES[p.accessory]}${p.stage === 0 && p.accessory ? ' (from Baby)' : ''}`,
    `${MOOD_FACE[p.mood]} ${MOODS[p.mood]}`,
  ].map((t) => `<span>${t}</span>`).join('');
}

function dotsHTML(history) {
  let html = '<div class="dots" aria-label="Care days in the last 14 days">';
  for (let i = 13; i >= 0; i--) {
    const on = history & (1 << i);
    html += `<i class="${on ? 'on' : ''} ${i === 0 ? 'today' : ''}" title="${i === 0 ? 'today' : i === 1 ? 'yesterday' : i + ' days ago'}${on ? ' · cared for' : ''}"></i>`;
  }
  return html + '</div>';
}

// ---- room animation
function startWalk(room) {
  const pal = $('.room-pal', room);
  if (reduced) return { kill() {}, pause() {}, resume() {} };
  const W = () => room.clientWidth;
  let tl;
  const step = () => {
    const to = gsap.utils.random(-0.32, 0.22) * W();
    const from = gsap.getProperty(pal, 'x');
    tl = gsap.timeline({ onComplete: step })
      .set(pal, { scaleX: to < from ? -1 : 1 })
      .to(pal, { x: to, duration: Math.abs(to - from) / (W() * 0.14) + 0.3, ease: 'none' })
      .to(pal, { y: -6, duration: 0.18, repeat: Math.max(1, Math.round(Math.abs(to - from) / 30)) * 2 - 1, yoyo: true, ease: 'sine.inOut' }, 0)
      .to(pal, { y: 0, duration: 0.1 })
      .to({}, { duration: gsap.utils.random(0.8, 2.2) });
  };
  step();
  return { kill: () => tl?.kill(), pause: () => tl?.pause(), resume: () => tl?.resume() };
}

function actionAnim(room, action) {
  const pal = $('.room-pal', room);
  const W = room.clientWidth;
  const tl = gsap.timeline({ repeat: -1 });
  gsap.set(pal, { scaleX: 1 });
  if (action === 0) {
    $('.room-bowl', room).classList.add('full');
    gsap.to(pal, { x: -W * 0.24, y: 0, duration: 0.5 });
    tl.to(pal, { y: -10, scaleY: 0.92, duration: 0.16, yoyo: true, repeat: 1 }).to({}, { duration: 0.1 });
  } else if (action === 1) {
    const ball = $('.room-ball', room);
    tl.to(ball, { x: W * 0.35, y: -50, duration: 0.4, ease: 'power2.out' })
      .to(ball, { y: 0, duration: 0.3, ease: 'bounce.out' })
      .to(pal, { x: W * 0.12, duration: 0.6, ease: 'power1.inOut' }, 0.1)
      .to(pal, { y: -24, duration: 0.2, yoyo: true, repeat: 1 }, '>-0.1')
      .to(ball, { x: -W * 0.05, y: -40, duration: 0.4, ease: 'power2.out' })
      .to(ball, { y: 0, duration: 0.3, ease: 'bounce.out' })
      .to(pal, { x: -W * 0.08, duration: 0.6, ease: 'power1.inOut' }, '<-0.3');
  } else {
    gsap.to(pal, { x: W * 0.2, y: -W * 0.07, duration: 0.7 });
    gsap.to($('.room-night', room), { opacity: 0.4, duration: 0.6 });
    tl.to($('.zzz', room), { opacity: 1, y: -14, duration: 1 }).to($('.zzz', room), { opacity: 0, y: -24, duration: 0.4 });
    gsap.to(pal, { scaleY: 0.9, duration: 1.2, yoyo: true, repeat: -1, ease: 'sine.inOut', transformOrigin: '50% 100%' });
  }
  return () => {
    tl.kill();
    gsap.killTweensOf(pal);
    gsap.to(pal, { scaleY: 1, y: 0, duration: 0.3 });
    gsap.to($('.room-night', room), { opacity: 0, duration: 0.4 });
    gsap.to($('.zzz', room), { opacity: 0, duration: 0.2 });
    gsap.to($('.room-ball', room), { x: 0, y: 0, duration: 0.4 });
    $('.room-bowl', room).classList.remove('full');
  };
}

function roomMsg(room, text, ms = 2200) {
  const m = $('.room-msg', room);
  m.textContent = text;
  gsap.fromTo(m, { opacity: 0, y: 10, scale: 0.8 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'back.out(3)' });
  if (ms) gsap.to(m, { opacity: 0, delay: ms / 1000, duration: 0.3 });
}

async function doCare(p, action, btn) {
  const info = ACTION_INFO[action];
  const room = $('#room');
  if (p.doneToday[info.key]) {
    roomMsg(room, `✓ Done today — come back in ${fmtReset()}`);
    sfx.bonk();
    return;
  }
  if (state.busy) return;
  state.busy = true;
  walker?.kill();
  $$('[data-action]').forEach((b) => { b.disabled = true; });
  btn.classList.add('pressed');
  gsap.killTweensOf($('.room-pal', room));
  const stopAnim = actionAnim(room, action);
  // eating crunches, the ball boings, bedtime gets a lullaby and snores
  let n = 0;
  const say = (o) => voice({ species: p.species, stage: p.stage, mood: 0, ...o });
  const stopSound = action === 0
    ? loop(() => { sfx.munch(); if (n++ % 3 === 1) say({ syllables: 1, vol: 0.12 }); }, 0.6)
    : action === 1
      ? loop(() => { sfx.boing(); setTimeout(() => sfx.bounce(0), 420); setTimeout(() => sfx.bounce(1), 620); if (n++ % 2 === 0) say({ syllables: 2, at: 0.3 }); }, 1.6)
      : (() => { sfx.lullaby(); const s = loop(() => { sfx.snore(); sfx.zzz(); }, 1.8); return s; })();
  const stop = () => { stopAnim(); stopSound(); };
  roomMsg(room, 'Confirm in MetaMask…', 0);
  try {
    const res = await api.care(p.id, action, () => roomMsg(room, info.doing, 0));
    const careDay = res.logs.find((l) => l.name === 'CareDay');
    const evolved = res.logs.find((l) => l.name === 'Evolved');
    stop();
    const before = p.stage;
    state.loadedFor = null;
    await loadMine(true);
    state.busy = false;
    const fresh = state.pals.find((x) => x.id === p.id) || p;
    renderRoom();
    const newRoom = $('#room');
    if (careDay) {
      sfx.careDay();
      voice({ species: fresh.species, stage: fresh.stage, mood: 0, syllables: 4, at: 0.5 });
      roomMsg(newRoom, '+1 care day 🎉', 2600);
      if (!reduced) confetti(newRoom);
    } else {
      sfx.done();
      roomMsg(newRoom, `${info.icon} ${info.label} ✓`, 1600);
    }
    if (evolved) setTimeout(() => evolveScene(fresh, before), 900);
  } catch (e) {
    stop();
    state.busy = false;
    $$('[data-action]').forEach((b) => { b.disabled = false; });
    btn.classList.remove('pressed');
    // the pal shrugs
    sfx.shrug();
    voice({ species: p.species, stage: p.stage, mood: 1, syllables: 2, at: 0.25 });
    const pal = $('.room-pal', room);
    gsap.timeline().to(pal, { rotate: -10, duration: 0.12 }).to(pal, { rotate: 10, duration: 0.12, repeat: 2, yoyo: true }).to(pal, { rotate: 0, duration: 0.12 });
    roomMsg(room, e.code === 'rejected' ? '🤷 Maybe later?' : '🤷 Try again', 2400);
    setTimeout(() => { if (room.isConnected) { walker = startWalk(room); cleanups.push(() => walker.kill()); } }, 900);
    toast(e.message);
    if (e.code === 'AlreadyDone') { state.loadedFor = null; setTimeout(render, 1200); }
  }
}

function confetti(room) {
  const colors = ['#FFC8DD', '#FFF1A8', '#C8F2DC', '#BDE0FE', '#D9C8FF', '#FFB3A7'];
  for (let i = 0; i < 24; i++) {
    const c = document.createElement('i');
    c.style.cssText = `position:absolute;left:50%;top:40%;width:8px;height:8px;background:${colors[i % 6]};border:2px solid #3A3150;z-index:7`;
    room.append(c);
    gsap.to(c, { x: gsap.utils.random(-200, 200), y: gsap.utils.random(-120, 160), rotate: gsap.utils.random(-180, 180), opacity: 0, duration: 1.4, ease: 'power2.out', onComplete: () => c.remove() });
  }
}

function evolveScene(p, fromStage) {
  const flash = document.createElement('div');
  flash.className = 'flash';
  flash.style.background = '#FFF1A8';
  document.body.append(flash);
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="overlay-card" role="dialog" aria-modal="true" aria-labelledby="evo-title">
    <p class="label">evolution</p>
    <div class="evo-pal"><img class="px old" src="${bareSrc(p, { stage: fromStage })}" alt=""><img class="px new" src="${bareSrc(p)}" alt="${esc(p.label)} as a ${STAGES[p.stage]}"></div>
    <h2 id="evo-title">${esc(p.label)} is a ${STAGES[p.stage]}!</h2>
    <p>${p.careDays} care days on BOT Chain. The on-chain image just redrew itself.</p>
    <div class="buttons"><button class="pill pill-ink" type="button" data-share>Share my pal</button><button class="pill pill-line" type="button" data-close>Yay!</button></div>
  </div>`;
  document.body.append(ov);
  const close = () => { ov.remove(); flash.remove(); };
  $('[data-close]', ov).onclick = close;
  $('[data-share]', ov).onclick = () => { close(); shareCard(p); };
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); removeEventListener('keydown', esc); } });
  $('[data-close]', ov).focus();
  duck(3.5);
  sfx.evolve();
  voice({ species: p.species, stage: p.stage, syllables: 5, at: 1.7 });
  if (reduced) { $('.old', ov).remove(); return; }
  const card = $('.overlay-card', ov);
  for (let i = 0; i < 16; i++) card.insertAdjacentHTML('beforeend', `<i style="position:absolute;left:50%;top:36%;width:10px;height:10px;background:#fff;box-shadow:0 0 0 2px #F5CE4E"></i>`);
  gsap.timeline()
    .to(flash, { opacity: 0.9, duration: 0.15 }).to(flash, { opacity: 0, duration: 0.6 })
    .from(card, { scale: 0.7, opacity: 0, duration: 0.5, ease: 'back.out(2)' }, 0.1)
    .set($('.new', ov), { opacity: 0 })
    .to($('.evo-pal', ov), { rotateY: 720, duration: 1.2, ease: 'power2.inOut' })
    .to($('.old', ov), { opacity: 0, duration: 0.1 }, '-=0.6')
    .to($('.new', ov), { opacity: 1, duration: 0.1 }, '<')
    .fromTo($$('.overlay-card > i', ov), { x: 0, y: 0, opacity: 1, scale: 0.4 }, { x: (i) => Math.cos(i / 16 * 6.28) * 170, y: (i) => Math.sin(i / 16 * 6.28) * 130, opacity: 0, scale: 1.3, duration: 1, ease: 'power2.out' }, '-=0.4');
}

function rename(p) {
  const head = $('.device-top');
  head.innerHTML = `<form class="name-form" novalidate style="margin:0;justify-content:flex-start">
    <label class="skip" for="rename">New name</label><input id="rename" maxlength="16" value="${esc(p.name)}" placeholder="Name your pal">
    <button class="pill pill-ink" type="submit">Save</button><button class="pill pill-line" type="button" data-cancel>Cancel</button></form><p class="field-error" aria-live="polite" style="width:100%;margin:0"></p>`;
  $('[data-cancel]', head).onclick = () => renderRoom();
  bindNameForm($('form', head), p.id, () => { state.loadedFor = null; renderHome(); });
}

// ------------------------------------------------------------------ share card (PNG for X)
async function shareCard(p) {
  sfx.shutter();
  const W = 1200, H = 630;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const [, bg, body] = PALETTES[p.palette];
  ctx.fillStyle = '#FBF7F0'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#' + bg;
  roundRect(ctx, 50, 50, 530, 530, 40); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#2B2440'; ctx.stroke();
  const img = new Image();
  img.src = palSrc(palKey(p) + ',b');
  await img.decode().catch(() => {});
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 55, 40, 520, 520);
  await document.fonts?.ready;
  ctx.fillStyle = '#7A7290'; ctx.font = '500 24px "JetBrains Mono", monospace';
  ctx.fillText(`pixel pal #${p.id}`, 640, 150);
  ctx.fillStyle = '#2B2440'; ctx.font = '400 104px "Instrument Serif", Georgia, serif';
  ctx.fillText(p.label.slice(0, 16), 636, 255);
  ctx.fillStyle = '#' + body; roundRect(ctx, 640, 290, 230, 58, 29); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2B2440'; ctx.font = '26px Silkscreen, monospace';
  ctx.fillText(STAGES[p.stage].toUpperCase(), 668, 330);
  ctx.font = '400 40px "Instrument Serif", Georgia, serif';
  ctx.fillText(`cared for ${p.careDays} ${p.careDays === 1 ? 'day' : 'days'}`, 640, 420);
  ctx.fillText('on BOT Chain', 640, 466);
  ctx.fillStyle = '#7A7290'; ctx.font = '22px "JetBrains Mono", monospace';
  ctx.fillText('drawn entirely on-chain · pixelpals', 640, 560);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const url = URL.createObjectURL(blob);

  const ov = document.createElement('div');
  ov.className = 'overlay';
  const text = `Meet ${p.label}, my ${STAGES[p.stage].toLowerCase()} Pixel Pal — cared for ${p.careDays} ${p.careDays === 1 ? 'day' : 'days'} on BOT Chain 🐣`;
  const link = location.origin + href(`app/playground?pal=${p.id}`);
  ov.innerHTML = `<div class="overlay-card" role="dialog" aria-modal="true" aria-label="Share card" style="width:min(620px,100%)">
    <img src="${url}" alt="Share card for ${esc(p.label)}" style="width:100%;border-radius:16px;border:1.5px solid var(--ink);margin-bottom:16px">
    <div class="buttons">
      <a class="pill pill-ink" href="${url}" download="pixel-pal-${p.id}.png">Download PNG</a>
      <a class="pill pill-line" target="_blank" rel="noopener" href="https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}">Post on X</a>
      <button class="pill pill-line" type="button" data-close>Close</button>
    </div>
    <p style="margin:12px 0 0;font-size:13px">Tip: download the card first, then attach it to your post.</p></div>`;
  document.body.append(ov);
  const close = () => { ov.remove(); URL.revokeObjectURL(url); };
  $('[data-close]', ov).onclick = close;
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ================================================================== PLAYGROUND
const pg = { all: null, sort: 'newest', species: 'all', stage: 'all', mood: 'all' };

async function renderPlayground() {
  app.innerHTML = `<div class="app">
    <div class="pg-head">
      <div><p class="label">the playground</p><h1>Everyone’s pals.</h1><p><b data-total>…</b> of 677 pals hatched — every image drawn by the contract.</p></div>
      <div class="filters">
        <label class="skip" for="f-sort">Sort</label>
        <select id="f-sort" data-f="sort"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="care">Most care days</option></select>
        <label class="skip" for="f-species">Species</label>
        <select id="f-species" data-f="species"><option value="all">All species</option>${SPECIES.map((s, i) => `<option value="${i}">${SPECIES_ICON[i]} ${s}</option>`).join('')}</select>
        <label class="skip" for="f-stage">Stage</label>
        <select id="f-stage" data-f="stage"><option value="all">All stages</option>${STAGES.map((s, i) => `<option value="${i}">${s}</option>`).join('')}</select>
        <label class="skip" for="f-mood">Mood</label>
        <select id="f-mood" data-f="mood"><option value="all">All moods</option>${MOODS.map((s, i) => `<option value="${i}">${MOOD_FACE[i]} ${s}</option>`).join('')}</select>
      </div>
    </div>
    <div class="gallery" aria-live="polite">${loadingHTML('gathering pals')}</div>
  </div>`;
  refreshCounts();
  $$('[data-f]').forEach((s) => {
    s.value = pg[s.dataset.f];
    s.addEventListener('change', () => { pg[s.dataset.f] = s.value; drawGallery(true); });
  });
  try {
    pg.all = await api.all();
  } catch (e) {
    console.error(e);
    $('.gallery').innerHTML = `<div class="empty" style="grid-column:1/-1"><h2>The chain is a bit slow.</h2><p>We couldn’t load the Playground just now.</p><button class="pill pill-ink" type="button" onclick="location.reload()">Try again</button></div>`;
    return;
  }
  drawGallery(false);
}

function drawGallery(animate) {
  const g = $('.gallery');
  if (!g || !pg.all) return;
  let list = pg.all.filter((p) =>
    (pg.species === 'all' || p.species === +pg.species) && (pg.stage === 'all' || p.stage === +pg.stage) && (pg.mood === 'all' || p.mood === +pg.mood));
  list = list.sort(pg.sort === 'oldest' ? (a, b) => a.id - b.id : pg.sort === 'care' ? (a, b) => b.careDays - a.careDays || a.id - b.id : (a, b) => b.id - a.id);
  const Flip = window.Flip;
  const state0 = animate && Flip && !reduced ? Flip.getState('.gallery .card') : null;
  if (!list.length) {
    g.innerHTML = `<div class="empty" style="grid-column:1/-1"><img class="px" src="${palSrc('2,1,4,0,0,1,b')}" alt=""><h2>No pals like that yet.</h2><p>Try another filter.</p></div>`;
    return;
  }
  const existing = new Map($$('.card', g).map((c) => [c.dataset.id, c]));
  g.replaceChildren(...list.map((p) => {
    let c = existing.get(String(p.id));
    if (!c) {
      c = document.createElement('a');
      c.className = 'card';
      c.dataset.id = p.id;
      c.dataset.route = '';
      c.href = href(`app/playground?pal=${p.id}`);
      c.innerHTML = `<img class="px" loading="lazy" src="${palSrc(palKey(p))}" alt="${esc(p.label)}"><b>${esc(p.label)}</b><small><span>${STAGES[p.stage]} ${MOOD_FACE[p.mood]}</span><span>${p.careDays}d</span></small>`;
    }
    return c;
  }));
  if (state0) Flip.from(state0, { duration: 0.5, ease: 'power2.inOut', stagger: 0.01, absolute: true, onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.4 }), onLeave: (els) => gsap.to(els, { opacity: 0, scale: 0.8, duration: 0.3 }) });
}

// ================================================================== PAL PAGE
async function renderPalPage(raw) {
  const id = Number(raw);
  app.innerHTML = `<div class="app"><a class="back" href="app/playground" data-route>← playground</a>${loadingHTML('looking for this pal')}</div>`;
  let p = null;
  if (Number.isInteger(id) && id > 0) {
    try { p = await api.getPal(id); } catch (e) { console.error(e); }
  }
  if (!p) {
    app.innerHTML = `<div class="app"><div class="empty"><img class="px" src="${palSrc('2,2,4,0,0,2,b')}" alt=""><h2>This pal wandered off.</h2><p>There’s no pal #${esc(raw)} yet. Maybe it’s still an egg somewhere?</p><a class="pill pill-ink" href="app/playground" data-route>Back to the Playground</a></div></div>`;
    return;
  }
  document.title = `${p.label} · Pixel Pals`;
  const mine = wallet.account && p.owner.toLowerCase() === wallet.account.toLowerCase();
  const prog = progress(p);
  const age = p.age;
  const born = new Date(p.bornAt * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  app.innerHTML = `<div class="app">
    <a class="back" href="app/playground" data-route>← playground</a>
    <div class="pal-page">
      <div class="pal-hero"><img class="px" data-live alt="${esc(p.label)}, as drawn by the contract"><p class="note">tokenURI · live on-chain image</p></div>
      <div class="pal-info">
        <p class="label">pixel pal #${p.id}</p>
        <h1>${esc(p.label)}</h1>
        <p class="sub">${STAGES[p.stage]} ${SPECIES[p.species]} · ${MOOD_FACE[p.mood]} ${MOODS[p.mood]} · ${mine ? '<b>your pal</b>' : 'view only'}</p>
        <div class="panel">
          <div class="row" style="margin-bottom:16px"><div class="bar-label"><span>${prog.text}</span></div><div class="bar"><i style="width:${prog.pct}%"></i></div></div>
          <h3>care history · last 14 days</h3>${dotsHTML(p.history || 0)}
        </div>
        <div class="panel"><h3>traits</h3><div class="traits">${traitChips(p)}</div></div>
        <div class="panel">
          <dl class="meta-list">
            <dt>Care days</dt><dd>${p.careDays}</dd>
            <dt>Age</dt><dd>${age} ${age === 1 ? 'day' : 'days'} · born ${born}</dd>
            <dt>Owner</dt><dd class="mono">${MODE === 'live' ? `<a href="${explorerAddress(p.owner)}" target="_blank" rel="noopener">${short(p.owner)}</a>` : short(p.owner)}${mine ? ' (you)' : ''}</dd>
          </dl>
          <div class="panel-links">
            ${mine ? `<a class="pill pill-ink" href="app" data-route data-care="${p.id}">Care for ${esc(p.label)}</a>` : ''}
            ${MODE === 'live' ? `<a class="pill pill-line" href="${explorerToken(p.id)}" target="_blank" rel="noopener">View on explorer ↗</a>` : '<span class="pill pill-line" aria-disabled="true" title="Available once the contract is deployed">View on explorer ↗</span>'}
          </div>
        </div>
      </div>
    </div>
  </div>`;
  liveImage(p, $('[data-live]'));
  $('[data-care]')?.addEventListener('click', () => { state.selected = p.id; try { localStorage.setItem(SEL_KEY, p.id); } catch { /* ignore */ } });
}

