// The storytelling website: "Mochi's first two weeks". GSAP + ScrollTrigger + SplitText + Flip + MotionPath.
import { $, $$, palSrc, reduced, refreshCounts } from './main.js';
import { api } from './chain.js';
import { renderSVG } from './sprites.js';
import { sfx, voice, music, rain as rainSound } from './sound.js';

// scroll-scrubbed scenes only make sounds while scrolling down (no reversed jingles)
let lastY = 0;
let forward = true;
addEventListener('scroll', () => { forward = scrollY >= lastY; lastY = scrollY; }, { passive: true });
const fwd = (fn) => () => { if (forward) fn(); };

const { gsap, ScrollTrigger, SplitText, MotionPathPlugin, Flip } = window;
const MOCHI = { species: 2, palette: 0, pattern: 0, accessory: 1 };
const mochiKey = (stage, mood = 0) => `2,${stage},0,0,1,${mood}`;
const bare = (key) => (key.endsWith(',b') ? key : key + ',b');
const desktop = () => matchMedia('(min-width: 1025px)').matches;

export function initSite() {
  gsap.registerPlugin(ScrollTrigger, SplitText, MotionPathPlugin, Flip);
  if (!reduced && window.Lenis) {
    const lenis = new window.Lenis({ lerp: 0.12 });
    window.ppLenis = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    $$('a[href^="#"], a[href^="./#"]').forEach((a) => a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').split('#')[1];
      const el = id && document.getElementById(id);
      if (el) { e.preventDefault(); lenis.scrollTo(el, { offset: -20 }); }
    }));
  }

  heroWall();
  heroIntro();
  backgrounds();
  headlines();
  parallax();
  chapter2();
  chapter3();
  chapter4();
  chapter5();
  chapter6();
  chapter7();
  faq();
  epilogue();
  storyPal();
  footerWordmark();
  // pins first, so every trigger below them includes the pin spacing
  ScrollTrigger.sort();
  ScrollTrigger.refresh();

  if (location.hash) {
    const el = document.getElementById(location.hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView(), 50);
  }
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  setInterval(refreshCounts, 30_000);
}

// ------------------------------------------------------------------ hero: a drifting wall of pals
function heroWall() {
  const wall = $('.pal-wall');
  const track = $('.pal-wall-track');
  const CELL = innerWidth < 720 ? 76 : 96;
  let s = 42;
  const rnd = (n) => ((s = (s * 16807) % 2147483647), s % n);
  const cols = Math.ceil(wall.clientWidth / CELL) + 2;
  const rows = Math.ceil(wall.clientHeight / CELL) + 2;
  const W = cols * CELL;
  const H = rows * CELL;
  track.style.display = 'block';
  const items = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const stage = [0, 1, 1, 2, 2, 3, 3, 3][rnd(8)];
      const look = { species: rnd(3), stage, palette: rnd(8), pattern: rnd(4), accessory: rnd(5) };
      const key = [look.species, stage, look.palette, look.pattern, look.accessory].join(',');
      const cell = document.createElement('div');
      cell.className = 'wall-pal';
      cell.style.cssText = `position:absolute;left:0;top:0;width:${CELL}px;height:${CELL}px;padding:4px`;
      const img = new Image();
      img.alt = '';
      img.className = 'px';
      img.style.cssText = `width:${CELL - 8}px;height:${CELL - 8}px;border-radius:${CELL / 5}px`;
      img.src = palSrc(`${key},0`);
      cell.append(img);
      track.append(cell);
      items.push({ cell, img, c, r, key, stage, species: look.species, near: false, bounce: gsap.quickTo(img, 'y', { duration: 0.45, ease: 'back.out(3)' }), cx: 0, cy: 0 });
    }
  }

  let ox = 0, oy = 0, running = true, lastSqueak = 0;
  const place = () => {
    for (const it of items) {
      const x = ((((it.c * CELL + ox) % W) + W) % W) - CELL;
      const y = ((((it.r * CELL + oy) % H) + H) % H) - CELL;
      it.cx = x + CELL / 2;
      it.cy = y + CELL / 2;
      it.cell.style.transform = `translate3d(${x}px,${y}px,0)`;
    }
  };
  place();
  if (!reduced) {
    gsap.ticker.add((_, dt) => {
      if (!running) return;
      ox += dt * 0.014;
      oy += dt * 0.009;
      place();
    });
    // blink: a random pal closes its eyes for a moment
    setInterval(() => {
      if (!running) return;
      const it = items[Math.floor(Math.random() * items.length)];
      if (!it.stage) return;
      it.img.src = palSrc(`${it.key},1`);
      setTimeout(() => { it.img.src = palSrc(`${it.key},0`); }, 170);
    }, 140);
    // pals near the cursor hop up
    wall.parentElement.addEventListener('pointermove', (e) => {
      const b = wall.getBoundingClientRect();
      const mx = e.clientX - b.left, my = e.clientY - b.top;
      for (const it of items) {
        const d = Math.hypot(it.cx - mx, it.cy - my);
        it.bounce(d < 150 ? -18 * (1 - d / 150) : 0);
        const near = d < 60;
        if (near && !it.near && performance.now() - lastSqueak > 110) { lastSqueak = performance.now(); sfx.squeak(it.species); }
        it.near = near;
      }
    });
    ScrollTrigger.create({ trigger: '.hero', start: 'top top', end: 'bottom top', onToggle: (st) => { running = st.isActive; } });
  }
}

