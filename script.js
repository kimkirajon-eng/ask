// =====================================================
//  BİRLİKTE UÇAN KUŞLAR — script.js
//  Socket.IO tabanlı online 2 kişilik oyun
// =====================================================

const socket = io();

// ---------- DURUM ----------
let myName = null;        // 'Ceylan' | 'Hakkı'
let setup = {
  deathLimit: 3,
  mode: 'Normal',
  ceylanBet: '',
  hakkiBet: ''
};

// ---------- EKRAN YÖNETİMİ ----------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.game-screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// ---------- SOCKET OLAYLARI ----------

socket.on('connect', () => {
  console.log('Sunucuya bağlandı');
});

socket.on('room_full', () => {
  document.getElementById('characterStatus').textContent = '⚠️ Oda dolu! İki oyuncu zaten bağlı.';
});

socket.on('connection_ok', ({ playerCount }) => {
  document.getElementById('characterStatus').textContent =
    playerCount === 0
      ? 'İlk oyuncu bekleniyor... Karakterini seç!'
      : 'Diğer oyuncu bağlandı! Karakterini seç!';
});

socket.on('room_status', ({ takenRoles, playerCount }) => {
  // Seçili kartları güncelle
  ['Ceylan', 'Hakkı'].forEach(name => {
    const card = document.getElementById(name === 'Ceylan' ? 'ceylanCard' : 'hakkiCard');
    if (takenRoles.includes(name) && room_selected !== name) {
      card.style.opacity = '0.4';
      card.style.pointerEvents = 'none';
    } else {
      card.style.opacity = '1';
      card.style.pointerEvents = 'auto';
    }
  });

  const status = document.getElementById('characterStatus');
  if (playerCount === 2) {
    status.textContent = '✅ İki oyuncu da bağlandı!';
  } else if (playerCount === 1) {
    status.textContent = '⏳ Diğer oyuncu bekleniyor...';
  }
});

let room_selected = null; // Geçici seçim (onaylanmadan önce)

socket.on('character_taken', ({ name }) => {
  alert(`${name} zaten seçildi! Diğer karakteri seç.`);
  room_selected = null;
  document.getElementById('characterConfirmBtn').style.display = 'none';
  ['ceylanCard', 'hakkiCard'].forEach(id => {
    document.getElementById(id).classList.remove('selected', 'hakki');
  });
});

socket.on('character_confirmed', ({ name }) => {
  myName = name;
  document.getElementById('characterConfirmBtn').style.display = 'inline-block';
});

socket.on('both_bets_ready', () => {
  // Her iki kişi de bet kaydetmiş → kendi gizli ekranına git
  goToSecretScreen();
});

socket.on('bet_saved', () => {
  // Karşı taraf henüz kaydetmedi
  document.getElementById('characterStatus') && null; // sessiz bekle
  showWaitingForOther('Diğer oyuncunun bahisini yazması bekleniyor...');
});

socket.on('ceylan_setup_done', () => {
  // Hakkı ekranı: Ceylan gizli ayarını yaptı, şimdi Hakkı yapabilir
  if (myName === 'Hakkı') {
    showScreen('hakkiSecretScreen');
  }
});

socket.on('death_limit_saved', () => {
  if (myName === 'Ceylan') {
    showWaitingForOther('Hakkı\'nın mod seçmesi bekleniyor...');
  }
});

socket.on('mode_saved', () => {
  if (myName === 'Hakkı') {
    socket.emit('player_ready');
    showWaitingForOther('Ceylan\'ın hazır olması bekleniyor...');
  }
});

socket.on('waiting_for_other', () => {
  showWaitingForOther('Diğer oyuncu hazır olunca oyun başlayacak...');
});

socket.on('game_start', (data) => {
  setup = data.setup;
  hideWaiting();
  startGame();
});

socket.on('player_flap', ({ name }) => {
  if (name !== myName) {
    // Karşı oyuncunun kuşunu zıplat
    const bird = name === 'Ceylan' ? birds.ceylan : birds.hakki;
    bird.vel = FLAP_POWER;
  }
});

socket.on('state_update', ({ ceylan, hakki }) => {
  // Skorları güncelle (sadece karşı oyuncunun skoru)
  if (myName !== 'Ceylan') {
    document.getElementById('ceylanScore').textContent = ceylan.score;
    document.getElementById('ceylanDeaths').textContent = `Ölüm: ${ceylan.deaths}`;
  }
  if (myName !== 'Hakkı') {
    document.getElementById('hakkiScore').textContent = hakki.score;
    document.getElementById('hakkiDeaths').textContent = `Ölüm: ${hakki.deaths}`;
  }
});

