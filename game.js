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
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    updateHUD();
  } else {
    // la pieza bloqueó sin limpiar líneas: se corta el combo
    combo = 0;
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
  if (gameOver) return;
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  hsShowGameOver();
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
  hsBeginRun();
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

/* ---- Records (top 5 en localStorage) ---- */

const HS_KEY = 'tetris.highscores';
const HS_MAX = 5;
const HS_NAME_MAX = 12;
const HS_DEFAULT_NAME = 'Jugador';

const startOverlay = document.getElementById('start-overlay');
const startRecordsEl = document.getElementById('start-records');
const startBestComboEl = document.getElementById('start-best-combo');
const startBestLinesEl = document.getElementById('start-best-lines');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const goRecordsEl = document.getElementById('go-records');
const goRecordsTableEl = document.getElementById('go-records-table');
const goBestComboEl = document.getElementById('go-best-combo');
const goBestLinesEl = document.getElementById('go-best-lines');
const goSummaryEl = document.getElementById('go-summary');
const newRecordMsg = document.getElementById('new-record-msg');
const saveRow = document.getElementById('save-row');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const menuBtn = document.getElementById('menu-btn');

let combo = 0;
let maxCombo = 0;
let scoreSaved = false;
let resetArmed = false;
let lastRun = null;

function hsInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function hsCleanName(value) {
  const raw = typeof value === 'string' ? value : '';
  return raw.trim().slice(0, HS_NAME_MAX) || HS_DEFAULT_NAME;
}

function hsLoad() {
  let raw;
  try {
    raw = localStorage.getItem(HS_KEY);
  } catch (e) {
    return [];
  }
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const list = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const entryScore = hsInt(item.score);
    if (entryScore <= 0) continue;
    list.push({
      name: hsCleanName(item.name),
      score: entryScore,
      lines: hsInt(item.lines),
      combo: hsInt(item.combo),
      date: typeof item.date === 'string' ? item.date.slice(0, 10) : '',
    });
  }
  list.sort((a, b) => b.score - a.score);
  return list.slice(0, HS_MAX);
}

function hsStore(list) {
  try {
    localStorage.setItem(HS_KEY, JSON.stringify(list));
  } catch (e) {
    /* almacenamiento no disponible: los records no persisten */
  }
}

function hsQualifies(value) {
  const sc = hsInt(value);
  if (sc <= 0) return false;
  const list = hsLoad();
  return list.length < HS_MAX || sc > list[list.length - 1].score;
}

function hsRenderTable(container, list, highlight) {
  container.textContent = '';
  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'hs-empty';
    empty.textContent = 'Sin records todavía';
    container.appendChild(empty);
    return;
  }
  const head = document.createElement('div');
  head.className = 'hs-row hs-head';
  for (const text of ['#', 'NOMBRE', 'PUNTOS', 'LÍN.', 'COMBO']) {
    const cell = document.createElement('span');
    cell.textContent = text;
    head.appendChild(cell);
  }
  container.appendChild(head);
  list.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = i === highlight ? 'hs-row hs-highlight' : 'hs-row';
    if (entry.date) row.title = `Fecha: ${entry.date}`;
    const cells = [
      String(i + 1),
      entry.name,
      entry.score.toLocaleString(),
      String(entry.lines),
      String(entry.combo),
    ];
    for (const text of cells) {
      const cell = document.createElement('span');
      cell.textContent = text;
      row.appendChild(cell);
    }
    container.appendChild(row);
  });
}

function hsRenderAll(highlight) {
  const list = hsLoad();
  let bestCombo = 0;
  let bestLines = 0;
  for (const entry of list) {
    if (entry.combo > bestCombo) bestCombo = entry.combo;
    if (entry.lines > bestLines) bestLines = entry.lines;
  }
  const idx = typeof highlight === 'number' ? highlight : -1;
  hsRenderTable(startRecordsEl, list, -1);
  hsRenderTable(goRecordsTableEl, list, idx);
  startBestComboEl.textContent = String(bestCombo);
  startBestLinesEl.textContent = String(bestLines);
  goBestComboEl.textContent = String(bestCombo);
  goBestLinesEl.textContent = String(bestLines);
}

function hsSaveCurrent() {
  if (scoreSaved || !lastRun) return;
  scoreSaved = true;
  nameInput.disabled = true;
  saveScoreBtn.disabled = true;
  const entry = {
    name: hsCleanName(nameInput.value),
    score: lastRun.score,
    lines: lastRun.lines,
    combo: lastRun.combo,
    date: new Date().toISOString().slice(0, 10),
  };
  const list = hsLoad();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, HS_MAX);
  const idx = top.indexOf(entry);
  if (idx >= 0) hsStore(top);
  hsRenderAll(idx);
  newRecordMsg.textContent = idx >= 0
    ? `¡Guardado! Puesto #${idx + 1}`
    : 'No entró en el top 5';
}

function hsBeginRun() {
  combo = 0;
  maxCombo = 0;
  scoreSaved = false;
  lastRun = null;
  hsDisarmReset();
  startOverlay.classList.add('hidden');
  goRecordsEl.classList.add('hidden');
  saveRow.classList.add('hidden');
  newRecordMsg.classList.add('hidden');
}

function hsShowGameOver() {
  // se congela el resultado de la partida: lo guardado no depende de lo que
  // pase después en pantalla.
  lastRun = { score: hsInt(score), lines: hsInt(lines), combo: hsInt(maxCombo) };
  const qualifies = hsQualifies(lastRun.score);
  scoreSaved = false;
  nameInput.disabled = false;
  saveScoreBtn.disabled = false;
  nameInput.value = HS_DEFAULT_NAME;
  newRecordMsg.textContent = '¡Nuevo record!';
  goSummaryEl.textContent = `Líneas: ${lastRun.lines} · Combo máx: ${lastRun.combo}`;
  saveRow.classList.toggle('hidden', !qualifies);
  newRecordMsg.classList.toggle('hidden', !qualifies);
  goRecordsEl.classList.remove('hidden');
  hsRenderAll(-1);
}

function hsShowStart() {
  hsDisarmReset();
  overlay.classList.add('hidden');
  goRecordsEl.classList.add('hidden');
  hsRenderAll(-1);
  startOverlay.classList.remove('hidden');
}

function hsDisarmReset() {
  resetArmed = false;
  resetRecordsBtn.textContent = 'Resetear records';
  resetRecordsBtn.classList.remove('hs-armed');
}

saveScoreBtn.addEventListener('click', hsSaveCurrent);

menuBtn.addEventListener('click', hsShowStart);

nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    hsSaveCurrent();
  }
});

playBtn.addEventListener('click', init);

resetRecordsBtn.addEventListener('click', () => {
  if (!resetArmed) {
    resetArmed = true;
    resetRecordsBtn.textContent = '¿Seguro?';
    resetRecordsBtn.classList.add('hs-armed');
    return;
  }
  hsDisarmReset();
  hsStore([]);
  hsRenderAll(-1);
});

// El juego arranca desde la pantalla de inicio: gameOver bloquea los controles
// hasta que se pulsa «Jugar».
gameOver = true;
hsRenderAll(-1);
