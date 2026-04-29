// =====================================================
//  BİRLİKTE UÇAN KUŞLAR — script.js
// =====================================================

const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  transports: ['websocket', 'polling'],
});

// Render uyku modunu önle
setInterval(() => { fetch('/ping').catch(() => {}); }, 10 * 60 * 1000);

// ── Durum ────────────────────────────────────────────────
let myName = null;
let setup  = { deathLimit: 3, mode: 'Normal', ceylanBet: '', hakkiBet: '' };
let room_selected = null;

// ── Ekran yönetimi ───────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.game-screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// ── Bağlantı banner ──────────────────────────────────────
let _banner = null;
function showBanner(msg, color) {
  if (!_banner) {
    _banner = document.createElement('div');
    _banner.style.cssText =
      'position:fixed;top:0;left:0;width:100%;padding:9px;text-align:center;' +
      'font-weight:bold;color:#fff;z-index:99999;font-size:13px;';
    document.body.prepend(_banner);
  }
  _banner.style.background = color || '#e53e3e';
  _banner.textContent = msg;
  _banner.style.display = 'block';
}
function hideBanner() { if (_banner) _banner.style.display = 'none'; }

// ── Bekleme overlay ──────────────────────────────────────
function showWaiting(msg) {
  let el = document.getElementById('waitingOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'waitingOverlay';
    el.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;' +
      'background:rgba(0,0,0,0.75);display:flex;justify-content:center;' +
      'align-items:center;z-index:9999;';
    el.innerHTML =
      '<div style="background:#fff;padding:30px 40px;border-radius:15px;' +
      'text-align:center;font-size:1.1em;color:#667eea;font-weight:bold;max-width:300px">' +
      '<div style="font-size:2.5em;margin-bottom:12px">⏳</div>' +
      '<span id="waitingMsg">' + msg + '</span></div>';
    document.body.appendChild(el);
  } else {
    document.getElementById('waitingMsg').textContent = msg;
    el.style.display = 'flex';
  }
}
function hideWaiting() {
  const el = document.getElementById('waitingOverlay');
  if (el) el.style.display = 'none';
}

// =====================================================
//  SOCKET OLAYLARI
// =====================================================

socket.on('connect', () => { hideBanner(); });

socket.on('disconnect', () => {
  showBanner('⚠️ Bağlantı koptu, yeniden bağlanılıyor…');
});
socket.on('reconnect', () => {
  showBanner('✅ Yeniden bağlandı!', '#38a169');
  setTimeout(hideBanner, 2000);
});
socket.on('reconnect_attempt', (n) => {
  showBanner('⏳ Bağlanılıyor… (' + n + ')');
});

// ── Bağlantı OK ──────────────────────────────────────────
socket.on('connection_ok', ({ playerCount }) => {
  const s = document.getElementById('characterStatus');
  s.textContent = playerCount === 0
    ? 'İlk oyuncu bekleniyor… Karakterini seç!'
    : 'Diğer oyuncu bağlandı! Karakterini seç!';
});

// ── Oda durumu ───────────────────────────────────────────
socket.on('room_status', ({ takenRoles, playerCount }) => {
  ['Ceylan', 'Hakkı'].forEach(name => {
    const id   = name === 'Ceylan' ? 'ceylanCard' : 'hakkiCard';
    const card = document.getElementById(id);
    if (takenRoles.includes(name) && name !== myName) {
      card.style.opacity = '0.4';
      card.style.pointerEvents = 'none';
    } else {
      card.style.opacity = '1';
      card.style.pointerEvents = 'auto';
    }
  });
  const s = document.getElementById('characterStatus');
  if (s) {
    s.textContent = playerCount === 2
      ? '✅ İki oyuncu da bağlandı!'
      : playerCount === 1 ? '⏳ Diğer oyuncu bekleniyor…' : s.textContent;
  }
});

// ── Karakter ─────────────────────────────────────────────
socket.on('character_taken', ({ name }) => {
  alert(name + ' zaten seçildi! Diğer karakteri seç.');
  room_selected = null;
  document.getElementById('characterConfirmBtn').style.display = 'none';
  ['ceylanCard', 'hakkiCard'].forEach(id =>
    document.getElementById(id).classList.remove('selected', 'hakki'));
});