socket.on('game_ended', ({ winner, ceylan, hakki, setup: s }) => {
  showGameOver(winner, ceylan, hakki, s);
});

socket.on('player_disconnected', ({ name }) => {
  alert(`${name} bağlantısı kesildi! Sayfa yenileniyor...`);
  location.reload();
});

// ---------- YARDIMCI: Bekleme Mesajı ----------
function showWaitingForOther(msg) {
  let el = document.getElementById('waitingOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'waitingOverlay';
    el.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:rgba(0,0,0,0.7);display:flex;justify-content:center;
      align-items:center;z-index:9999;
    `;
    el.innerHTML = `<div style="background:white;padding:30px 40px;border-radius:15px;text-align:center;font-size:1.2em;color:#667eea;font-weight:bold;">
      <div style="font-size:2em;margin-bottom:10px">⏳</div>
      <span id="waitingMsg">${msg}</span>
    </div>`;
    document.body.appendChild(el);
  } else {
    document.getElementById('waitingMsg').textContent = msg;
  }
}

function hideWaiting() {
  const el = document.getElementById('waitingOverlay');
  if (el) el.remove();
}

// =====================================================
//  UI FONKSİYONLARI (HTML'den çağrılır)
// =====================================================

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
  // Sunucuya bildir ama henüz onaylanmadı — confirmCharacter'da gönderilecek
}

function confirmCharacter() {
  if (!room_selected) return;
  socket.emit('select_character', { name: room_selected });
}

function confirmBet() {
  const bet = document.getElementById('betInput').value.trim();
  if (!bet) { alert('Lütfen bir bahis yaz!'); return; }
  socket.emit('save_bet', { name: myName, bet });
  showWaitingForOther('Bahis kaydedildi. Diğer oyuncu bekleniyor...');
}

function goToSecretScreen() {
  hideWaiting();
  if (myName === 'Ceylan') {
    showScreen('ceylanSecretScreen');
  } else {
    // Hakkı: Ceylan önce ayarlamalı
    showWaitingForOther('Ceylan gizli ayarını yapıyor, bekle...');
  }
}

function confirmCeylanSecret() {
  const dl = parseInt(document.getElementById('deathLimit').value) || 3;
  socket.emit('save_death_limit', { deathLimit: dl });
}

let selectedMode = null;

function selectMode(mode) {
  selectedMode = mode;
  const display = document.getElementById('selectedModeDisplay');
  display.style.display = 'block';
  display.textContent = mode === 'Normal'
    ? '⚔️ Normal Mod seçildi'
    : '💕 Aşk Modu seçildi — Ceylan her zaman kazanır!';
  document.getElementById('confirmModeBtn').style.display = 'inline-block';
}

function confirmHakkiSecret() {
  if (!selectedMode) { alert('Lütfen bir mod seç!'); return; }
  socket.emit('save_mode', { mode: selectedMode });
}

// İlerleme: Karakter onayından bet ekranına
socket.on('character_confirmed', ({ name }) => {
  // Zaten yukarıda dinleniyor, burada ekranı geç
  setTimeout(() => showScreen('betScreen'), 300);

  // Bet ekranını kişiselleştir
  document.getElementById('betTitle').textContent =
    name === 'Ceylan'
      ? '👩 Ceylan — Kazanırsam ne alacağım? 🎁'
      : '👨 Hakkı — Kazanırsam ne alacağım? 🎁';
});

// =====================================================
//  OYUN MOTORU
// =====================================================

const GRAVITY    = 0.35;
const FLAP_POWER = -7;
const PIPE_GAP   = 120;
const PIPE_WIDTH = 50;
const PIPE_SPEED = 2;
const BIRD_RADIUS = 16;

let birds = {};
let pipes = { ceylan: [], hakki: [] };
let scores = { ceylan: 0, hakki: 0 };
let deaths = { ceylan: 0, hakki: 0 };
let animFrame = null;
let gameRunning = false;
let deathLimit = 3;
let gameMode = 'Normal';

// Canvas & context
let ctxCeylan, ctxHakki;
const W = 400, H = 300;

function startGame() {
  deathLimit = setup.deathLimit || 3;
  gameMode   = setup.mode || 'Normal';

  ctxCeylan = document.getElementById('ceylanCanvas').getContext('2d');
  ctxHakki  = document.getElementById('hakkiCanvas').getContext('2d');

  resetBirds();
  pipes = { ceylan: [], hakki: [] };
  scores = { ceylan: 0, hakki: 0 };
  deaths = { ceylan: 0, hakki: 0 };
  gameRunning = true;

  showScreen('gameScreen'); // game-screen için özel aktifleştirme
  document.getElementById('gameScreen').classList.add('active');

  // Input: dokunmatik ve klavye
  document.addEventListener('keydown', handleKey);
  document.getElementById('ceylanCanvas').addEventListener('click', () => flapMe('ceylan'));
  document.getElementById('hakkiCanvas').addEventListener('click',  () => flapMe('hakki'));
  document.getElementById('ceylanCanvas').addEventListener('touchstart', e => { e.preventDefault(); flapMe('ceylan'); }, { passive: false });
  document.getElementById('hakkiCanvas').addEventListener('touchstart',  e => { e.preventDefault(); flapMe('hakki'); },  { passive: false });

  loop();
}

function resetBirds() {
  birds = {
    ceylan: { x: 80, y: 150, vel: 0, alive: true },
    hakki:  { x: 80, y: 150, vel: 0, alive: true }
  };
}

function handleKey(e) {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    if (myName === 'Ceylan') flapMe('ceylan');
    else flapMe('hakki');
  }
}

function flapMe(role) {
  if (!gameRunning) return;
  const name = role === 'ceylan' ? 'Ceylan' : 'Hakkı';
  // Sadece kendi kuşunu uçurabilirsin
  if (myName !== name) return;
  birds[role].vel = FLAP_POWER;
  socket.emit('flap', { name });
}

// Pipe oluşturma
let pipeTick = 0;
function addPipes() {
  pipeTick++;
  if (pipeTick < 90) return;
  pipeTick = 0;
  const topH = 40 + Math.random() * (H - PIPE_GAP - 80);
  const pipe = { x: W, topH };
  pipes.ceylan.push({ ...pipe, passed: false });
  pipes.hakki.push({ ...pipe, passed: false });
}

// Ana döngü
function loop() {
  if (!gameRunning) return;
  update();
  drawCeylan();
  drawHakki();
  animFrame = requestAnimationFrame(loop);
}

function update() {
  addPipes();

  ['ceylan', 'hakki'].forEach(role => {
    const bird = birds[role];
    if (!bird.alive) return;

    bird.vel += GRAVITY;
    bird.y   += bird.vel;

    // Zemin / tavan
    if (bird.y + BIRD_RADIUS > H) {
      bird.y = H - BIRD_RADIUS;
      handleDeath(role);
      return;
    }
    if (bird.y - BIRD_RADIUS < 0) {
      bird.y = BIRD_RADIUS;
      bird.vel = 0;
    }

    // Borular
    pipes[role].forEach((pipe, i) => {
      pipe.x -= PIPE_SPEED;

      // Çarpışma
      const inX = bird.x + BIRD_RADIUS > pipe.x && bird.x - BIRD_RADIUS < pipe.x + PIPE_WIDTH;
      const inY = bird.y - BIRD_RADIUS < pipe.topH || bird.y + BIRD_RADIUS > pipe.topH + PIPE_GAP;
      if (inX && inY) {
        handleDeath(role);
      }

      // Skor
      if (!pipe.passed && pipe.x + PIPE_WIDTH < bird.x) {
        pipe.passed = true;
        scores[role]++;
        updateScoreUI(role);
      }
    });

    // Ekran dışı boruları temizle
    pipes[role] = pipes[role].filter(p => p.x + PIPE_WIDTH > 0);
  });
}

function handleDeath(role) {
  if (!birds[role].alive) return;
  deaths[role]++;
  updateDeathUI(role);

  const name = role === 'ceylan' ? 'Ceylan' : 'Hakkı';
  socket.emit('update_state', { name, score: scores[role], deaths: deaths[role] });

  // Ölüm limitine ulaşıldı mı?
  const limit = deathLimit;

  if (gameMode === 'Love') {
    // Aşk Modunda Hakkı'nın ölümleri Ceylan'ı kazandırır
    if (role === 'hakki' && deaths.hakki >= limit) {
      endGame('Ceylan');
      return;
    }
    if (role === 'ceylan' && deaths.ceylan >= limit) {
      // Ceylan çok öldü ama Aşk modunda Ceylan kazansın diye Hakkı kaybetsin
      endGame('Ceylan');
      return;
    }
  } else {
    // Normal mod: ilk limite ulaşan kaybeder
    if (deaths[role] >= limit) {
      const winner = role === 'ceylan' ? 'Hakkı' : 'Ceylan';
      endGame(winner);
      return;
    }
  }

  // Sadece yeniden doğ
  setTimeout(() => {
    if (!gameRunning) return;
    birds[role] = { x: 80, y: 150, vel: 0, alive: true };
    pipes[role] = [];
  }, 800);
  birds[role].alive = false;
}

function endGame(winner) {
  if (!gameRunning) return;
  gameRunning = false;
  cancelAnimationFrame(animFrame);

  socket.emit('game_over', {
    winner,
    ceylan: { score: scores.ceylan, deaths: deaths.ceylan },
    hakki:  { score: scores.hakki,  deaths: deaths.hakki }
  });

  showGameOver(winner,
    { score: scores.ceylan, deaths: deaths.ceylan },
    { score: scores.hakki,  deaths: deaths.hakki },
    setup
  );
}

function showGameOver(winner, ceylan, hakki, s) {
  document.getElementById('gameOverTitle').textContent =
    winner === 'Ceylan' ? '💕 Ceylan Kazandı! 🎉' : '🏆 Hakkı Kazandı! 🎉';
  document.getElementById('gameOverTitle').className =
    winner === 'Ceylan' ? 'love-win' : '';

  document.getElementById('finalScore1').textContent  = ceylan.score;
  document.getElementById('finalDeaths1').textContent = ceylan.deaths;
  document.getElementById('finalScore2').textContent  = hakki.score;
  document.getElementById('finalDeaths2').textContent = hakki.deaths;

  let betMsg = '';
  if (winner === 'Ceylan') {
    betMsg = s.ceylanBet
      ? `🎁 Ceylan'ın hakkı: ${s.ceylanBet}`
      : '🎉 Ceylan kazandı!';
  } else {
    betMsg = s.hakkiBet
      ? `🎁 Hakkı'nın hakkı: ${s.hakkiBet}`
      : '🏆 Hakkı kazandı!';
  }
  document.getElementById('betMessage').textContent = betMsg;
  document.getElementById('gameOverModal').classList.add('show');
}

