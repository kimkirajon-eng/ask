// =====================================================
//  BİRLİKTE UÇAN KUŞLAR — script.js (TAM SÜRÜM)
// =====================================================
const socket = io({
  reconnection: true,
  transports: ['websocket', 'polling'],
});

// ── Durum Değişkenleri ─────────────────────────────────
let myName = null;
let room_selected = null;
let setup = { deathLimit: 3, mode: 'Normal', ceylanBet: '', hakkiBet: '' };

let W, H, PIPE_GAP, PIPE_WIDTH, PIPE_SPEED;
const GRAVITY = 0.35, FLAP_POWER = -7, BIRD_RADIUS = 16;

let birds = {};
let pipes = { ceylan: [], hakki: [] };
let scores = { ceylan: 0, hakki: 0 };
let deaths = { ceylan: 0, hakki: 0 };
let pipeTick = 0;
let gameRunning = false;
let animFrame = null;
let ctxCeylan, ctxHakki;

// ── Ekran Yönetimi ──────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen, .game-screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function showWaiting(msg) {
  let el = document.getElementById('waitingOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'waitingOverlay';
    el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);display:flex;justify-content:center;align-items:center;z-index:9999;';
    el.innerHTML = '<div style="background:#fff;padding:30px;border-radius:15px;text-align:center;color:#667eea;font-weight:bold;"><div style="font-size:2em;">⏳</div><span id="waitingMsg"></span></div>';
    document.body.appendChild(el);
  }
  document.getElementById('waitingMsg').textContent = msg;
  el.style.display = 'flex';
}

function hideWaiting() {
  const el = document.getElementById('waitingOverlay');
  if (el) el.style.display = 'none';
}

// ── Karakter Seçimi Fonksiyonları ────────────────────────
function selectCharacter(name) {
  room_selected = name;
  document.getElementById('ceylanCard').classList.remove('selected', 'hakki');
  document.getElementById('hakkiCard').classList.remove('selected', 'hakki');
  
  if (name === 'Ceylan') {
    document.getElementById('ceylanCard').classList.add('selected');
  } else {
    document.getElementById('hakkiCard').classList.add('selected', 'hakki');
  }
  document.getElementById('characterConfirmBtn').style.display = 'inline-block';
}

function confirmCharacter() {
  if (!room_selected) return;
  socket.emit('select_character', { name: room_selected });
}

// ── Socket Olayları ─────────────────────────────────────
socket.on('character_confirmed', ({ name }) => {
  myName = name;
  showScreen('betScreen');
  document.getElementById('betTitle').textContent = name === 'Ceylan' ? '👩 Ceylan — Kazanırsam ne alacağım?' : '👨 Hakkı — Kazanırsam ne alacağım?';
});

socket.on('room_status', ({ takenRoles }) => {
  ['Ceylan', 'Hakkı'].forEach(role => {
    const card = document.getElementById(role === 'Ceylan' ? 'ceylanCard' : 'hakkiCard');
    if (takenRoles.includes(role) && role !== myName) {
      card.style.opacity = '0.4';
      card.style.pointerEvents = 'none';
    }
  });
});

socket.on('both_bets_ready', () => {
  hideWaiting();
  if (myName === 'Ceylan') showScreen('ceylanSecretScreen');
  else showWaiting('Ceylan gizli ayarlarını yapıyor...');
});

socket.on('ceylan_setup_done', () => {
  if (myName === 'Hakkı') { hideWaiting(); showScreen('hakkiSecretScreen'); }
});

socket.on('game_start', (data) => {
  setup = data.setup;
  hideWaiting();
  startGame();
});

socket.on('sync_pipe', ({ topH }) => {
  const p = { x: W, topH, passed: false };
  pipes.ceylan.push({...p}); pipes.hakki.push({...p});
});

socket.on('state_update', (state) => {
  ['ceylan', 'hakki'].forEach(role => {
    if ((role === 'ceylan' && myName !== 'Ceylan') || (role === 'hakki' && myName !== 'Hakkı')) {
      if(birds[role]) {
        birds[role].x = state[role].x; birds[role].y = state[role].y;
        birds[role].vel = state[role].vel; scores[role] = state[role].score;
        deaths[role] = state[role].deaths;
        document.getElementById(role+'Score').textContent = scores[role];
        document.getElementById(role+'Deaths').textContent = 'Ölüm: ' + deaths[role];
      }
    }
  });
});

socket.on('player_flap', ({ name }) => {
  if (name !== myName) birds[name === 'Ceylan' ? 'ceylan' : 'hakki'].vel = FLAP_POWER;
});

