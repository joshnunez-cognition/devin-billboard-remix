/* Do It All With Devin — Billboard Remix
   Drag four corners onto a billboard face; your line is warped into it. */

const MAX_W = 1080;
const MAX_SRC = 4096;   // longest side of the working image; keeps the warp interactive

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
  dpr: 1,
  view: 1,             // image px -> canvas px
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

function draw() {
  if (!state.img) return;
  const c = els.stage;
  const wrapW = Math.min(c.parentElement.clientWidth - 2, MAX_W);
  state.view = Math.min(1, wrapW / state.img.width);
  compose(c, state.view);
  c.style.width = c.width + 'px';
  c.style.height = c.height + 'px';

  if (els.guides.checked) {
    const g = c.getContext('2d');
    const q = state.quad.map(([x, y]) => [x * state.view, y * state.view]);
    g.save();
    g.strokeStyle = 'rgba(255,255,255,.85)';
    g.setLineDash([6, 5]);
    g.lineWidth = 1.5;
    g.beginPath();
    q.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    g.closePath();
    g.stroke();
    g.setLineDash([]);
    q.forEach(([x, y], i) => {
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fillStyle = state.drag === i ? '#1723d8' : '#fff';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#0a0b0d';
      g.stroke();
    });
    g.restore();
  }
}

function nearestCorner(x, y) {
  let best = -1, bd = 18 / state.view;
  state.quad.forEach(([px, py], i) => {
    const d = Math.hypot(px - x, py - y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

function pos(e) {
  const r = els.stage.getBoundingClientRect();
  return [(e.clientX - r.left) / state.view, (e.clientY - r.top) / state.view];
}

els.stage.addEventListener('pointerdown', e => {
  const [x, y] = pos(e);
  state.drag = nearestCorner(x, y);
  if (state.drag >= 0) {
    els.stage.setPointerCapture(e.pointerId);
    els.stage.style.cursor = 'grabbing';
    els.hint.style.opacity = 0;
    setChip(state.drag);
    render();
  }
});
els.stage.addEventListener('pointermove', e => {
  if (state.drag < 0) {
    const [x, y] = pos(e);
    els.stage.style.cursor = nearestCorner(x, y) >= 0 ? 'grab' : 'default';
    return;
  }
  const [x, y] = pos(e);
  state.quad[state.drag] = [
    Math.max(0, Math.min(state.img.width, x)),
    Math.max(0, Math.min(state.img.height, y)),
  ];
  render();
});
const endDrag = () => { state.drag = -1; setChip(-1); els.stage.style.cursor = 'grab'; render(); };
els.stage.addEventListener('pointerup', endDrag);
els.stage.addEventListener('pointercancel', endDrag);

function setChip(i) {
  els.chips.forEach((c, n) => c.classList.toggle('active', n === i));
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

els.file.addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';           // let the same file be picked again
  if (!f) return;

  if (unsupported(f)) {
    els.status.textContent =
      'Browsers can\u2019t decode HEIC/HEIF. On iPhone: Settings \u203a Camera \u203a Formats \u203a Most Compatible, or export the photo as JPEG.';
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
window.addEventListener('resize', render);

els.download.addEventListener('click', () => {
  const out = document.createElement('canvas');
  const guides = els.guides.checked;
  els.guides.checked = false;
  compose(out, 1);
  els.guides.checked = guides;
  const a = document.createElement('a');
  a.download = 'do-it-all-with-devin.png';
  a.href = out.toDataURL('image/png');
  a.click();
  els.status.textContent = 'Saved at full resolution. Post it.';
});

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