// ---------- UI GÜNCELLEME ----------
function updateScoreUI(role) {
  document.getElementById(role === 'ceylan' ? 'ceylanScore' : 'hakkiScore').textContent = scores[role];
  const name = role === 'ceylan' ? 'Ceylan' : 'Hakkı';
  socket.emit('update_state', { name, score: scores[role], deaths: deaths[role] });
}

function updateDeathUI(role) {
  document.getElementById(role === 'ceylan' ? 'ceylanDeaths' : 'hakkiDeaths').textContent = `Ölüm: ${deaths[role]}`;
}

// ---------- ÇİZİM ----------
function drawBird(ctx, bird, color, emoji) {
  if (!bird.alive) return;
  ctx.save();
  ctx.translate(bird.x, bird.y);
  // Eğim
  const angle = Math.min(Math.max(bird.vel * 0.05, -0.5), 0.8);
  ctx.rotate(angle);
  ctx.font = `${BIRD_RADIUS * 2}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 0, 0);
  ctx.restore();
}

function drawPipes(ctx, pipeList, color) {
  pipeList.forEach(pipe => {
    ctx.fillStyle = color;
    // Üst boru
    ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.topH);
    ctx.fillRect(pipe.x - 4, pipe.topH - 20, PIPE_WIDTH + 8, 20);
    // Alt boru
    const botY = pipe.topH + PIPE_GAP;
    ctx.fillRect(pipe.x, botY, PIPE_WIDTH, H - botY);
    ctx.fillRect(pipe.x - 4, botY, PIPE_WIDTH + 8, 20);
  });
}

function drawBg(ctx, color) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  // Zemin
  ctx.fillStyle = '#8B7355';
  ctx.fillRect(0, H - 10, W, 10);
}

function drawCeylan() {
  drawBg(ctxCeylan, '#e0f2ff');
  drawPipes(ctxCeylan, pipes.ceylan, '#4CAF50');
  drawBird(ctxCeylan, birds.ceylan, '#ff6b6b', '👩');
  if (!birds.ceylan.alive) {
    ctxCeylan.fillStyle = 'rgba(0,0,0,0.4)';
    ctxCeylan.fillRect(0, 0, W, H);
    ctxCeylan.fillStyle = 'white';
    ctxCeylan.font = 'bold 24px Arial';
    ctxCeylan.textAlign = 'center';
    ctxCeylan.fillText('💥 Yeniden doğuyor...', W / 2, H / 2);
  }
}

function drawHakki() {
  drawBg(ctxHakki, '#f0e0ff');
  drawPipes(ctxHakki, pipes.hakki, '#9C27B0');
  drawBird(ctxHakki, birds.hakki, '#764ba2', '👨');
  if (!birds.hakki.alive) {
    ctxHakki.fillStyle = 'rgba(0,0,0,0.4)';
    ctxHakki.fillRect(0, 0, W, H);
    ctxHakki.fillStyle = 'white';
    ctxHakki.font = 'bold 24px Arial';
    ctxHakki.textAlign = 'center';
    ctxHakki.fillText('💥 Yeniden doğuyor...', W / 2, H / 2);
  }
}