// ── Oyun Mantığı ────────────────────────────────────────
function startGame() {
  showScreen('gameScreen');
  setTimeout(() => {
    resizeCanvases();
    ctxCeylan = document.getElementById('ceylanCanvas').getContext('2d');
    ctxHakki = document.getElementById('hakkiCanvas').getContext('2d');
    birds = {
      ceylan: { x: W*0.2, y: H*0.5, vel: 0, alive: true },
      hakki: { x: W*0.2, y: H*0.5, vel: 0, alive: true }
    };
    gameRunning = true;
    document.addEventListener('keydown', (e) => { if(e.code==='Space') flapMe(); });
    document.querySelectorAll('canvas').forEach(c => c.addEventListener('touchstart', flapMe));
    loop();
  }, 100);
}

function flapMe() {
  const role = myName === 'Ceylan' ? 'ceylan' : 'hakki';
  if (birds[role]) {
    birds[role].vel = FLAP_POWER;
    socket.emit('flap', { name: myName });
  }
}

function resizeCanvases() {
  const wrapper = document.querySelector('.game-canvas-wrapper');
  W = wrapper.clientWidth; H = wrapper.clientHeight;
  document.querySelectorAll('canvas').forEach(c => { c.width = W; c.height = H; });
  PIPE_GAP = H * 0.4; PIPE_WIDTH = W * 0.15; PIPE_SPEED = 2.5;
}

function loop() {
  if (!gameRunning) return;
  update();
  draw();
  animFrame = requestAnimationFrame(loop);
}

function update() {
  pipeTick++;
  if (pipeTick >= 90) {
    pipeTick = 0;
    if (myName === 'Ceylan') {
      const topH = 40 + Math.random() * (H - PIPE_GAP - 80);
      socket.emit('new_pipe', { topH });
      const p = { x: W, topH, passed: false };
      pipes.ceylan.push({...p}); pipes.hakki.push({...p});
    }
  }

  ['ceylan', 'hakki'].forEach(role => {
    const bird = birds[role];
    bird.vel += GRAVITY; bird.y += bird.vel;
    
    if (bird.y > H || bird.y < 0) resetBird(role);

    pipes[role].forEach(p => {
      p.x -= PIPE_SPEED;
      if (bird.x + 10 > p.x && bird.x - 10 < p.x + PIPE_WIDTH) {
        if (bird.y - 10 < p.topH || bird.y + 10 > p.topH + PIPE_GAP) resetBird(role);
      }
      if (!p.passed && p.x < bird.x) { p.passed = true; scores[role]++; }
    });
    pipes[role] = pipes[role].filter(p => p.x + PIPE_WIDTH > 0);
  });

  const myRole = myName === 'Ceylan' ? 'ceylan' : 'hakki';
  socket.emit('update_state', { name: myName, score: scores[myRole], deaths: deaths[myRole], x: birds[myRole].x, y: birds[myRole].y, vel: birds[myRole].vel });
}

function resetBird(role) {
  if (role === (myName === 'Ceylan' ? 'ceylan' : 'hakki')) {
    deaths[role]++;
    if (deaths[role] >= setup.deathLimit) {
      const winner = (setup.mode === 'Love') ? 'Ceylan' : (role === 'ceylan' ? 'Hakkı' : 'Ceylan');
      socket.emit('game_over', { winner, ceylan: {score: scores.ceylan, deaths: deaths.ceylan}, hakki: {score: scores.hakki, deaths: deaths.hakki}});
    }
  }
  birds[role].y = H/2; birds[role].vel = 0;
  pipes[role] = [];
}

// ── Çizim Fonksiyonları ──────────────────────────────────
function draw() {
  drawLayer(ctxCeylan, 'ceylan', '#e0f2ff', '👩');
  drawLayer(ctxHakki, 'hakki', '#f0e0ff', '👨');
}

function drawLayer(ctx, role, bg, emoji) {
  ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = '#4CAF50';
  pipes[role].forEach(p => {
    ctx.fillRect(p.x, 0, PIPE_WIDTH, p.topH);
    ctx.fillRect(p.x, p.topH + PIPE_GAP, PIPE_WIDTH, H);
  });
  ctx.font = '30px Arial'; ctx.textAlign = 'center';
  ctx.fillText(emoji, birds[role].x, birds[role].y);
}

// ── Bahis ve Mod Fonksiyonları ───────────────────────────
function confirmBet() {
  const bet = document.getElementById('betInput').value;
  socket.emit('save_bet', { name: myName, bet });
  showWaiting('Diğer oyuncu bekleniyor...');
}

function confirmCeylanSecret() {
  const dl = document.getElementById('deathLimit').value;
  socket.emit('save_death_limit', { deathLimit: dl });
  socket.emit('player_ready');
  showWaiting('Hakkı mod seçiyor...');
}

function selectMode(m) { 
  setup.mode = m; 
  document.getElementById('confirmModeBtn').style.display = 'block'; 
}

function confirmHakkiSecret() {
  socket.emit('save_mode', { mode: setup.mode });
  socket.emit('player_ready');
  showWaiting('Ceylan hazır olması bekleniyor...');
}