socket.on('character_confirmed', ({ name }) => {
  myName = name;
  document.getElementById('characterConfirmBtn').style.display = 'inline-block';
  setTimeout(() => {
    showScreen('betScreen');
    document.getElementById('betTitle').textContent = name === 'Ceylan'
      ? '👩 Ceylan — Kazanırsam ne alacağım? 🎁'
      : '👨 Hakkı — Kazanırsam ne alacağım? 🎁';
  }, 300);
});

// ── Bahis ────────────────────────────────────────────────
socket.on('both_bets_ready', () => {
  hideWaiting();
  goToSecretScreen();
});
socket.on('bet_saved', () => {
  showWaiting('Diğer oyuncunun bahisini yazması bekleniyor…');
});

// ── Gizli ayarlar ────────────────────────────────────────

// DÜZELTME: Ceylan ayarını bitirince Hakkı'nın bekleme ekranı kapanıp
// gizli mod ekranı açılıyor
socket.on('ceylan_setup_done', () => {
  if (myName === 'Hakkı') {
    hideWaiting();                  // ← bekleme overlay'ini kapat
    showScreen('hakkiSecretScreen'); // ← Hakkı'nın mod ekranını aç
  }
});

socket.on('death_limit_saved', () => {
  if (myName === 'Ceylan') {
    showWaiting("Hakkı'nın mod seçmesi bekleniyor…");
  }
});

socket.on('mode_saved', () => {
  if (myName === 'Hakkı') {
    socket.emit('player_ready');
    showWaiting("Ceylan'ın hazır olması bekleniyor…");
  }
});

socket.on('waiting_for_other', () => {
  showWaiting('Diğer oyuncu hazır olunca oyun başlayacak…');
});

// ── Oyun başla ───────────────────────────────────────────
socket.on('game_start', (data) => {
  setup = { ...setup, ...data.setup };
  hideWaiting();
  startGame();
});

socket.on('player_flap', ({ name }) => {
  if (name === myName) return;
  const key = name === 'Ceylan' ? 'ceylan' : 'hakki';
  if (birds[key]) birds[key].vel = FLAP_POWER;
});

socket.on('state_update', ({ ceylan, hakki }) => {
  if (myName !== 'Ceylan') {
    document.getElementById('ceylanScore').textContent  = ceylan.score;
    document.getElementById('ceylanDeaths').textContent = 'Ölüm: ' + ceylan.deaths;
  }
  if (myName !== 'Hakkı') {
    document.getElementById('hakkiScore').textContent  = hakki.score;
    document.getElementById('hakkiDeaths').textContent = 'Ölüm: ' + hakki.deaths;
  }
});

socket.on('game_ended', ({ winner, ceylan, hakki, setup: s }) => {
  showGameOver(winner, ceylan, hakki, s);
});

socket.on('player_disconnected', ({ name }) => {
  showBanner('⚠️ ' + name + ' bağlantısı kesildi… Geri dönmesi bekleniyor', '#dd6b20');
});

// =====================================================
//  UI FONKSİYONLARI (index.html'den çağrılır)
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
}

function confirmCharacter() {
  if (!room_selected) return;
  socket.emit('select_character', { name: room_selected });
}

function confirmBet() {
  const bet = document.getElementById('betInput').value.trim();
  if (!bet) { alert('Lütfen bir bahis yaz!'); return; }
  socket.emit('save_bet', { name: myName, bet });
  showWaiting('Bahis kaydedildi. Diğer oyuncu bekleniyor…');
}

function goToSecretScreen() {
  if (myName === 'Ceylan') {
    showScreen('ceylanSecretScreen');
  } else {
    // Hakkı: Ceylan henüz ayarını yapmadı, bekle
    showWaiting('Ceylan gizli ayarını yapıyor, bekle…');
  }
}

