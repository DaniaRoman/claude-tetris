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

let board, faces, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

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
      faces.splice(r, 1);
      faces.unshift(new Array(COLS).fill(null));
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

function drawBlock(context, x, y, colorIndex, size, alpha, faceRot) {
  if (!colorIndex) return;
  const px = x * size, py = y * size;
  context.save();
  if (alpha) {
    // fantasma: contorno punteado de la pieza
    context.globalAlpha = alpha;
    context.setLineDash([4, 3]);
    context.strokeStyle = BORDERS[colorIndex];
    context.lineWidth = 1.5;
    context.strokeRect(px + 2, py + 2, size - 4, size - 4);
    context.restore();
    return;
  }
  // recorte de papel con sombra suave
  context.shadowColor = 'rgba(60, 70, 110, 0.25)';
  context.shadowBlur = 3;
  context.shadowOffsetY = 1;
  context.fillStyle = COLORS[colorIndex];
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  context.shadowColor = 'transparent';
  context.strokeStyle = BORDERS[colorIndex];
  context.lineWidth = 1.5;
  context.strokeRect(px + 1.75, py + 1.75, size - 3.5, size - 3.5);
  // textura de papel: línea de luz
  context.fillStyle = 'rgba(255,255,255,0.25)';
  context.fillRect(px + 3, py + 3, size - 6, 2);
  context.restore();
  if (faceRot != null) drawFace(context, x, y, size, faceRot);
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

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK, null, faces[r][c]);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.5);

  // current piece
  const f = faceCell(current.shape);
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK, null,
        r === f.r && c === f.c ? current.rot : null);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  const f = faceCell(shape);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB, null,
        r === f.r && c === f.c ? 0 : null);
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