function heroIntro() {
  $('.hero-egg').addEventListener('click', () => {
    for (let i = 0; i < 4; i++) setTimeout(sfx.wiggle, i * 90);
    gsap.fromTo('.hero-egg', { rotate: -12 }, { rotate: 0, duration: 0.6, ease: 'elastic.out(1.2, 0.3)' });
  });
  if (reduced) return gsap.from('.hero-card', { opacity: 0, duration: 0.6 });
  gsap.timeline({ delay: 0.15 })
    .from('.pal-wall', { opacity: 0, duration: 0.8 })
    .from('.hero-card', { opacity: 0, y: 60, scale: 0.96, duration: 0.9, ease: 'power3.out' }, '-=0.5')
    .from('.hero-card > *', { opacity: 0, y: 14, stagger: 0.07, duration: 0.5, ease: 'power2.out' }, '-=0.5')
    .from('.hero-more', { opacity: 0, y: 20, duration: 0.5 }, '-=0.2');
}

// ------------------------------------------------------------------ background colour story
function backgrounds() {
  // Each chapter takes over the page colour when its top passes the middle of the screen;
  // scrolling back above it hands the colour back to the chapter before (pins included).
  const secs = $$('[data-bg]');
  const paint = (c) => gsap.to(document.body, { backgroundColor: c, duration: reduced ? 0 : 0.8, overwrite: true });
  secs.forEach((sec, i) => {
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 55%',
      onEnter: () => paint(sec.dataset.bg),
      onLeaveBack: () => paint(i ? secs[i - 1].dataset.bg : '#FBF7F0'),
    });
  });
}

// ------------------------------------------------------------------ headlines type in, the pal pops last
function headlines() {
  $$('.split').forEach((h) => {
    const pal = $('.in-word', h);
    if (reduced) return gsap.from(h, { opacity: 0, duration: 0.6, scrollTrigger: { trigger: h, start: 'top 85%' } });
    const split = new SplitText(h, { type: 'words,chars', wordsClass: 'w' });
    const tl = gsap.timeline({ scrollTrigger: { trigger: h, start: 'top 82%', toggleActions: 'play none none reverse' } });
    tl.from(split.chars, { yPercent: 90, opacity: 0, rotate: 6, stagger: 0.022, duration: 0.6, ease: 'power3.out' });
    if (pal) tl.from(pal, { scale: 0, rotate: -25, duration: 0.6, ease: 'back.out(3)' }, '-=0.15');
    const rest = h.parentElement.querySelectorAll(':scope > .story, :scope > .teach li, :scope > .label');
    if (rest.length) tl.from(rest, { opacity: 0, y: 16, stagger: 0.06, duration: 0.5 }, 0.1);
  });
}

function parallax() {
  if (reduced) return;
  $$('.float-px').forEach((el) => {
    gsap.to(el, { y: Number(el.dataset.speed) * -260, rotate: Number(el.dataset.speed) * 30, ease: 'none', scrollTrigger: { trigger: el.closest('section'), start: 'top bottom', end: 'bottom top', scrub: true } });
  });
}