function confirmCeylanSecret() {
  const dl = parseInt(document.getElementById('deathLimit').value) || 3;
  socket.emit('save_death_limit', { deathLimit: dl });
  // Ceylan kendi ekranında bekleme mesajı görür (death_limit_saved eventi ile)
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

// Ceylan player_ready'i ne zaman gönderiyor?
// → Hakkı mode_saved aldığında player_ready gönderir (üstte var)
// → Ceylan da death_limit_saved + karşı taraf hazır olunca game_start gelir
// Ama Ceylan'ın da player_ready göndermesi lazım:
socket.on('death_limit_saved', () => {
  if (myName === 'Ceylan') {
    socket.emit('player_ready'); // Ceylan hazır
    showWaiting("Hakkı'nın mod seçmesi bekleniyor…");
  }
});

// =====================================================
//  OYUN MOTORU
// =====================================================

const GRAVITY     = 0.35;
const FLAP_POWER  = -7;
const BIRD_RADIUS = 16;

// Oyun sabitleri — canvas boyutuna göre ölçeklenir
// W ve H startGame'de canvas.width/height'tan okunur
let W = 400, H = 300;
let PIPE_GAP   = 130;
let PIPE_WIDTH = 52;
let PIPE_SPEED = 2.2;

// Canvas'ı wrapper'ını tam dolduracak şekilde boyutlandır
function resizeCanvases() {
  ['ceylan', 'hakki'].forEach(role => {
    const canvasId  = role === 'ceylan' ? 'ceylanCanvas' : 'hakkiCanvas';
    const wrapperId = role === 'ceylan' ? undefined : undefined; // wrapper = canvas.parentElement
    const canvas    = document.getElementById(canvasId);
    if (!canvas) return;
    const wrapper = canvas.parentElement;
    const ww = wrapper.clientWidth;
    const wh = wrapper.clientHeight;
    if (ww > 0 && wh > 0) {
      canvas.width  = ww;
      canvas.height = wh;
    }
  });
  // W ve H'yi güncelle (her iki canvas aynı boyutta olacak)
  const c = document.getElementById('ceylanCanvas');
  if (c && c.width > 0) {
    W = c.width;
    H = c.height;
    // Boru aralığını ekran yüksekliğine oranla ayarla
    PIPE_GAP   = Math.round(H * 0.42);
    PIPE_WIDTH = Math.round(W * 0.07);
    PIPE_SPEED = W < 500 ? 2 : 2.5;
  }
}

let birds      = {};
let pipes      = { ceylan: [], hakki: [] };
let scores     = { ceylan: 0, hakki: 0 };
let deaths     = { ceylan: 0, hakki: 0 };
let animFrame  = null;
let gameRunning = false;
let pipeTick   = 0;
let deathLimit = 3;
let gameMode   = 'Normal';
let ctxCeylan, ctxHakki;

function startGame() {
  deathLimit  = setup.deathLimit || 3;
  gameMode    = setup.mode       || 'Normal';

  // Önce ekranı göster — wrapper boyutları ancak sonra okunabilir
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('gameScreen').classList.add('active');

  requestAnimationFrame(() => {
    resizeCanvases();

    ctxCeylan = document.getElementById('ceylanCanvas').getContext('2d');
    ctxHakki  = document.getElementById('hakkiCanvas').getContext('2d');

    birds    = {
      ceylan: { x: Math.round(W * 0.2), y: Math.round(H * 0.5), vel: 0, alive: true },
      hakki:  { x: Math.round(W * 0.2), y: Math.round(H * 0.5), vel: 0, alive: true },
    };
    pipes    = { ceylan: [], hakki: [] };
    scores   = { ceylan: 0, hakki: 0 };
    deaths   = { ceylan: 0, hakki: 0 };
    pipeTick = 0;
    gameRunning = true;

    document.addEventListener('keydown', handleKey);
    document.getElementById('ceylanCanvas').addEventListener('click',      () => flapMe('ceylan'));
    document.getElementById('hakkiCanvas').addEventListener('click',       () => flapMe('hakki'));
    document.getElementById('ceylanCanvas').addEventListener('touchstart', e  => { e.preventDefault(); flapMe('ceylan'); }, { passive: false });
    document.getElementById('hakkiCanvas').addEventListener('touchstart',  e  => { e.preventDefault(); flapMe('hakki');  }, { passive: false });

    loop();
  });

  window.addEventListener('resize', () => {
    resizeCanvases();
    if (birds.ceylan) { birds.ceylan.x = Math.round(W*0.2); birds.ceylan.y = Math.round(H*0.5); }
    if (birds.hakki)  { birds.hakki.x  = Math.round(W*0.2); birds.hakki.y  = Math.round(H*0.5); }
    pipes = { ceylan: [], hakki: [] };
  });
}

function handleKey(e) {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    flapMe(myName === 'Ceylan' ? 'ceylan' : 'hakki');
  }
}

