/* Do It All With Devin — Billboard Remix
   Drag four corners onto a billboard face; your line is warped into it. */

const COARSE = matchMedia('(pointer: coarse)').matches;
// Kept in sync with the phone breakpoint in styles.css.
const PHONE = () =>
  matchMedia('(max-width: 700px), (max-height: 520px) and (orientation: landscape) and (pointer: coarse)').matches;

const MAX_W = 1080;
// Longest side of the working image; keeps the warp interactive. Phones get a
// tighter cap: 4096 is ~16.7MP, which is at iOS Safari's canvas ceiling and
// makes the full-res export both slow and memory-risky.
const MAX_SRC = COARSE ? 2560 : 4096;
const FILENAME = 'do-it-all-with-devin.png';

// Handles are drawn and hit-tested in CSS pixels; a fingertip needs both bigger.
const HANDLE_R = COARSE ? 11 : 7;
const HIT_R_MOUSE = 18;
const HIT_R_TOUCH = 30;
const LOUPE_R = 52;
const LOUPE_ZOOM = 2.6;

const els = {
  stage: document.getElementById('stage'),
  hint: document.getElementById('hint'),
  file: document.getElementById('file'),
  sample: document.getElementById('useSample'),
  photo: document.getElementById('usePhoto'),
  text: document.getElementById('text'),
  presets: document.getElementById('presets'),
  themes: document.getElementById('themes'),
  scale: document.getElementById('scale'),
  blend: document.getElementById('blend'),
  wordmark: document.getElementById('wordmark'),
  guides: document.getElementById('showGuides'),
  download: document.getElementById('download'),
  tweet: document.getElementById('tweet'),
  copyText: document.getElementById('copyText'),
  status: document.getElementById('status'),
  chips: [...document.querySelectorAll('.chip')],
  camera: document.getElementById('camera'),
  panel: document.getElementById('panel'),
  sheetToggle: document.getElementById('sheetToggle'),
};

const PRESETS = [
  'I do it all\nwith Devin.',
  'Ship it\nwith Devin.',
  'My whole backlog.\nOne engineer.',
  'Friday deploys,\nno fear.',
  '39 billboards.\nZero all-nighters.',
];

const THEMES = [
  { id: 'ink', bg: '#0a0b0d', fg: '#ffffff', swatch: 'linear-gradient(135deg,#0a0b0d,#25272d)' },
  { id: 'paper', bg: '#ffffff', fg: '#0a0b0d', swatch: 'linear-gradient(135deg,#fff,#d8dae0)' },
  { id: 'signal', bg: '#1723d8', fg: '#ffffff', swatch: 'linear-gradient(135deg,#1723d8,#5a63ff)' },
  { id: 'bare', bg: null, fg: '#ffffff', swatch: 'repeating-linear-gradient(45deg,#15171c 0 6px,#0b0c0f 6px 12px)' },
];

const CAPTION =
  "I do it all with Devin. Today Devin is on 39 billboards across NYC & SF — " +
  "and it built the tool I used to make this image, corner-warp math and all.";
const SCOTT_POST = 'https://x.com/ScottWu46/status/2090135734204473374';

const state = {
  img: null,
  quad: null,          // [[x,y] x4] in image space: TL, TR, BR, BL
  theme: 'ink',
  drag: -1,
  grab: [0, 0],        // pointer -> corner offset in image space, so the corner doesn't jump
  touchDrag: false,
  dpr: 1,
  view: 1,             // image px -> CSS px
};

/* ---------- linear algebra ---------- */

// Homography mapping src[i] -> dst[i] (4 correspondences). Returns 3x3 row-major.
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
  }
  const h = solve(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    [b[i], b[p]] = [b[p], b[i]];
    const piv = A[i][i] || 1e-12;
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / piv;
      if (!f) continue;
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / (A[i][i] || 1e-12);
  }
  return x;
}

/* ---------- text layer ---------- */

