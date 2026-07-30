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
  '#64b5f6', // J - pale blue
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

// ---- Menú de pausa ----
const MIN_START_LEVEL = 1;
const MAX_START_LEVEL = 15;
const START_LEVEL_KEY = 'tetris.startLevel';
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];

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

// ---- Menú de pausa ----
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

// startLevel: nivel con el que arrancó la partida en curso.
// preferredStartLevel: preferencia para la próxima partida; también sirve de
// respaldo en memoria cuando localStorage no está disponible.
let startLevel = MIN_START_LEVEL;
let preferredStartLevel = MIN_START_LEVEL;

function speedForLevel(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function clampStartLevel(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return MIN_START_LEVEL;
  return Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, n));
}

function loadStartLevel() {
  try {
    const raw = localStorage.getItem(START_LEVEL_KEY);
    if (raw !== null) return clampStartLevel(raw);
  } catch (err) {
    // Almacenamiento no disponible (modo privado): se usa el respaldo.
  }
  return preferredStartLevel;
}

function saveStartLevel(lvl) {
  preferredStartLevel = lvl;
  try {
    localStorage.setItem(START_LEVEL_KEY, String(lvl));
  } catch (err) {
    // Almacenamiento no disponible (modo privado): queda sólo en memoria.
  }
}

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
    level = startLevel + Math.floor(lines / 10);
    dropInterval = speedForLevel(level);
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = '#22222e';
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

function isPauseMenuOpen() {
  return !pauseOverlay.classList.contains('hidden');
}

function collapsePauseControls() {
  pauseControls.classList.add('is-collapsed');
  controlsBtn.setAttribute('aria-expanded', 'false');
  controlsBtn.textContent = 'Ver controles';
}

function hidePauseMenu() {
  // Sin foco dentro del menú, Enter/Space no pueden re-activar un botón
  // una vez que el juego se reanuda.
  const focused = document.activeElement;
  if (focused && pauseOverlay.contains(focused) && typeof focused.blur === 'function') {
    focused.blur();
  }
  pauseOverlay.classList.add('hidden');
  collapsePauseControls();
}

function openPauseMenu() {
  paused = true;
  cancelAnimationFrame(animId);
  syncStartLevelSelect();
  pauseOverlay.classList.remove('hidden');
}

function closePauseMenu() {
  hidePauseMenu();
  paused = false;
  // Evita encadenar dos bucles de animación al reanudar.
  cancelAnimationFrame(animId);
  // Sólo se reinicia lastTime: el tiempo en pausa no cuenta y dropAccum se
  // conserva, así pausar repetidamente no regala tiempo de caída.
  lastTime = performance.now();
  loop(lastTime);
}

function togglePause() {
  if (gameOver) return;
  if (isPauseMenuOpen()) closePauseMenu();
  else openPauseMenu();
}

function buildStartLevelOptions() {
  for (let i = MIN_START_LEVEL; i <= MAX_START_LEVEL; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = String(i);
    startLevelSelect.appendChild(opt);
  }
}

// El selector refleja la preferencia guardada (la de la próxima partida),
// no necesariamente el nivel con el que arrancó la partida en curso.
function syncStartLevelSelect() {
  startLevelSelect.value = String(loadStartLevel());
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
  startLevel = loadStartLevel();
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = speedForLevel(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  hidePauseMenu();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function isFormControl(el) {
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'select' || tag === 'input' || tag === 'textarea';
}

// Botones y controles de formulario usan Enter/Space/flechas/Escape para su
// propio comportamiento nativo; ahí no interceptamos la tecla.
function isMenuWidget(el) {
  if (isFormControl(el)) return true;
  return !!el && typeof el.tagName === 'string' && el.tagName.toLowerCase() === 'button';
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    // Con el selector enfocado, Escape cierra su desplegable y P hace
    // búsqueda por teclado: no robamos la tecla.
    if (!isFormControl(e.target)) {
      e.preventDefault();
      togglePause();
      return;
    }
  }
  // Con el menú abierto el juego no recibe input: ni movimiento de pieza, ni
  // scroll de la página.
  if (isPauseMenuOpen()) {
    if (GAME_KEYS.indexOf(e.code) !== -1 && !isMenuWidget(e.target)) e.preventDefault();
    return;
  }
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

// ---- Menú de pausa: cableado ----
buildStartLevelOptions();
preferredStartLevel = loadStartLevel();
syncStartLevelSelect();

startLevelSelect.addEventListener('change', () => {
  const lvl = clampStartLevel(startLevelSelect.value);
  startLevelSelect.value = String(lvl);
  saveStartLevel(lvl);
});

resumeBtn.addEventListener('click', () => {
  // blur() para que Enter/Space no vuelvan a activar el botón ya reanudado.
  resumeBtn.blur();
  closePauseMenu();
});

pauseRestartBtn.addEventListener('click', () => {
  pauseRestartBtn.blur();
  init();
});

controlsBtn.addEventListener('click', () => {
  const expanded = !pauseControls.classList.toggle('is-collapsed');
  controlsBtn.setAttribute('aria-expanded', String(expanded));
  controlsBtn.textContent = expanded ? 'Ocultar controles' : 'Ver controles';
});

init();