function flapMe(role) {
  if (!gameRunning) return;
  const name = role === 'ceylan' ? 'Ceylan' : 'Hakkı';
  if (myName !== name) return; // sadece kendi kuşu
  birds[role].vel = FLAP_POWER;
  socket.emit('flap', { name });
}

// ── Boru ─────────────────────────────────────────────────
function addPipes() {
  pipeTick++;
  if (pipeTick < 90) return;
  pipeTick = 0;
  const topH = 40 + Math.random() * (H - PIPE_GAP - 80);
  pipes.ceylan.push({ x: W, topH, passed: false });
  pipes.hakki.push({  x: W, topH, passed: false });
}

// ── Güncelleme ───────────────────────────────────────────
function update() {
  addPipes();
  ['ceylan', 'hakki'].forEach(role => {
    const bird = birds[role];
    if (!bird.alive) return;

    bird.vel += GRAVITY;
    bird.y   += bird.vel;

    // Zemin
    if (bird.y + BIRD_RADIUS > H) {
      bird.y = H - BIRD_RADIUS;
      handleDeath(role);
      return;
    }
    // Tavan
    if (bird.y - BIRD_RADIUS < 0) { bird.y = BIRD_RADIUS; bird.vel = 0; }

    // Borular
    pipes[role].forEach(pipe => {
      pipe.x -= PIPE_SPEED;
      const inX = bird.x + BIRD_RADIUS > pipe.x && bird.x - BIRD_RADIUS < pipe.x + PIPE_WIDTH;
      const inY = bird.y - BIRD_RADIUS < pipe.topH || bird.y + BIRD_RADIUS > pipe.topH + PIPE_GAP;
      if (inX && inY) handleDeath(role);

      if (!pipe.passed && pipe.x + PIPE_WIDTH < bird.x) {
        pipe.passed = true;
        scores[role]++;
        updateScoreUI(role);
      }
    });

    pipes[role] = pipes[role].filter(p => p.x + PIPE_WIDTH > 0);
  });
}

// ── Ölüm ─────────────────────────────────────────────────
function handleDeath(role) {
  if (!birds[role].alive) return;
  birds[role].alive = false;
  deaths[role]++;
  updateDeathUI(role);

  const name = role === 'ceylan' ? 'Ceylan' : 'Hakkı';
  socket.emit('update_state', { name, score: scores[role], deaths: deaths[role] });

  // Kazanan kontrolü
  if (gameMode === 'Love') {
    // Aşk modunda her iki durumda da Ceylan kazanır
    if (deaths[role] >= deathLimit) { endGame('Ceylan'); return; }
  } else {
    // Normal mod: limite ulaşan kaybeder
    if (deaths[role] >= deathLimit) {
      endGame(role === 'ceylan' ? 'Hakkı' : 'Ceylan');
      return;
    }
  }

  // Yeniden doğ
  setTimeout(() => {
    if (!gameRunning) return;
    birds[role] = { x: Math.round(W*0.2), y: Math.round(H*0.5), vel: 0, alive: true };
    pipes[role] = [];
  }, 800);
}