// ------------------------------------------------------------------ chapter 02: the trait slot machine
const REEL_OPTIONS = {
  Blob: ['Cat', 'Dino', 'Blob', 'Cat', 'Dino', 'Cat', 'Dino'],
  'Strawberry Milk': ['Mint Chip', 'Lemon Drop', 'Sky Bubble', 'Peach Soda', 'Matcha Latte', 'Cotton Candy', 'Lavender Haze'],
  Plain: ['Spots', 'Stripes', 'Sparkles', 'Spots', 'Stripes', 'Sparkles', 'Stripes'],
  Bow: ['Flower', 'Tiny hat', 'Round glasses', 'None', 'Flower', 'Tiny hat', 'Round glasses'],
};

export function fillReel(reel, final, options) {
  const opts = options || REEL_OPTIONS[final] || [];
  reel.innerHTML = [...opts, ...opts, final].map((t) => `<span>${t}</span>`).join('');
  return reel.children.length;
}

function chapter2() {
  const reels = $$('#story-slots .slot-reel');
  const counts = reels.map((r) => fillReel(r, r.dataset.final));
  const pal = $('.ch2 .reveal-pal');
  const chips = $$('.ch2 .chips span');
  if (reduced) {
    reels.forEach((r, i) => gsap.set(r, { y: -(counts[i] - 1) * 44 }));
    return;
  }
  const tl = gsap.timeline({ paused: true });
  reels.forEach((r, i) => tl.fromTo(r, { y: 0 }, { y: -(counts[i] - 1) * 44, duration: 1.1 + i * 0.35, ease: 'power4.out' }, 0));
  for (let t = 0; t < 1.9; t += 0.06 + t * 0.05) tl.call(sfx.tick, null, t);
  reels.forEach((_, i) => tl.call(() => sfx.ding(i), null, 1.1 + i * 0.35));
  tl.call(() => { sfx.crack(); voice({ species: 2, stage: 1, syllables: 3, at: 0.3 }); }, null, 1.95);
  tl.fromTo(pal, { scale: 0, rotate: -20, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, duration: 0.7, ease: 'back.out(2.2)' }, '-=0.3')
    .fromTo(chips, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, stagger: 0.08, duration: 0.4, ease: 'back.out(3)' }, '-=0.3');
  ScrollTrigger.create({ trigger: '.ch2', start: 'top 55%', onEnter: () => tl.restart(), onLeaveBack: () => tl.pause(0) });
}

