'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Estilo "recortes de papel": relleno pastel + borde más oscuro
const COLORS = [
  null,
  '#ffef7a', // I - amarillo
  '#ff93b8', // O - rosa
  '#ffc38a', // T - naranja
  '#5ec9d6', // S - turquesa
  '#4fa8f0', // Z - azul
  '#9aa0f0', // J - lila
  '#f3f58a', // L - amarillo lima
];
const BORDERS = [
  null,
  '#e2cf4a',
  '#ee6a98',
  '#f0a35c',
  '#2fa8b8',
  '#2b86d6',
  '#7379d8',
  '#9ccc65',
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
const resumeBtn = document.getElementById('resume-btn');

let board, pids, nextPid, faces, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

// Celda de la pieza (la más cercana al centro) donde se dibuja la carita
function faceCell(shape) {
  let sx = 0, sy = 0, n = 0;
  shape.forEach((row, r) => row.forEach((v, c) => { if (v) { sx += c; sy += r; n++; } }));
  sx /= n; sy /= n;
  let best = null, bd = Infinity;
  shape.forEach((row, r) => row.forEach((v, c) => {
    if (!v) return;
    const d = (c - sx) ** 2 + (r - sy) ** 2;
    if (d < bd) { bd = d; best = { r, c }; }
  }));
  return best;
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, rot: 0, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
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
      current.rot = (current.rot + 1) % 4;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  const f = faceCell(current.shape);
  faces[current.y + f.r][current.x + f.c] = current.rot;
  const id = nextPid++;
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c]) {
        board[current.y + r][current.x + c] = current.shape[r][c];
        pids[current.y + r][current.x + c] = id;
      }
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      faces.splice(r, 1);
      faces.unshift(new Array(COLS).fill(null));
      pids.splice(r, 1);
      pids.unshift(new Array(COLS).fill(0));
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

