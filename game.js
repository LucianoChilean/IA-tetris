'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

/* ---- Skins / temas visuales ---- */

const SKIN_STORAGE_KEY = 'tetris.skin';
const DEFAULT_SKIN = 'retro';

// Aclara (amount > 0) u oscurece (amount < 0) un color '#rrggbb'.
function shadeHex(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amount >= 0) {
    r += (255 - r) * amount;
    g += (255 - g) * amount;
    b += (255 - b) * amount;
  } else {
    r *= 1 + amount;
    g *= 1 + amount;
    b *= 1 + amount;
  }
  const hx = v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return '#' + hx(r) + hx(g) + hx(b);
}

// --- Retro: exactamente el aspecto original (cuadrados planos) ---
function drawBlockRetro(context, x, y, colorIndex, size, alpha, colors) {
  context.globalAlpha = alpha;
  context.fillStyle = colors[colorIndex];
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

// --- Neon: tubo de neón con glow ---
function drawBlockNeon(context, x, y, colorIndex, size, alpha, colors) {
  const color = colors[colorIndex];
  const px = x * size + 2;
  const py = y * size + 2;
  const s = size - 4;
  context.globalAlpha = alpha;
  context.shadowColor = color;
  context.shadowBlur = Math.max(6, size * 0.4);
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  // núcleo oscuro para que se lea como un tubo hueco
  context.fillStyle = 'rgba(5, 5, 12, 0.6)';
  context.fillRect(px + 3, py + 3, s - 6, s - 6);
  context.globalAlpha = 1;
}

// --- Pastel: paleta suave con esquinas redondeadas ---
function drawBlockPastel(context, x, y, colorIndex, size, alpha, colors) {
  const px = x * size + 1.5;
  const py = y * size + 1.5;
  const s = size - 3;
  const radius = Math.max(2, s * 0.24);
  const rounded = typeof context.roundRect === 'function';
  context.globalAlpha = alpha;
  context.fillStyle = colors[colorIndex];
  if (rounded) {
    context.beginPath();
    context.roundRect(px, py, s, s, radius);
    context.fill();
  } else {
    context.fillRect(px, py, s, s);
  }
  // brillo superior suave
  const hx = px + s * 0.18;
  const hy = py + s * 0.16;
  const hw = s * 0.64;
  const hh = Math.max(2, s * 0.15);
  context.fillStyle = 'rgba(255,255,255,0.55)';
  if (rounded) {
    context.beginPath();
    context.roundRect(hx, hy, hw, hh, hh / 2);
    context.fill();
  } else {
    context.fillRect(hx, hy, hw, hh);
  }
  context.globalAlpha = 1;
}

// --- Pixel art: textura de dither cacheada como patrón ---
const pixelTiles = [];
const pixelPatterns = new WeakMap();

function pixelTile(colorIndex, colors) {
  let tile = pixelTiles[colorIndex];
  if (tile) return tile;
  const base = colors[colorIndex];
  tile = document.createElement('canvas');
  tile.width = 6;
  tile.height = 6;
  const tc = tile.getContext('2d');
  tc.fillStyle = base;
  tc.fillRect(0, 0, 6, 6);
  tc.fillStyle = shadeHex(base, 0.22);
  tc.fillRect(0, 0, 3, 3);
  tc.fillStyle = shadeHex(base, -0.22);
  tc.fillRect(3, 3, 3, 3);
  pixelTiles[colorIndex] = tile;
  return tile;
}

function pixelPattern(context, colorIndex, colors) {
  let cache = pixelPatterns.get(context);
  if (!cache) {
    cache = [];
    pixelPatterns.set(context, cache);
  }
  if (!cache[colorIndex]) {
    cache[colorIndex] = context.createPattern(pixelTile(colorIndex, colors), 'repeat');
  }
  return cache[colorIndex];
}

function drawBlockPixel(context, x, y, colorIndex, size, alpha, colors) {
  const base = colors[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  context.globalAlpha = alpha;
  const pattern = pixelPattern(context, colorIndex, colors);
  context.fillStyle = pattern || base;
  context.fillRect(px, py, s, s);
  // borde oscuro + luces de 3px estilo sprite
  context.fillStyle = shadeHex(base, -0.5);
  context.fillRect(px, py, s, 3);
  context.fillRect(px, py, 3, s);
  context.fillStyle = shadeHex(base, 0.45);
  context.fillRect(px + 3, py + 3, s - 6, 3);
  context.fillRect(px + 3, py + 3, 3, s - 6);
  context.fillStyle = shadeHex(base, -0.35);
  context.fillRect(px, py + s - 3, s, 3);
  context.fillRect(px + s - 3, py, 3, s);
  context.globalAlpha = 1;
}

const THEMES = {
  retro: {
    label: 'Retro',
    colors: COLORS,
    grid: '#22222e',
    bg: '#1a1a25',
    drawBlock: drawBlockRetro,
  },
  neon: {
    label: 'Neón',
    colors: [
      null,
      '#00e5ff', // I
      '#ffe600', // O
      '#d500f9', // T
      '#00ff85', // S
      '#ff1e56', // Z
      '#3d5afe', // J
      '#ff9100', // L
    ],
    grid: '#16163a',
    bg: '#05050c',
    drawBlock: drawBlockNeon,
  },
  pastel: {
    label: 'Pastel',
    colors: [
      null,
      '#9fd8dd', // I
      '#f7e3a1', // O
      '#d3b8ea', // T
      '#b3e2c2', // S
      '#f4b8b8', // Z
      '#b6c4ef', // J
      '#f7cba4', // L
    ],
    grid: '#e6ded3',
    bg: '#faf6f0',
    drawBlock: drawBlockPastel,
  },
  pixel: {
    label: 'Pixel art',
    colors: [
      null,
      '#00b8d4', // I
      '#ffc400', // O
      '#9c27b0', // T
      '#00c853', // S
      '#e53935', // Z
      '#2962ff', // J
      '#ff6d00', // L
    ],
    grid: '#262633',
    bg: '#12121c',
    drawBlock: drawBlockPixel,
  },
};

let currentSkin = DEFAULT_SKIN;

function isKnownSkin(name) {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(THEMES, name);
}

function activeTheme() {
  return THEMES[currentSkin] || THEMES[DEFAULT_SKIN];
}

function readStoredSkin() {
  try {
    const stored = localStorage.getItem(SKIN_STORAGE_KEY);
    if (isKnownSkin(stored)) return stored;
  } catch (e) {
    /* localStorage no disponible (modo privado / deshabilitado) */
  }
  return DEFAULT_SKIN;
}

function storeSkin(name) {
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, name);
  } catch (e) {
    /* sin persistencia: el tema sigue aplicándose en esta sesión */
  }
}

function redrawSkin() {
  if (!board || !current) return;
  draw();
  if (next) drawNext();
}

function applySkin(name) {
  currentSkin = isKnownSkin(name) ? name : DEFAULT_SKIN;
  const theme = THEMES[currentSkin];
  document.body.dataset.theme = currentSkin;
  canvas.style.background = theme.bg;
  nextCanvas.style.background = theme.bg;
  redrawSkin();
}

const skinSelect = document.getElementById('skin-select');
if (skinSelect) {
  skinSelect.addEventListener('change', () => {
    applySkin(skinSelect.value);
    storeSkin(currentSkin);
    skinSelect.value = currentSkin;
  });
}

applySkin(readStoredSkin());
if (skinSelect) skinSelect.value = currentSkin;

/* ---- Fin skins ---- */

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const theme = activeTheme();
  theme.drawBlock(context, x, y, colorIndex, size, alpha ?? 1, theme.colors);
}

function drawGrid() {
  ctx.strokeStyle = activeTheme().grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

init();