// ── Oyun bitti ───────────────────────────────────────────
function endGame(winner) {
  if (!gameRunning) return;
  gameRunning = false;
  cancelAnimationFrame(animFrame);
  socket.emit('game_over', {
    winner,
    ceylan: { score: scores.ceylan, deaths: deaths.ceylan },
    hakki:  { score: scores.hakki,  deaths: deaths.hakki },
  });
  showGameOver(winner,
    { score: scores.ceylan, deaths: deaths.ceylan },
    { score: scores.hakki,  deaths: deaths.hakki },
    setup
  );
}

function showGameOver(winner, ceylan, hakki, s) {
  gameRunning = false;
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }

  document.getElementById('gameOverTitle').textContent =
    winner === 'Ceylan' ? '💕 Ceylan Kazandı! 🎉' : '🏆 Hakkı Kazandı! 🎉';
  document.getElementById('gameOverTitle').className =
    winner === 'Ceylan' ? 'love-win' : '';

  document.getElementById('finalScore1').textContent  = ceylan.score;
  document.getElementById('finalDeaths1').textContent = ceylan.deaths;
  document.getElementById('finalScore2').textContent  = hakki.score;
  document.getElementById('finalDeaths2').textContent = hakki.deaths;

  const betMsg = winner === 'Ceylan'
    ? (s.ceylanBet ? '🎁 Ceylan\'ın hakkı: ' + s.ceylanBet : '🎉 Ceylan kazandı!')
    : (s.hakkiBet  ? '🎁 Hakkı\'nın hakkı: '  + s.hakkiBet  : '🏆 Hakkı kazandı!');
  document.getElementById('betMessage').textContent = betMsg;
  document.getElementById('gameOverModal').classList.add('show');
}

// ── UI güncelleme ─────────────────────────────────────────
function updateScoreUI(role) {
  document.getElementById(role === 'ceylan' ? 'ceylanScore' : 'hakkiScore').textContent = scores[role];
  const name = role === 'ceylan' ? 'Ceylan' : 'Hakkı';
  socket.emit('update_state', { name, score: scores[role], deaths: deaths[role] });
}
function updateDeathUI(role) {
  document.getElementById(role === 'ceylan' ? 'ceylanDeaths' : 'hakkiDeaths').textContent = 'Ölüm: ' + deaths[role];
}

// ── Çizim ─────────────────────────────────────────────────
function loop() {
  if (!gameRunning) return;
  update();
  drawCeylan();
  drawHakki();
  animFrame = requestAnimationFrame(loop);
}

function drawBg(ctx, color) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#8B7355';
  ctx.fillRect(0, H - 10, W, 10);
}

function drawPipes(ctx, pipeList, color) {
  pipeList.forEach(pipe => {
    ctx.fillStyle = color;
    ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.topH);
    ctx.fillRect(pipe.x - 4, pipe.topH - 20, PIPE_WIDTH + 8, 20);
    const botY = pipe.topH + PIPE_GAP;
    ctx.fillRect(pipe.x, botY, PIPE_WIDTH, H - botY);
    ctx.fillRect(pipe.x - 4, botY, PIPE_WIDTH + 8, 20);
  });
}

function drawBird(ctx, bird, emoji) {
  if (!bird.alive) return;
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(Math.min(Math.max(bird.vel * 0.05, -0.5), 0.8));
  ctx.font = (BIRD_RADIUS * 2) + 'px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 0, 0);
  ctx.restore();
}

function drawOverlay(ctx, msg) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(msg, W / 2, H / 2);
}

function drawCeylan() {
  drawBg(ctxCeylan, '#e0f2ff');
  drawPipes(ctxCeylan, pipes.ceylan, '#4CAF50');
  drawBird(ctxCeylan, birds.ceylan, '👩');
  if (!birds.ceylan.alive) drawOverlay(ctxCeylan, '💥 Yeniden doğuyor…');
}

function drawHakki() {
  drawBg(ctxHakki, '#f0e0ff');
  drawPipes(ctxHakki, pipes.hakki, '#9C27B0');
  drawBird(ctxHakki, birds.hakki, '👨');
  if (!birds.hakki.alive) drawOverlay(ctxHakki, '💥 Yeniden doğuyor…');
}