function drawFace(context, x, y, size, rot) {
  context.save();
  context.translate(x * size + size / 2, y * size + size / 2);
  context.rotate(rot * Math.PI / 2);
  context.fillStyle = '#3a3a48';
  context.strokeStyle = '#3a3a48';
  context.lineWidth = 1.6;
  context.lineCap = 'round';
  const e = size * 0.17;
  context.beginPath();
  context.arc(-e, -size * 0.04, size * 0.045, 0, Math.PI * 2);
  context.arc(e, -size * 0.04, size * 0.045, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(0, size * 0.04, size * 0.09, 0.15 * Math.PI, 0.85 * Math.PI);
  context.stroke();
  context.restore();
}

// Pseudo-aleatorio estable por celda, en el rango [-1, 1]
function jitter(x, y, k) {
  const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

// Textura de fibra de papel (se genera una sola vez)
let paperPattern = null;
function getPaperPattern(context) {
  if (paperPattern) return paperPattern;
  const t = document.createElement('canvas');
  t.width = t.height = 96;
  const g = t.getContext('2d');
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 96, y = Math.random() * 96;
    const a = Math.random() * Math.PI, l = 2 + Math.random() * 6;
    g.strokeStyle = Math.random() < 0.5
      ? 'rgba(255,255,255,0.55)' : 'rgba(110,90,70,0.16)';
    g.lineWidth = 0.5 + Math.random() * 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  paperPattern = context.createPattern(t, 'repeat');
  return paperPattern;
}

function ghostBlock(context, x, y, colorIndex, size) {
  context.save();
  context.globalAlpha = 0.5;
  context.setLineDash([4, 3]);
  context.strokeStyle = BORDERS[colorIndex];
  context.lineWidth = 1.5;
  context.beginPath();
  context.roundRect(x * size + 2, y * size + 2, size - 4, size - 4, size * 0.22);
  context.stroke();
  context.restore();
}

// Dibuja UNA pieza completa como un recorte de cartulina: silueta unida,
// bordes exteriores redondeados, sombra propia, fibra de papel y
// líneas de unión entre celdas. `cells` = [{x, y}] en unidades de celda.
function drawPiece(context, cells, colorIndex, size, pid, lift, face) {
  const set = new Set(cells.map(c => c.x + ',' + c.y));
  const has = (x, y) => set.has(x + ',' + y);
  const rad = size * 0.24, ins = 1.8;

  const outline = new Path2D();
  const inner = new Path2D();
  for (const { x, y } of cells) {
    const L = has(x - 1, y), R = has(x + 1, y), T = has(x, y - 1), B = has(x, y + 1);
    const px = x * size, py = y * size;
    // esquinas: tl, tr, br, bl; solo se redondea la que no toca otra celda
    const radii = (k) => [
      !(L || T) ? k : 0, !(R || T) ? k : 0, !(R || B) ? k : 0, !(L || B) ? k : 0,
    ];
    outline.roundRect(px, py, size, size, radii(rad));
    const x0 = px + (L ? 0 : ins), x1 = px + size - (R ? 0 : ins);
    const y0 = py + (T ? 0 : ins), y1 = py + size - (B ? 0 : ins);
    inner.roundRect(x0, y0, x1 - x0, y1 - y0, radii(Math.max(0, rad - ins)));
  }

  // pequeño desfase y giro por pieza => hojas encimadas, no alineadas
  let cx = 0, cy = 0;
  cells.forEach(c => { cx += c.x + 0.5; cy += c.y + 0.5; });
  cx = (cx / cells.length) * size; cy = (cy / cells.length) * size;
  const jx = pid ? jitter(pid, 1, 1) : 0;
  const jy = pid ? jitter(pid, 2, 2) : 0;
  const jr = pid ? jitter(pid, 3, 3) : 0;

  context.save();
  context.translate(cx + jx * size * 0.05, cy + jy * size * 0.05);
  context.rotate(jr * 0.025);
  context.translate(-cx, -cy);

  // 1) borde de papel + sombra de la pieza completa (una sola vez)
  context.shadowColor = 'rgba(40, 50, 90, 0.38)';
  context.shadowBlur = 5 * lift;
  context.shadowOffsetX = 1.5 * lift;
  context.shadowOffsetY = 3 * lift;
  context.fillStyle = BORDERS[colorIndex];
  context.fill(outline);
  context.shadowColor = 'transparent';

  // 2) cara de la cartulina
  context.fillStyle = COLORS[colorIndex];
  context.fill(inner);

  context.save();
  context.clip(inner);
  // luz lateral suave
  const minX = Math.min(...cells.map(c => c.x)) * size;
  const maxX = (Math.max(...cells.map(c => c.x)) + 1) * size;
  const grad = context.createLinearGradient(minX, 0, maxX, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0.07)');
  context.fillStyle = grad;
  context.fillRect(minX - size, 0, maxX - minX + 2 * size, 4000);
  // fibra de papel
  context.globalAlpha = 0.65;
  context.fillStyle = getPaperPattern(context);
  context.fillRect(minX - size, 0, maxX - minX + 2 * size, 4000);
  context.globalAlpha = 1;
  // costuras entre celdas de la misma pieza
  context.strokeStyle = 'rgba(255,255,255,0.5)';
  context.lineWidth = 1.2;
  for (const { x, y } of cells) {
    if (has(x + 1, y)) {
      context.beginPath();
      context.moveTo((x + 1) * size, y * size);
      context.lineTo((x + 1) * size, (y + 1) * size);
      context.stroke();
    }
    if (has(x, y + 1)) {
      context.beginPath();
      context.moveTo(x * size, (y + 1) * size);
      context.lineTo((x + 1) * size, (y + 1) * size);
      context.stroke();
    }
  }
  context.restore();

  if (face) drawFace(context, face.x, face.y, size, face.rot);
  context.restore();
}

function drawGrid() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#c3cde6';
  ctx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK + 0.5, 0);
    ctx.lineTo(c * BLOCK + 0.5, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK + 0.5);
    ctx.lineTo(COLS * BLOCK, r * BLOCK + 0.5);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // tablero: una pieza (cartulina) por id, las más viejas debajo
  const groups = new Map();
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const id = pids[r][c];
      if (!id) continue;
      if (!groups.has(id)) groups.set(id, { type: board[r][c], cells: [], face: null });
      const g = groups.get(id);
      g.cells.push({ x: c, y: r });
      if (faces[r][c] != null) g.face = { x: c, y: r, rot: faces[r][c] };
    }
  [...groups.entries()].sort((a, b) => a[0] - b[0])
    .forEach(([id, g]) => drawPiece(ctx, g.cells, g.type, BLOCK, id, 1, g.face));

  // fantasma
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        ghostBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK);

  // pieza actual: levantada, encima de todo
  const f = faceCell(current.shape);
  const cells = [];
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c]) cells.push({ x: current.x + c, y: current.y + r });
  drawPiece(ctx, cells, current.type, BLOCK, 0, 1.8,
    { x: current.x + f.c, y: current.y + f.r, rot: current.rot });
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  const f = faceCell(shape);
  const cells = [];
  shape.forEach((row, r) => row.forEach((v, c) => { if (v) cells.push({ x: offX + c, y: offY + r }); }));
  drawPiece(nextCtx, cells, next.type, NB, 0, 1.4, { x: offX + f.c, y: offY + f.r, rot: 0 });
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  resumeBtn.classList.add('hidden');
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    resumeBtn.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    resumeBtn.classList.remove('hidden');
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
  faces = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  pids = createBoard();
  nextPid = 1;
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
  resumeBtn.classList.add('hidden');
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

resumeBtn.addEventListener('click', () => {
  resumeBtn.blur();
  if (paused) togglePause();
});

restartBtn.addEventListener('click', () => {
  restartBtn.blur();
  init();
});

init();
