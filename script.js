const socket = io();
let myName = null, room_selected = null, gameRunning = false;
let setup = { deathLimit: 3, mode: 'Normal' };
let W, H, PIPE_GAP, PIPE_WIDTH, PIPE_SPEED;
const GRAVITY = 0.35, FLAP_POWER = -7, BIRD_RADIUS = 16;
let birds = {}, pipes = { ceylan: [], hakki: [] }, scores = { ceylan: 0, hakki: 0 }, deaths = { ceylan: 0, hakki: 0 }, pipeTick = 0;
let ctxCeylan, ctxHakki;

// --- UI Yönetimi ---
function showScreen(id) {
  document.querySelectorAll('.screen, .game-screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showWaiting(msg) {
  let el = document.getElementById('waitingOverlay');
  if (!el) {
    el = document.createElement('div'); el.id = 'waitingOverlay';
    el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;z-index:9999;color:white;';
    el.innerHTML = '<div style="text-align:center;"><h2>⏳</h2><p id="waitingMsg"></p></div>';
    document.body.appendChild(el);
  }
  document.getElementById('waitingMsg').textContent = msg; el.style.display = 'flex';
}

function hideWaiting() { if (document.getElementById('waitingOverlay')) document.getElementById('waitingOverlay').style.display = 'none'; }

// --- Karakter & Bahis ---
function selectCharacter(name) {
  room_selected = name;
  document.getElementById('ceylanCard').classList.toggle('selected', name === 'Ceylan');
  document.getElementById('hakkiCard').classList.toggle('selected', name === 'Hakkı');
  document.getElementById('hakkiCard').classList.toggle('hakki', name === 'Hakkı');
  document.getElementById('characterConfirmBtn').style.display = 'block';
}

function confirmCharacter() { socket.emit('select_character', { name: room_selected }); }
function confirmBet() { socket.emit('save_bet', { name: myName, bet: document.getElementById('betInput').value }); showWaiting('Diğer oyuncu bekleniyor...'); }
function confirmCeylanSecret() { socket.emit('save_death_limit', { deathLimit: document.getElementById('deathLimit').value }); socket.emit('player_ready'); showWaiting('Hakkı bekleniyor...'); }
function selectMode(m) { setup.mode = m; document.getElementById('confirmModeBtn').style.display = 'block'; }
function confirmHakkiSecret() { socket.emit('save_mode', { mode: setup.mode }); socket.emit('player_ready'); showWaiting('Ceylan bekleniyor...'); }

// --- Socket Olayları ---
socket.on('character_confirmed', ({ name }) => { myName = name; showScreen('betScreen'); });
socket.on('both_bets_ready', () => { hideWaiting(); if (myName === 'Ceylan') showScreen('ceylanSecretScreen'); else showWaiting('Ceylan ayar yapıyor...'); });
socket.on('ceylan_setup_done', () => { if (myName === 'Hakkı') { hideWaiting(); showScreen('hakkiSecretScreen'); } });
socket.on('game_start', (data) => { setup = data.setup; hideWaiting(); startGame(); });
socket.on('sync_pipe', ({ topH }) => { const p = { x: W, topH, passed: false }; pipes.ceylan.push({...p}); pipes.hakki.push({...p}); });
socket.on('player_flap', ({ name }) => { if (name !== myName) birds[name === 'Ceylan' ? 'ceylan' : 'hakki'].vel = FLAP_POWER; });

socket.on('state_update', (data) => {
  const role = data.name === 'Ceylan' ? 'ceylan' : 'hakki';
  if (birds[role]) {
    birds[role].x = data.x; birds[role].y = data.y; birds[role].vel = data.vel;
    scores[role] = data.score; deaths[role] = data.deaths;
    updateUI(role);
  }
});

socket.on('game_ended', (data) => { gameRunning = false; showGameOver(data); });

// --- Oyun Motoru ---
function startGame() {
  showScreen('gameScreen');
  setTimeout(() => {
    resizeCanvases();
    ctxCeylan = document.getElementById('ceylanCanvas').getContext('2d');
    ctxHakki = document.getElementById('hakkiCanvas').getContext('2d');
    birds = { ceylan: { x: W*0.2, y: H*0.5, vel: 0, alive: true }, hakki: { x: W*0.2, y: H*0.5, vel: 0, alive: true } };
    gameRunning = true;
    document.addEventListener('keydown', (e) => { if(e.code==='Space') flapMe(); });
    document.querySelectorAll('canvas').forEach(c => c.addEventListener('touchstart', (e) => { e.preventDefault(); flapMe(); }));
    loop();
  }, 200);
}

function flapMe() {
  const role = myName === 'Ceylan' ? 'ceylan' : 'hakki';
  if (birds[role]) { birds[role].vel = FLAP_POWER; socket.emit('flap', { name: myName }); }
}

function resizeCanvases() {
  const wrapper = document.querySelector('.game-canvas-wrapper');
  W = wrapper.clientWidth; H = wrapper.clientHeight;
  document.querySelectorAll('canvas').forEach(c => { c.width = W; c.height = H; });
  PIPE_GAP = H * 0.4; PIPE_WIDTH = W * 0.15; PIPE_SPEED = 2.5;
}

function loop() { if (!gameRunning) return; update(); draw(); requestAnimationFrame(loop); }

function update() {
  pipeTick++;
  if (pipeTick >= 90 && myName === 'Ceylan') {
    pipeTick = 0; const topH = 40 + Math.random() * (H - PIPE_GAP - 80);
    socket.emit('new_pipe', { topH });
    const p = { x: W, topH, passed: false }; pipes.ceylan.push({...p}); pipes.hakki.push({...p});
  }

  ['ceylan', 'hakki'].forEach(role => {
    const bird = birds[role]; bird.vel += GRAVITY; bird.y += bird.vel;
    if (bird.y > H || bird.y < 0) resetBird(role);
    pipes[role].forEach(p => {
      p.x -= PIPE_SPEED;
      if (bird.x + 10 > p.x && bird.x - 10 < p.x + PIPE_WIDTH) {
        if (bird.y - 10 < p.topH || bird.y + 10 > p.topH + PIPE_GAP) resetBird(role);
      }
      if (!p.passed && p.x < bird.x) { p.passed = true; scores[role]++; updateUI(role); }
    });
    pipes[role] = pipes[role].filter(p => p.x + PIPE_WIDTH > 0);
  });

  const myRole = myName === 'Ceylan' ? 'ceylan' : 'hakki';
  socket.emit('update_state', { name: myName, score: scores[myRole], deaths: deaths[myRole], x: birds[myRole].x, y: birds[myRole].y, vel: birds[myRole].vel });
}

function resetBird(role) {
  if (role === (myName === 'Ceylan' ? 'ceylan' : 'hakki')) {
    deaths[role]++; updateUI(role);
    if (deaths[role] >= setup.deathLimit) {
      const winner = (setup.mode === 'Love') ? 'Ceylan' : (role === 'ceylan' ? 'Hakkı' : 'Ceylan');
      socket.emit('game_over', { winner, ceylan: {score: scores.ceylan, deaths: deaths.ceylan}, hakki: {score: scores.hakki, deaths: deaths.hakki}});
    }
  }
  birds[role].y = H/2; birds[role].vel = 0; pipes[role] = [];
}

function updateUI(role) {
  document.getElementById(role + 'Score').textContent = scores[role];
  document.getElementById(role + 'Deaths').textContent = 'Ölüm: ' + deaths[role];
}

function draw() {
  drawLayer(ctxCeylan, 'ceylan', '#e0f2ff', '👩', '#4CAF50');
  drawLayer(ctxHakki, 'hakki', '#f0e0ff', '👨', '#9C27B0');
}

function drawLayer(ctx, role, bg, emoji, pColor) {
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = pColor;
  pipes[role].forEach(p => { ctx.fillRect(p.x, 0, PIPE_WIDTH, p.topH); ctx.fillRect(p.x, p.topH + PIPE_GAP, PIPE_WIDTH, H); });
  ctx.font = '30px Arial'; ctx.textAlign = 'center'; ctx.fillText(emoji, birds[role].x, birds[role].y);
}

function showGameOver(data) {
  document.getElementById('gameOverTitle').textContent = data.winner + " Kazandı! 🎉";
  document.getElementById('finalScore1').textContent = data.ceylan.score;
  document.getElementById('finalDeaths1').textContent = data.ceylan.deaths;
  document.getElementById('finalScore2').textContent = data.hakki.score;
  document.getElementById('finalDeaths2').textContent = data.hakki.deaths;
  document.getElementById('betMessage').textContent = data.winner === 'Ceylan' ? data.setup.ceylanBet : data.setup.hakkiBet;
  document.getElementById('gameOverModal').classList.add('show');
}