function buildLayer(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const theme = THEMES.find(t => t.id === state.theme);

  if (theme.bg) {
    g.fillStyle = theme.bg;
    g.fillRect(0, 0, w, h);
    // subtle vignette so a flat fill doesn't read as a sticker
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, 'rgba(255,255,255,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0.10)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }

  const lines = (els.text.value || '').split('\n').map(s => s.trim()).filter(Boolean);
  const pad = w * 0.07;
  const boxW = w - pad * 2;
  const boxH = h * (els.wordmark.checked ? 0.66 : 0.82);
  const tighten = Number(els.scale.value) / 100;

  let size = boxH / Math.max(lines.length, 1) * 0.92 * tighten;
  const font = px => `800 ${px}px -apple-system, "Segoe UI", Inter, Helvetica, Arial, sans-serif`;
  for (let i = 0; i < 60; i++) {
    g.font = font(size);
    const widest = Math.max(...lines.map(l => g.measureText(l).width), 1);
    if (widest <= boxW) break;
    size *= boxW / widest;
  }

  g.font = font(size);
  g.fillStyle = theme.fg;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const lh = size * 0.98;
  const blockH = lh * lines.length;
  let y = h * (els.wordmark.checked ? 0.44 : 0.5) - blockH / 2 + size * 0.78;
  if (theme.id === 'bare') {
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = size * 0.14;
    g.shadowOffsetY = size * 0.03;
  }
  for (const line of lines) {
    g.fillText(line, pad, y);
    y += lh;
  }
  g.shadowColor = 'transparent';

  if (els.wordmark.checked) {
    const ws = h * 0.115;
    g.font = `700 ${ws}px -apple-system, "Segoe UI", Inter, Helvetica, Arial, sans-serif`;
    g.fillStyle = theme.fg;
    const label = 'devin';
    const lw = g.measureText(label).width;
    const bx = w - pad - lw, by = h - pad;
    g.fillText(label, bx, by);
    g.beginPath();
    g.arc(bx - ws * 0.52, by - ws * 0.3, ws * 0.16, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.5;
    g.font = `600 ${ws * 0.42}px -apple-system, "Segoe UI", Inter, Helvetica, Arial, sans-serif`;
    g.fillText('cognition.ai', pad, by);
    g.globalAlpha = 1;
  }
  return c;
}

/* ---------- warp + composite ---------- */

function warp(target, layer, quad, blendAmt) {
  const W = target.width, H = target.height;
  const xs = quad.map(p => p[0]), ys = quad.map(p => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(W, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(H, Math.ceil(Math.max(...ys)));
  if (x1 <= x0 || y1 <= y0) return;

  const ctx = target.getContext('2d');
  const bw = x1 - x0, bh = y1 - y0;
  const base = ctx.getImageData(x0, y0, bw, bh);
  const bd = base.data;

  const lw = layer.width, lh = layer.height;
  const ld = layer.getContext('2d').getImageData(0, 0, lw, lh).data;

  // inverse map: image space -> layer space
  const H3 = homography(quad, [[0, 0], [lw, 0], [lw, lh], [0, lh]]);

  for (let y = 0; y < bh; y++) {
    const iy = y0 + y + 0.5;
    for (let x = 0; x < bw; x++) {
      const ix = x0 + x + 0.5;
      const d = H3[6] * ix + H3[7] * iy + H3[8];
      const u = (H3[0] * ix + H3[1] * iy + H3[2]) / d;
      const v = (H3[3] * ix + H3[4] * iy + H3[5]) / d;
      if (u < 0 || v < 0 || u >= lw - 1 || v >= lh - 1) continue;

      const u0 = u | 0, v0 = v | 0, fu = u - u0, fv = v - v0;
      const i00 = (v0 * lw + u0) * 4, i10 = i00 + 4;
      const i01 = i00 + lw * 4, i11 = i01 + 4;
      const w00 = (1 - fu) * (1 - fv), w10 = fu * (1 - fv);
      const w01 = (1 - fu) * fv, w11 = fu * fv;

      const a = (ld[i00 + 3] * w00 + ld[i10 + 3] * w10 + ld[i01 + 3] * w01 + ld[i11 + 3] * w11) / 255;
      if (a <= 0.003) continue;

      const o = (y * bw + x) * 4;
      const lum = (bd[o] * 0.299 + bd[o + 1] * 0.587 + bd[o + 2] * 0.114) / 255;
      // let the scene's own light fall across the pasted face
      const shade = 1 - blendAmt + blendAmt * (0.45 + 0.85 * lum);

      for (let k = 0; k < 3; k++) {
        const src = (ld[i00 + k] * w00 + ld[i10 + k] * w10 + ld[i01 + k] * w01 + ld[i11 + k] * w11) * shade;
        bd[o + k] = bd[o + k] * (1 - a) + Math.min(255, src) * a;
      }
    }
  }
  ctx.putImageData(base, x0, y0);
}

function compose(canvas, scale) {
  const img = state.img;
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const quad = state.quad.map(([x, y]) => [x * scale, y * scale]);
  const side = Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]);
  const lw = Math.max(480, Math.min(2200, Math.round(side * 2)));
  warp(canvas, buildLayer(lw, Math.round(lw * 0.5)), quad, Number(els.blend.value) / 100);
  return canvas;
}

/* ---------- display ---------- */

let pending = false;
function render() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; draw(); });
}

