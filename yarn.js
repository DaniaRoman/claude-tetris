'use strict';

// Fondo animado: bolas de estambre "tejen" sobre la hoja punteada.
// Un grupo traza rombos (diagonales cruzadas) y el otro cuadrados
// (horizontales + verticales). El hilo queda cosido detrás de cada bola;
// al terminar, la trama se desvanece y empieza el otro patrón.
// Decorativo: no afecta al juego.
(function () {
  const cv = document.getElementById('yarn-bg');
  const g = cv.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const DOT = 30;          // separación de los puntos del papel (ver style.css)
  const MARGIN = 60;       // los giros ocurren fuera de pantalla
  const HOLD = 2500;       // ms con la trama terminada
  const FADE = 2000;       // ms de desvanecimiento

  const SPECS = [
    { r: 26, c: '#ff93b8', dk: '#ee6a98', kind: 'diagA', speed: 420, group: 0 },
    { r: 24, c: '#5ec9d6', dk: '#2fa8b8', kind: 'diagB', speed: 420, group: 0 },
    { r: 26, c: '#f4c93a', dk: '#d9a91f', kind: 'horiz', speed: 380, group: 1 },
    { r: 24, c: '#9aa0f0', dk: '#7379d8', kind: 'vert',  speed: 380, group: 1 },
  ];

  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Recorrido en zigzag: cada línea se recorre de punta a punta y el giro
  // al siguiente carril ocurre fuera de pantalla (boustrófedon continuo).
  function buildPath(kind, step, shift) {
    const m = MARGIN, pts = [];
    let flip = false;
    const push = (a, b) => { const [p, q] = flip ? [b, a] : [a, b]; pts.push(p, q); flip = !flip; };
    if (kind === 'horiz') {
      for (let y = DOT / 2 + shift; y < H + m; y += step) push({ x: -m, y }, { x: W + m, y });
    } else if (kind === 'vert') {
      for (let x = DOT / 2 + shift; x < W + m; x += step) push({ x, y: -m }, { x, y: H + m });
    } else if (kind === 'diagA') {            // "\" : x - y = k
      for (let k = -H - m + shift; k < W + m; k += step) push({ x: k - m, y: -m }, { x: k + H + m, y: H + m });
    } else {                                   // "/" : x + y = k
      for (let k = DOT + shift; k < W + H + 2 * m; k += step) push({ x: k + m, y: -m }, { x: k - H - m, y: H + m });
    }
    // longitudes acumuladas
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return { pts, cum, len: cum[cum.length - 1] };
  }

  function makeBall(s) {
    const strands = Array.from({ length: 30 }, () => ({
      tilt: Math.random() * Math.PI, spin: 0.6 + Math.random() * 0.6,
      ratio: 0.25 + Math.random() * 0.75, off: (Math.random() - 0.5) * s.r * 0.5,
      rad: 0.95 + Math.random() * 0.35, a0: Math.random() * Math.PI * 2,
      len: Math.PI * (0.7 + Math.random() * 1.1), w: 1.4 + Math.random() * 1.4,
      col: Math.random() < 0.45 ? 0 : Math.random() < 0.75 ? 1 : 2,
    }));
    const fuzz = Array.from({ length: 40 }, () => ({
      a: Math.random() * Math.PI * 2, l: 2 + Math.random() * 3, t: (Math.random() - 0.5) * 0.12,
    }));
    return { ...s, strands, fuzz, rot: 0, d: 0, path: null };
  }

  const balls = SPECS.map(makeBall);
  let group = 0, phase = 'weave', phaseStart = 0, alpha = 1;

  let shift = 0;
  function layout(keepProgress) {
    balls.forEach(b => {
      if (b.group !== group) return;
      const step = (b.kind === 'horiz' || b.kind === 'vert') ? DOT * 6 : DOT * 5;
      const frac = keepProgress && b.path ? b.d / b.path.len : 0;
      b.path = buildPath(b.kind, step, shift);
      b.d = frac * b.path.len;
    });
  }
  function startGroup(now) {
    // el desfase de la trama cambia en cada vuelta
    shift = Math.floor(Math.random() * 4) * DOT;
    layout(false);
    phase = 'weave'; phaseStart = now; alpha = 1;
  }

  function pointAt(path, d) {
    const { pts, cum } = path;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const f = Math.min(1, Math.max(0, (d - cum[i - 1]) / seg));
    return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f, i };
  }

  // Hilo torcido de lana, hasta la distancia d recorrida
  function drawThread(b) {
    if (!b.path || b.d <= 0) return;
    const head = pointAt(b.path, b.d);
    const path = () => {
      g.beginPath();
      g.moveTo(b.path.pts[0].x, b.path.pts[0].y);
      for (let i = 1; i < head.i; i++) g.lineTo(b.path.pts[i].x, b.path.pts[i].y);
      g.lineTo(head.x, head.y);
    };
    g.save();
    g.globalAlpha = alpha;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = 'rgba(80, 70, 50, 0.35)'; g.shadowBlur = 5; g.shadowOffsetY = 3;
    path(); g.strokeStyle = b.dk; g.lineWidth = 7; g.stroke();   // contorno
    g.shadowColor = 'transparent';
    path(); g.strokeStyle = b.c; g.lineWidth = 5; g.stroke();               // lana
    path(); g.strokeStyle = b.dk; g.lineWidth = 5;                          // torsión
    g.setLineDash([1.5, 4.5]); g.stroke(); g.setLineDash([]);
    path(); g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.3; g.stroke();
    g.restore();
  }

  function drawBall(b) {
    if (!b.path || b.d <= 0 || b.d >= b.path.len) return;
    const p = pointAt(b.path, b.d);
    g.save();
    g.globalAlpha = alpha;
    g.translate(p.x, p.y);
    g.shadowColor = 'rgba(80, 70, 50, 0.35)';
    g.shadowBlur = 12; g.shadowOffsetY = 8;
    g.fillStyle = b.c;
    g.beginPath(); g.arc(0, 0, b.r, 0, Math.PI * 2); g.fill();
    g.shadowColor = 'transparent';

    g.save();
    g.clip();
    g.lineCap = 'round';
    for (const st of b.strands) {
      g.save();
      g.rotate(st.tilt + b.rot * st.spin);
      g.scale(1, st.ratio);
      g.strokeStyle = st.col === 0 ? b.dk : st.col === 1 ? b.c : 'rgba(255,255,255,0.55)';
      g.lineWidth = st.w;
      g.beginPath();
      g.arc(0, st.off, b.r * st.rad, st.a0, st.a0 + st.len);
      g.stroke();
      g.restore();
    }
    g.restore();

    const sh = g.createRadialGradient(-b.r * 0.35, -b.r * 0.4, b.r * 0.1, 0, 0, b.r);
    sh.addColorStop(0, 'rgba(255,255,255,0.4)');
    sh.addColorStop(0.55, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(40,50,90,0.32)');
    g.fillStyle = sh;
    g.beginPath(); g.arc(0, 0, b.r, 0, Math.PI * 2); g.fill();

    g.strokeStyle = b.c; g.lineWidth = 1.3; g.lineCap = 'round';
    for (const f of b.fuzz) {
      const a = f.a + b.rot * 0.15;
      g.beginPath();
      g.moveTo(Math.cos(a) * (b.r - 1), Math.sin(a) * (b.r - 1));
      g.lineTo(Math.cos(a + f.t) * (b.r + f.l), Math.sin(a + f.t) * (b.r + f.l));
      g.stroke();
    }
    g.restore();
  }

  function render() {
    g.clearRect(0, 0, W, H);
    balls.forEach(b => { if (b.group === group) drawThread(b); });
    balls.forEach(b => { if (b.group === group) drawBall(b); });
  }

  window.addEventListener('resize', () => { resize(); layout(true); });
  resize();
  startGroup(performance.now());

  if (reduce) {
    // sin animación: trama completa y estática
    balls.forEach(b => { if (b.group === group) b.d = b.path.len; });
    render();
    return;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (phase === 'weave') {
      let done = true;
      balls.forEach(b => {
        if (b.group !== group) return;
        if (b.d < b.path.len) {
          b.d = Math.min(b.path.len, b.d + b.speed * dt);
          b.rot += (b.speed * dt) / b.r;
          done = false;
        }
      });
      if (done) { phase = 'hold'; phaseStart = now; }
    } else if (phase === 'hold') {
      if (now - phaseStart > HOLD) { phase = 'fade'; phaseStart = now; }
    } else {
      alpha = Math.max(0, 1 - (now - phaseStart) / FADE);
      if (alpha === 0) { group = 1 - group; startGroup(now); }
    }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