// ------------------------------------------------------------------ chapter 03: breakfast, playtime, bedtime (pinned, scrubbed)
export function careTimeline(root, { scrub = true } = {}) {
  const pal = $('.room-pal', root);
  const bowl = $('.room-bowl', root);
  const ball = $('.room-ball', root);
  const night = $('.room-night', root);
  const zzz = $('.zzz', root);
  const toastEl = $('.toast-care', root);
  const btn = (c) => $(c, root);
  const press = (el) => [{ y: 4, boxShadow: '0 0px 0 #2B2440', duration: 0.15 }, { y: 0, boxShadow: '0 4px 0 #2B2440', background: '#fff', duration: 0.2 }];
  const tl = gsap.timeline({ paused: !scrub, defaults: { ease: 'power1.inOut' } });
  const room = pal.parentElement;
  const W = () => room.clientWidth;
  // feed
  tl.to(btn('.b-feed'), press()[0]).to(btn('.b-feed'), press()[1])
    .set(bowl, { className: 'room-bowl full' })
    .call(fwd(() => { sfx.munch(); voice({ species: 2, stage: 1, syllables: 2, at: 0.35 }); }))
    .to(pal, { x: () => -W() * 0.24, duration: 0.6 })
    .to(pal, { y: -14, repeat: 3, yoyo: true, duration: 0.15 })
    .set(bowl, { className: 'room-bowl' })
    // play
    .to(btn('.b-play'), press()[0]).to(btn('.b-play'), press()[1])
    .call(fwd(sfx.boing))
    .to(ball, { x: () => W() * 0.32, y: -40, duration: 0.35, ease: 'power2.out' })
    .to(ball, { y: 0, duration: 0.3, ease: 'bounce.out' })
    .call(fwd(() => { sfx.bounce(0); voice({ species: 2, stage: 1, syllables: 2 }); }))
    .to(pal, { x: () => W() * 0.06, duration: 0.5 }, '<')
    .to(pal, { y: -22, repeat: 1, yoyo: true, duration: 0.2 })
    .to(ball, { x: 0, duration: 0.5 }, '<')
    // sleep
    .to(btn('.b-sleep'), press()[0]).to(btn('.b-sleep'), press()[1])
    .to(pal, { x: () => W() * 0.2, y: -W() * 0.07, scaleY: 0.85, duration: 0.6 })
    .to(night, { opacity: 0.42, duration: 0.5 }, '<')
    .call(fwd(() => { sfx.lullaby(); setTimeout(sfx.snore, 1500); }))
    .to(zzz, { opacity: 1, y: -10, duration: 0.5 })
    .call(fwd(sfx.careDay))
    .to(toastEl, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(3)' })
    .call(() => { const d = $('.mock-days', root); if (d) d.textContent = '1 / 7 to Teen'; }, null, '<')
    .to({}, { duration: 0.4 });
  return tl;
}

function chapter3() {
  const sec = $('.ch3');
  const demo = $('#care-demo');
  const tl = careTimeline(demo);
  if (reduced) { tl.progress(1); return; }
  tl.eventCallback('onUpdate', () => {
    const d = $('.mock-days', demo);
    d.textContent = tl.progress() > 0.92 ? '1 / 7 to Teen' : '0 / 7 to Teen';
  });
  ScrollTrigger.create({ trigger: sec, start: 'top top', end: '+=1600', pin: true, scrub: 0.8, animation: tl, anticipatePin: 1, refreshPriority: 2 });
}

// ------------------------------------------------------------------ chapter 04: growing up (pinned, scrubbed)
function chapter4() {
  const sec = $('.ch4');
  const list = $('.calendar ol');
  for (let d = 1; d <= 14; d++) list.insertAdjacentHTML('beforeend', `<li data-d="${d}"></li>`);
  const dots = $$('li', list);
  const stages = $$('.evolve-pal .st', sec);
  const label = $('.evolve-label', sec);
  const sparkles = $('.sparkles', sec);
  for (let i = 0; i < 14; i++) sparkles.insertAdjacentHTML('beforeend', `<i style="left:${50 + 44 * Math.cos(i / 14 * 6.283)}%;top:${50 + 44 * Math.sin(i / 14 * 6.283)}%"></i>`);
  const sparks = $$('i', sparkles);
  gsap.set(sparks, { scale: 0, opacity: 0 });

  let shown = 0;
  const show = (stage) => {
    if (stage === shown) return;
    stages.forEach((s, i) => gsap.to(s, { opacity: i === stage ? 1 : 0, scale: i === stage ? 1 : 0.85, duration: 0.35, overwrite: true }));
    if (stage > shown) {
      if (stage === 1) sfx.crack();
      sfx.careDay();
      voice({ species: 2, stage, syllables: 3, at: 0.35 });
    }
    if (stage > shown && !reduced) {
      gsap.fromTo(sparks, { scale: 0, opacity: 1 }, { scale: 1.6, opacity: 0, duration: 0.9, stagger: 0.02, ease: 'power2.out', overwrite: true });
      gsap.fromTo('.evolve-pal', { rotate: -12, scale: 0.9 }, { rotate: 0, scale: 1, duration: 0.6, ease: 'back.out(3)' });
    }
    label.textContent = ['Egg', 'Baby', 'Teen', 'Adult'][stage];
    shown = stage;
  };
  const setDay = (day) => {
    dots.forEach((d, i) => d.classList.toggle('on', i < day));
    show(day >= 14 ? 3 : day >= 7 ? 2 : day >= 1 ? 1 : 0);
  };
  if (reduced) return setDay(14);
  ScrollTrigger.create({
    trigger: sec, start: 'top top', end: '+=1800', pin: true, scrub: true, anticipatePin: 1, refreshPriority: 1,
    onUpdate: (st) => setDay(Math.min(14, Math.floor(st.progress * 15.5))),
  });
}

// ------------------------------------------------------------------ chapter 05: a rainy day
function chapter5() {
  const scene = $('.rain-scene');
  const rain = $('.rain', scene);
  for (let i = 0; i < 14; i++) rain.insertAdjacentHTML('beforeend', `<i style="left:${18 + Math.random() * 64}%;top:${10 + Math.random() * 20}%"></i>`);
  const drops = $$('i', rain);
  if (reduced) {
    gsap.set('.rain-pal .sad', { opacity: 0 }); gsap.set('.rain-pal .happy', { opacity: 1 }); gsap.set('.rainbow', { opacity: 1 }); gsap.set(rain, { opacity: 0 });
    return;
  }
  drops.forEach((d) => gsap.fromTo(d, { y: 0, opacity: 1 }, { y: 140 + Math.random() * 60, opacity: 0, duration: 0.8 + Math.random() * 0.5, repeat: -1, delay: Math.random(), ease: 'none' }));
  let stopRain = null;
  const rainOn = (on) => {
    if (on && !stopRain) stopRain = rainSound();
    if (!on && stopRain) { stopRain(); stopRain = null; }
  };
  ScrollTrigger.create({
    trigger: '.ch5', start: 'top 60%', end: 'bottom 40%',
    onEnter: () => { music('rain'); rainOn(true); voice({ species: 2, stage: 2, mood: 2, syllables: 3, at: 0.6 }); setTimeout(sfx.sniffle, 1600); },
    onEnterBack: () => music('rain'),
    onLeave: () => { music('story'); rainOn(false); },
    onLeaveBack: () => { music('story'); rainOn(false); },
  });
  gsap.timeline({ scrollTrigger: { trigger: '.ch5', start: 'top 30%', end: 'bottom 70%', scrub: 0.6, onUpdate: (st) => { if (st.isActive) rainOn(st.progress < 0.4); } } })
    .to({}, { duration: 0.3 })
    .fromTo('.snack', { x: -80, opacity: 0, rotate: -30 }, { x: 70, opacity: 1, rotate: 0, duration: 0.5 })
    .call(fwd(sfx.munch))
    .to('.snack', { scale: 0, opacity: 0, duration: 0.2 })
    .to(rain, { opacity: 0, duration: 0.3 }, '<')
    .to('.rain-pal .sad', { opacity: 0, duration: 0.3 }, '<')
    .to('.rain-pal .happy', { opacity: 1, duration: 0.3 }, '<')
    .call(fwd(() => { sfx.rainbow(); voice({ species: 2, stage: 2, syllables: 4, at: 0.4 }); }))
    .fromTo('.rainbow', { opacity: 0, scale: 0.6, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 0.6, ease: 'back.out(2)' })
    .to('.rain-pal', { y: -20, duration: 0.2, yoyo: true, repeat: 1 }, '<');
}

// ------------------------------------------------------------------ chapter 06: making friends (real pals)
async function chapter6() {
  const cards = $$('#bento .bento-card');
  const fallback = [
    { id: 0, label: 'Mochi', key: mochiKey(3) },
    { id: 0, label: 'Bean', key: '0,3,4,1,2,0' },
    { id: 0, label: 'Pudding', key: '1,3,5,0,4,0' },
    { id: 0, label: 'Sprout', key: '1,2,7,2,0,0' },
    { id: 0, label: 'Tofu', key: '0,1,2,3,1,0' },
  ];
  let pals = [];
  let names = [];
  try {
    const all = await api.all();
    const k = (p) => [p.species, p.stage, p.palette, p.pattern, p.accessory, p.mood].join(',');
    const pick = (fn) => all.filter(fn).sort((a, b) => b.careDays - a.careDays)[0];
    const newest = all[all.length - 1];
    const most = [...all].sort((a, b) => b.careDays - a.careDays)[0];
    const chosen = [newest, most, pick((p) => p.stage === 3 && p !== most), pick((p) => p.stage === 2), pick((p) => p.stage === 1)];
    pals = chosen.map((p, i) => (p ? { id: p.id, label: p.label, key: k(p) } : fallback[i]));
    names = all.filter((p) => p.name).map((p) => ({ label: p.name, key: k(p) }));
    if (all.length) cards[5].dataset.extra = JSON.stringify(all.slice(-4).map(k));
  } catch {
    pals = fallback;
  }
  if (!pals.length) pals = fallback;
  if (names.length < 8) names = names.concat(['Mochi', 'Bean', 'Pudding', 'Sprout', 'Tofu', 'Biscuit', 'Noodle', 'Peaches', 'Boba', 'Kiwi'].map((n, i) => ({ label: n, key: `${i % 3},${1 + (i % 3)},${i % 8},${i % 4},${i % 5},0` })));

  pals.forEach((p, i) => {
    const c = cards[i];
    c.addEventListener('pointerenter', () => voice({ species: Number(p.key[0]), stage: Number(p.key[2]), mood: Number(p.key.split(',')[5]), syllables: 2, vol: 0.14 }));
    c.insertAdjacentHTML('beforeend', `<img class="px" src="${palSrc(bare(p.key))}" alt="${p.label}"><span class="bento-name">${p.label}</span>`);
    if (p.id) c.href = c.href.replace(/app\/playground.*/, `app/playground?pal=${p.id}`);
  });
  const extra = cards[5].dataset.extra ? JSON.parse(cards[5].dataset.extra) : ['0,1,1,0,2,0', '1,2,3,1,0,0', '2,3,6,3,4,0', '0,3,4,2,1,0'];
  extra.forEach((key) => cards[5].insertAdjacentHTML('beforeend', `<img class="px" src="${palSrc(bare(key))}" alt="">`));

  if (!reduced) {
    gsap.from(cards, { y: 60, opacity: 0, rotate: () => gsap.utils.random(-4, 4), stagger: 0.08, duration: 0.7, ease: 'back.out(1.6)', scrollTrigger: { trigger: '#bento', start: 'top 80%' } });
  }

  names = names.filter((n, i) => names.findIndex((m) => m.label === n.label) === i);
  const track = $('.marquee-track');
  const html = names.slice(0, 24).map((n) => `<span><img class="px" src="${palSrc(bare(n.key))}" alt="">${n.label}</span>`).join('');
  track.innerHTML = html + html;
  if (!reduced) gsap.to(track, { xPercent: -50, duration: 40, ease: 'none', repeat: -1 });
  ScrollTrigger.sort();
  ScrollTrigger.refresh();
}

// ------------------------------------------------------------------ chapter 07: forever, on-chain (un-build into pixels)
function chapter7() {
  const svg = $('.unbuild-svg');
  const code = $('.ch7 .code code');
  const NS = 'http://www.w3.org/2000/svg';
  // split Mochi's on-chain SVG into single pixels
  const doc = new DOMParser().parseFromString(renderSVG({ ...MOCHI, stage: 3, mood: 0 }), 'image/svg+xml');
  const pixels = [];
  doc.querySelectorAll('rect').forEach((r, idx) => {
    if (idx < 2) return; // background + shadow
    let tx = 0, ty = 0;
    for (let p = r.parentElement; p && p.tagName === 'g'; p = p.parentElement) {
      const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(p.getAttribute('transform') || '');
      if (m) { tx += +m[1]; ty += +m[2]; }
    }
    const x = +r.getAttribute('x') + tx - 2, y = +r.getAttribute('y') + ty - 3, w = +r.getAttribute('width');
    for (let k = 0; k < w; k++) pixels.push({ x: x + k, y, fill: r.getAttribute('fill'), op: r.getAttribute('opacity') });
  });
  const bg = document.createElementNS(NS, 'rect');
  Object.entries({ x: -2, y: -3, width: 20, height: 20, rx: 2, fill: '#FFF0F5' }).forEach(([k, v]) => bg.setAttribute(k, v));
  svg.append(bg);
  const gridG = document.createElementNS(NS, 'g');
  svg.append(gridG);
  for (let i = 0; i <= 16; i++) {
    for (const [x1, y1, x2, y2] of [[i, 0, i, 16], [0, i, 16, i]]) {
      const l = document.createElementNS(NS, 'line');
      Object.entries({ x1, y1, x2, y2, stroke: '#2B2440', 'stroke-width': 0.04, opacity: 0.35 }).forEach(([k, v]) => l.setAttribute(k, v));
      gridG.append(l);
    }
  }
  gsap.set(gridG, { opacity: 0 });
  const els = pixels.map((p) => {
    const r = document.createElementNS(NS, 'rect');
    Object.entries({ x: p.x, y: p.y, width: 1, height: 1, fill: p.fill }).forEach(([k, v]) => r.setAttribute(k, v));
    if (p.op) r.setAttribute('opacity', p.op);
    svg.append(r);
    return r;
  });

  const line = (p) => `<span class="t">&lt;rect</span> <span class="k">x</span>=<span class="v">"${p.x}"</span> <span class="k">y</span>=<span class="v">"${p.y}"</span> <span class="k">width</span>=<span class="v">"1"</span> <span class="k">fill</span>=<span class="v">"${p.fill}"</span><span class="t">/&gt;</span>`;
  const sample = pixels.filter((p) => p.fill !== '#3A3150').concat(pixels.filter((p) => p.fill === '#3A3150'));
  const writeCode = (n) => {
    const start = Math.max(0, Math.min(sample.length - 6, n));
    code.innerHTML = ['<span class="t">&lt;svg</span> <span class="k">viewBox</span>=<span class="v">"0 0 20 20"</span><span class="t">&gt;</span>']
      .concat(sample.slice(start, start + 5).map(line)).join('\n');
  };
  writeCode(0);
  if (reduced) return;

  const tl = gsap.timeline();
  tl.call(fwd(sfx.glitch), null, 0.05);
  tl.call(fwd(sfx.glitch), null, 2.2);
  tl.to(els, {
    attr: { x: (i) => 8 + (pixels[i].x - 8) * 1.28, y: (i) => 8 + (pixels[i].y - 8) * 1.28 },
    scale: 0.82, transformOrigin: '50% 50%', duration: 1, stagger: { amount: 0.6, from: 'random' }, ease: 'power2.inOut',
  })
    .to(gridG, { opacity: 1, duration: 0.5 }, 0.4)
    .to({}, { duration: 0.6 })
    .to(els, { attr: { x: (i) => pixels[i].x, y: (i) => pixels[i].y }, scale: 1, duration: 1, stagger: { amount: 0.5, from: 'edges' }, ease: 'power2.inOut' })
    .to(gridG, { opacity: 0, duration: 0.4 }, '<0.6');
  ScrollTrigger.create({
    trigger: '.ch7', start: 'top 65%', end: 'bottom 35%', scrub: 0.8, animation: tl,
    onUpdate: (st) => writeCode(Math.floor(st.progress * (sample.length - 6))),
  });
}

function faq() {
  if (reduced) return;
  gsap.from('.faq li', { opacity: 0, y: 24, stagger: 0.07, duration: 0.5, scrollTrigger: { trigger: '.faq', start: 'top 80%' } });
  gsap.to('.faq-doodle', { rotate: 8, y: -8, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut' });
}

function epilogue() {
  ScrollTrigger.create({ trigger: '.epilogue', start: 'top 60%', onEnter: () => { voice({ species: 2, stage: 3, syllables: 4 }); sfx.wiggle(); } });
  $('.cta-wave').addEventListener('click', () => voice({ species: 2, stage: 3, syllables: 3 }));
  $('.cta-egg').addEventListener('click', () => { for (let i = 0; i < 4; i++) setTimeout(sfx.wiggle, i * 90); });
  if (reduced) return;
  gsap.from('.cta-card', { scale: 0.92, opacity: 0, y: 40, duration: 0.8, ease: 'back.out(1.4)', scrollTrigger: { trigger: '.epilogue', start: 'top 80%' } });
  gsap.timeline({ repeat: -1, repeatDelay: 1.2, scrollTrigger: { trigger: '.epilogue', start: 'top bottom', toggleActions: 'play pause resume pause' } })
    .to('.cta-wave img', { rotate: -10, transformOrigin: '50% 100%', duration: 0.2 })
    .to('.cta-wave img', { rotate: 10, duration: 0.2, repeat: 3, yoyo: true })
    .to('.cta-wave img', { rotate: 0, y: -12, duration: 0.2 })
    .to('.cta-wave img', { y: 0, duration: 0.3, ease: 'bounce.out' });
}

// ------------------------------------------------------------------ the story pal: Mochi hops from chapter to chapter
function storyPal() {
  const follow = $('#mochi-follow');
  const img = $('img', follow);
  if (reduced || !desktop()) { follow.remove(); return; }
  follow.style.position = 'absolute';
  let current = null;
  let pos = null;

  const seatOf = (sec) => {
    const text = $('.ch-text, .faq-head', sec);
    const label = $('.label', text);
    const t = text.getBoundingClientRect();
    const l = label.getBoundingClientRect();
    return { x: t.left + Math.min(t.width, 500) - 96 + scrollX, y: l.top - 92 + scrollY };
  };

  const hopTo = (sec) => {
    if (sec === current) return;
    current = sec;
    const look = sec.dataset.mochi;
    if (!look) { gsap.to(follow, { opacity: 0, scale: 0.6, duration: 0.3 }); return; }
    const to = seatOf(sec);
    if (!pos || gsap.getProperty(follow, 'opacity') < 0.1) {
      img.src = palSrc(bare(look));
      gsap.set(follow, { x: to.x, y: to.y });
      gsap.fromTo(follow, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(3)' });
      pos = to;
      return;
    }
    const from = { x: gsap.getProperty(follow, 'x'), y: gsap.getProperty(follow, 'y') };
    const peak = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 180 };
    sfx.hop();
    const stageNow = Number(look.split(',')[1]);
    setTimeout(() => voice({ species: 2, stage: stageNow, mood: Number(look.split(',')[5]), syllables: 2, vol: 0.13 }), 1100);
    gsap.timeline({ overwrite: true })
      .to(follow, { scaleY: 0.8, scaleX: 1.15, duration: 0.12, transformOrigin: '50% 100%' })
      .to(follow, { motionPath: { path: [from, peak, to], curviness: 1.25 }, scaleY: 1, scaleX: 1, rotate: from.x < to.x ? 360 : -360, duration: 0.95, ease: 'power1.inOut' })
      .call(() => { img.src = palSrc(bare(look)); }, null, '-=0.5')
      .set(follow, { rotate: 0 })
      .to(follow, { scaleY: 0.82, scaleX: 1.12, duration: 0.1 })
      .to(follow, { scaleY: 1, scaleX: 1, duration: 0.35, ease: 'back.out(4)' });
    pos = to;
  };

  $$('#story [data-mochi]').forEach((sec) => {
    ScrollTrigger.create({ trigger: sec, start: 'top 45%', end: 'bottom 45%', onToggle: (st) => st.isActive && hopTo(sec) });
  });
  ScrollTrigger.create({ trigger: '.hero', start: 'top top', end: 'bottom 45%', onEnterBack: () => { current = null; gsap.to(follow, { opacity: 0, duration: 0.3 }); } });
  // idle breathing
  gsap.to(img, { y: -4, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  ScrollTrigger.addEventListener('refresh', () => { if (current?.dataset.mochi) { const s = seatOf(current); gsap.set(follow, { x: s.x, y: s.y }); } });
}

// ------------------------------------------------------------------ footer wordmark: blocks drop into place
function footerWordmark() {
  const blocks = $$('.wordmark i.on');
  if (reduced || !desktop()) return;
  gsap.from(blocks, {
    y: -260, opacity: 0, duration: 0.6, ease: 'bounce.out',
    stagger: { each: 0.008, from: 'start', onComplete: () => { if (Math.random() < 0.3) sfx.plink(); } },
    scrollTrigger: { trigger: '.wordmark', start: 'top 92%' },
  });
  gsap.from('.wordmark-mochi', { opacity: 0, y: -40, duration: 0.6, delay: 1.2, ease: 'back.out(2)', onComplete: () => { sfx.snore(); sfx.zzz(); }, scrollTrigger: { trigger: '.wordmark', start: 'top 92%' } });
  $('.wordmark-mochi').addEventListener('click', () => { sfx.snore(); sfx.zzz(); });
  gsap.to('.wordmark-mochi .zz i, .wordmark-mochi .zz', { opacity: 0.3, y: -4, duration: 1.2, yoyo: true, repeat: -1, stagger: 0.3, ease: 'sine.inOut' });
}