// On phones the canvas has to leave room for the header, the stage footer and
// the collapsed control sheet, otherwise the lower handles land off-screen
// (worst in landscape, where the image was taller than the whole viewport).
function stageMaxHeight() {
  if (!PHONE()) return Infinity;
  const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  return Math.max(200, Math.min(vh - 150, vh * 0.62));
}

function draw() {
  if (!state.img) return;
  const c = els.stage;
  const availW = Math.min(c.parentElement.clientWidth - 2, MAX_W);
  state.view = Math.min(1, availW / state.img.width, stageMaxHeight() / state.img.height);

  // Render the backing store at devicePixelRatio so the preview isn't a blurry
  // upscale of a 1x render. Capped at 2x and at MAX_W to bound the warp cost, and
  // dropped to 1x mid-drag (2x quadruples the per-pixel warp: 16ms -> 64ms here).
  const cssW = state.img.width * state.view;
  const want = state.drag >= 0 ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  state.dpr = Math.max(1, Math.min(want, MAX_W / cssW));

  compose(c, state.view * state.dpr);
  c.style.width = Math.round(cssW) + 'px';
  c.style.height = Math.round(state.img.height * state.view) + 'px';

  const loupe = state.touchDrag && state.drag >= 0;

  if (els.guides.checked) {
    const g = c.getContext('2d');
    const s = state.view * state.dpr;
    const r = HANDLE_R * state.dpr;
    const q = state.quad.map(([x, y]) => [x * s, y * s]);
    g.save();
    g.strokeStyle = 'rgba(255,255,255,.85)';
    g.setLineDash([6 * state.dpr, 5 * state.dpr]);
    g.lineWidth = 1.5 * state.dpr;
    g.beginPath();
    q.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    g.closePath();
    g.stroke();
    g.setLineDash([]);
    q.forEach(([x, y], i) => {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = state.drag === i ? '#1723d8' : '#fff';
      g.fill();
      g.lineWidth = 2 * state.dpr;
      g.strokeStyle = '#0a0b0d';
      g.stroke();
      if (state.drag === i) {
        g.beginPath();
        g.arc(x, y, r * 1.9, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(255,255,255,.55)';
        g.lineWidth = 1.5 * state.dpr;
        g.stroke();
      }
    });
    g.restore();
  }

  if (loupe) drawLoupe(c);
}

// A finger covers the corner it is placing, so show the pixels under it in a
// bubble offset away from the touch point, sampled from the source photo so the
// board edge stays sharp at any preview scale.
function drawLoupe(c) {
  const s = state.view * state.dpr;
  const [ix, iy] = state.quad[state.drag];
  const cx = ix * s, cy = iy * s;
  const R = LOUPE_R * state.dpr;
  // keep the bubble on-canvas and clear of the finger
  const bx = Math.max(R + 2, Math.min(c.width - R - 2, cx < c.width / 2 ? cx + R * 1.6 : cx - R * 1.6));
  const by = Math.max(R + 2, Math.min(c.height - R - 2, cy - R * 1.6));
  const zoom = s * LOUPE_ZOOM;           // image px -> loupe px
  const rad = R / zoom;                  // sampled radius in image px
  const toLoupe = ([px, py]) => [bx + (px - ix) * zoom, by + (py - iy) * zoom];

  const g = c.getContext('2d');
  g.save();
  g.beginPath();
  g.arc(bx, by, R, 0, Math.PI * 2);
  g.fillStyle = '#0c0d10';
  g.fill();
  g.clip();
  g.drawImage(state.img, ix - rad, iy - rad, rad * 2, rad * 2, bx - R, by - R, R * 2, R * 2);

  // the two edges meeting this corner, so you can line it up on the board;
  // dark under light so they read on both a bright board and a dark sky
  const n = state.quad.length;
  const edges = [(state.drag + 1) % n, (state.drag + n - 1) % n].map(j => toLoupe(state.quad[j]));
  for (const [style, width, dash] of [['rgba(0,0,0,.55)', 4, []], ['#fff', 1.5, [5, 4]]]) {
    g.strokeStyle = style;
    g.lineWidth = width * state.dpr;
    g.setLineDash(dash.map(v => v * state.dpr));
    for (const [ex, ey] of edges) {
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(ex, ey);
      g.stroke();
    }
  }
  g.restore();

  g.save();
  g.strokeStyle = 'rgba(255,255,255,.9)';
  g.lineWidth = 2 * state.dpr;
  g.beginPath();
  g.arc(bx, by, R, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = '#1723d8';
  g.lineWidth = 1.5 * state.dpr;
  const tick = R * 0.28;
  g.beginPath();
  g.moveTo(bx - tick, by); g.lineTo(bx + tick, by);
  g.moveTo(bx, by - tick); g.lineTo(bx, by + tick);
  g.stroke();
  g.restore();
}

// image px per CSS px, measured rather than assumed: `max-width: 100%` can clamp
// the element narrower than its backing store.
function viewScale() {
  const r = els.stage.getBoundingClientRect();
  return r.width && state.img ? r.width / state.img.width : state.view;
}

function nearestCorner(x, y) {
  if (!state.quad) return -1;
  let best = -1, bd = (COARSE ? HIT_R_TOUCH : HIT_R_MOUSE) / viewScale();
  state.quad.forEach(([px, py], i) => {
    const d = Math.hypot(px - x, py - y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

function pos(e) { return posOf(e.clientX, e.clientY); }

function posOf(clientX, clientY) {
  const r = els.stage.getBoundingClientRect();
  const s = viewScale();
  return [(clientX - r.left) / s, (clientY - r.top) / s];
}

// touch-action is pan-y, so a swipe over the image scrolls the page; block the
// browser's gesture only for touches that actually land on a handle.
els.stage.addEventListener('touchstart', e => {
  if (!state.img || e.touches.length !== 1) return;
  const t = e.touches[0];
  const [x, y] = posOf(t.clientX, t.clientY);
  if (nearestCorner(x, y) >= 0) e.preventDefault();
}, { passive: false });

els.stage.addEventListener('pointerdown', e => {
  const [x, y] = pos(e);
  state.drag = nearestCorner(x, y);
  if (state.drag >= 0) {
    const [px, py] = state.quad[state.drag];
    state.grab = [px - x, py - y];
    state.touchDrag = e.pointerType !== 'mouse';
    els.stage.setPointerCapture(e.pointerId);
    els.stage.style.cursor = 'grabbing';
    els.hint.style.opacity = 0;
    setChip(state.drag);
    render();
  }
});
els.stage.addEventListener('pointermove', e => {
  if (state.drag < 0) {
    if (e.pointerType !== 'mouse') return;
    const [x, y] = pos(e);
    els.stage.style.cursor = nearestCorner(x, y) >= 0 ? 'grab' : 'default';
    return;
  }
  const [x, y] = pos(e);
  state.quad[state.drag] = [
    Math.max(0, Math.min(state.img.width, x + state.grab[0])),
    Math.max(0, Math.min(state.img.height, y + state.grab[1])),
  ];
  render();
});
const endDrag = () => {
  state.drag = -1;
  state.touchDrag = false;
  setChip(-1);
  els.stage.style.cursor = 'grab';
  render();
};
els.stage.addEventListener('pointerup', endDrag);
els.stage.addEventListener('pointercancel', endDrag);

function setChip(i) {
  els.chips.forEach((c, n) => c.classList.toggle('active', n === i));
}

/* ---------- control sheet (phones) ---------- */

if (els.sheetToggle) {
  els.sheetToggle.addEventListener('click', () => {
    const open = els.panel.classList.toggle('open');
    els.sheetToggle.setAttribute('aria-expanded', String(open));
    if (!open) els.panel.scrollTop = 0;
  });
}

/* ---------- sample scene ---------- */

function sampleScene() {
  const W = 1600, H = 1000;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#12233d');
  sky.addColorStop(0.45, '#40536f');
  sky.addColorStop(0.8, '#b58a63');
  sky.addColorStop(1, '#e0b183');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  const glow = g.createRadialGradient(W * 0.78, H * 0.72, 10, W * 0.78, H * 0.72, W * 0.5);
  glow.addColorStop(0, 'rgba(255,214,150,.85)');
  glow.addColorStop(1, 'rgba(255,214,150,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // skyline
  const rand = mulberry(7);
  const towers = [];
  for (let i = 0; i < 22; i++) {
    const w = 60 + rand() * 130;
    const x = -60 + i * 78 + rand() * 20;
    const h = 220 + rand() * 560;
    towers.push([x, H - h, w, h, 0.28 + rand() * 0.34]);
  }
  towers.sort((a, b) => a[4] - b[4]);
  for (const [x, y, w, h, dep] of towers) {
    g.fillStyle = `rgba(${18 + dep * 40},${20 + dep * 42},${28 + dep * 48},1)`;
    g.fillRect(x, y, w, h);
    g.fillStyle = `rgba(255,222,170,${0.10 + dep * 0.14})`;
    for (let wy = y + 16; wy < H - 12; wy += 26) {
      for (let wx = x + 10; wx < x + w - 12; wx += 20) {
        if (rand() > 0.42) g.fillRect(wx, wy, 8, 13);
      }
    }
  }

  // billboard: face + frame + posts, slight perspective
  const face = [[300, 210], [1180, 300], [1180, 745], [300, 690]];
  g.save();
  g.beginPath();
  face.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
  g.closePath();
  g.fillStyle = '#1a1c20';
  g.fill();
  g.lineWidth = 22;
  g.strokeStyle = '#2b2f36';
  g.stroke();
  g.lineWidth = 6;
  g.strokeStyle = '#494f59';
  g.stroke();
  g.restore();

  g.fillStyle = '#23262c';
  g.fillRect(430, 720, 46, 280);
  g.fillRect(980, 760, 46, 240);
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.fillRect(300, 690, 880, 26);

  // gantry lights
  for (const lx of [430, 700, 980]) {
    g.fillStyle = '#3a3f48';
    g.fillRect(lx - 8, 150, 16, 46);
    const l = g.createRadialGradient(lx, 200, 4, lx, 200, 190);
    l.addColorStop(0, 'rgba(255,240,205,.5)');
    l.addColorStop(1, 'rgba(255,240,205,0)');
    g.fillStyle = l;
    g.beginPath();
    g.arc(lx, 210, 190, 0, Math.PI * 2);
    g.fill();
  }

  const img = new Image();
  img.dataset.quad = JSON.stringify(face);
  img.src = c.toDataURL('image/png');
  return img;
}

function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------- image loading ---------- */

function useImage(img, quad) {
  const src = fit(img);
  const s = src.width / img.width;
  state.img = src;
  state.quad = quad
    ? quad.map(([x, y]) => [x * s, y * s])
    : defaultQuad(src.width, src.height);
  els.hint.style.opacity = 1;
  render();
}

function defaultQuad(w, h) {
  const mx = w * 0.16, my = h * 0.2;
  const skew = h * 0.035;
  return [[mx, my + skew], [w - mx, my], [w - mx, h - my], [mx, h - my - skew]];
}

// Downscale oversized photos: a 48MP phone shot makes the per-pixel warp crawl
// and can blow past the browser's canvas limits.
function fit(img) {
  const long = Math.max(img.width, img.height);
  if (long <= MAX_SRC) return img;
  const s = MAX_SRC / long;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function unsupported(f) {
  return /\.(heic|heif)$/i.test(f.name) || /^image\/hei[cf]/i.test(f.type);
}

function loadFile(f) {
  if (!f) return;

  if (unsupported(f)) {
    // A photo taken through the capture input comes back as JPEG, so “Take photo”
    // is the quickest way out of this on an iPhone.
    els.status.textContent = COARSE
      ? 'Browsers can\u2019t decode HEIC/HEIF. Use \u201cTake photo\u201d (that comes through as JPEG), or Settings \u203a Camera \u203a Formats \u203a Most Compatible.'
      : 'Browsers can\u2019t decode HEIC/HEIF. On iPhone: Settings \u203a Camera \u203a Formats \u203a Most Compatible, or export the photo as JPEG.';
    return;
  }
  if (f.type && !f.type.startsWith('image/')) {
    els.status.textContent = 'That file isn\u2019t an image \u2014 pick a JPEG, PNG or WebP.';
    return;
  }

  const url = URL.createObjectURL(f);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    useImage(img);
    els.status.textContent = 'Photo loaded \u2014 drag the four corners onto the board face.';
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    els.status.textContent =
      'Couldn\u2019t read \u201c' + f.name + '\u201d. Try a JPEG, PNG or WebP export of the photo.';
  };
  img.src = url;
  els.status.textContent = 'Loading photo\u2026';
}

[els.file, els.camera].forEach(input => {
  if (!input) return;
  input.addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';         // let the same file be picked again
    loadFile(f);
  });
});

// hand-measured corners of the blank face in sample-photo.jpg (1536x1024)
const PHOTO_QUAD = [[408, 54], [1120, 405], [1156, 941], [388, 715]];

els.photo.addEventListener('click', () => {
  const img = new Image();
  img.onload = () => useImage(img, PHOTO_QUAD.map(p => p.slice()));
  img.src = 'sample-photo.jpg';
});

els.sample.addEventListener('click', () => {
  const img = sampleScene();
  img.onload = () => useImage(img, JSON.parse(img.dataset.quad));
});

/* ---------- controls ---------- */

PRESETS.forEach(p => {
  const b = document.createElement('button');
  b.className = 'preset';
  b.textContent = p.replace('\n', ' ');
  b.onclick = () => { els.text.value = p; render(); };
  els.presets.appendChild(b);
});

THEMES.forEach(t => {
  const d = document.createElement('div');
  d.className = 'theme' + (t.id === state.theme ? ' active' : '');
  d.style.background = t.swatch;
  d.title = t.id;
  d.onclick = () => {
    state.theme = t.id;
    [...els.themes.children].forEach(n => n.classList.remove('active'));
    d.classList.add('active');
    render();
  };
  els.themes.appendChild(d);
});

['input', 'change'].forEach(ev => {
  [els.text, els.scale, els.blend, els.wordmark, els.guides].forEach(n =>
    n.addEventListener(ev, render));
});
// Mobile browsers fire resize while the URL bar collapses; a width-only change
// is the only one that needs a re-fit.
let resizeTimer = 0, lastW = window.innerWidth;
window.addEventListener('resize', () => {
  const heightOnly = window.innerWidth === lastW && !PHONE();
  lastW = window.innerWidth;
  if (heightOnly) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 120);
});

function canShareFile(file) {
  return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
}

function saveBlob(blob) {
  const url = URL.createObjectURL(blob);   // a multi-MB data: URL is unreliable on iOS
  const a = document.createElement('a');
  a.download = FILENAME;
  a.href = url;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function exportPng() {
  if (!state.img) return;
  els.download.disabled = true;
  els.status.textContent = 'Rendering at full resolution\u2026';
  // let the status paint before the synchronous warp blocks the main thread
  await new Promise(r => setTimeout(r, 60));

  try {
    const out = document.createElement('canvas');
    const guides = els.guides.checked;
    els.guides.checked = false;
    compose(out, 1);
    els.guides.checked = guides;

    const blob = await new Promise(res => out.toBlob(res, 'image/png'));
    if (!blob) throw new Error('encode failed');
    out.width = out.height = 0;              // release the full-res canvas

    const file = new File([blob], FILENAME, { type: 'image/png' });
    if (canShareFile(file)) {
      try {
        await navigator.share({ files: [file], text: CAPTION });
        els.status.textContent = 'Shared at full resolution.';
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') { els.status.textContent = 'Share cancelled.'; return; }
        // permission or unsupported target — fall back to a download
      }
    }
    saveBlob(blob);
    els.status.textContent = 'Saved at full resolution. Post it.';
  } catch {
    els.status.textContent = 'Export failed \u2014 the photo may be too large for this browser. Try a smaller one.';
  } finally {
    els.download.disabled = false;
  }
}

els.download.addEventListener('click', exportPng);

if (COARSE && navigator.canShare) {
  try {
    if (navigator.canShare({ files: [new File([new Blob()], FILENAME, { type: 'image/png' })] })) {
      els.download.textContent = 'Share image';
    }
  } catch { /* no file sharing here; keep “Download PNG” */ }
}

function refreshTweet() {
  els.tweet.href = 'https://twitter.com/intent/tweet?text=' +
    encodeURIComponent(CAPTION) + '&url=' + encodeURIComponent(SCOTT_POST);
}
refreshTweet();

els.copyText.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(CAPTION + '\n\n' + SCOTT_POST);
    els.status.textContent = 'Caption copied.';
  } catch {
    els.status.textContent = 'Copy blocked by the browser — select it manually.';
  }
});

els.photo.click();
