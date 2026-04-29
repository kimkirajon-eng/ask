const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  upgradeTimeout: 30000,
});

app.use(express.static(path.join(__dirname)));

// Render uyku modunu önle: /ping endpoint
app.get('/ping', (req, res) => res.send('pong'));

// ─────────────────────────────────────────
function makeRoom() {
  return {
    players: {},     // socketId → { name }
    roles: {},       // 'Ceylan'|'Hakkı' → socketId
    setup: { ceylanBet: null, hakkiBet: null, deathLimit: 3, mode: null },
    gameState: null,
    readyToStart: 0,
    lastState: {},   // name → { score, deaths } — yeniden bağlanma için
  };
}
let room = makeRoom();

function resetRoom() {
  room = makeRoom();
  console.log('[room] sıfırlandı');
}

function broadcastRoomStatus() {
  io.emit('room_status', {
    takenRoles: Object.keys(room.roles),
    playerCount: Object.keys(room.players).length,
  });
}
// ─────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('[+]', socket.id);

  const playerCount = Object.keys(room.players).length;

  if (playerCount >= 2) {
    // Oda dolu — ama belki aynı kişi yeniledi, kontrol et
    socket.emit('room_full_check');
  } else {
    socket.emit('connection_ok', {
      playerCount,
      gameInProgress: !!(room.gameState && !room.gameState.over),
    });
  }

  // ── YENİDEN BAĞLANMA ─────────────────────────────────
  socket.on('rejoin', ({ name }) => {
    const oldSid = room.roles[name];
    if (oldSid && oldSid !== socket.id) {
      delete room.players[oldSid];
    }
    room.roles[name] = socket.id;
    room.players[socket.id] = { name };

    socket.emit('rejoin_ok', {
      name,
      setup: room.setup,
      gameState: room.gameState,
      lastState: room.lastState[name] || null,
    });

    broadcastRoomStatus();

    if (room.gameState && !room.gameState.over) {
      socket.emit('game_resume', { setup: room.setup, gameState: room.gameState });
    }
  });

  // ── KARAKTER SEÇİMİ ──────────────────────────────────
  socket.on('select_character', ({ name }) => {
    if (room.roles[name] && room.roles[name] !== socket.id) {
      socket.emit('character_taken', { name });
      return;
    }
    for (const [role, sid] of Object.entries(room.roles)) {
      if (sid === socket.id) delete room.roles[role];
    }
    room.roles[name] = socket.id;
    room.players[socket.id] = { name };
    socket.emit('character_confirmed', { name });
    broadcastRoomStatus();
  });

  // ── BAHİS ────────────────────────────────────────────
  socket.on('save_bet', ({ name, bet }) => {
    if (name === 'Ceylan') room.setup.ceylanBet = bet;
    if (name === 'Hakkı')  room.setup.hakkiBet  = bet;
    if (room.setup.ceylanBet && room.setup.hakkiBet) {
      io.emit('both_bets_ready');
    } else {
      socket.emit('bet_saved');
    }
  });

  // ── CEYLAN GİZLİ AYAR ────────────────────────────────
  socket.on('save_death_limit', ({ deathLimit }) => {
    room.setup.deathLimit = parseInt(deathLimit) || 3;
    socket.emit('death_limit_saved');
    const hakkiSid = room.roles['Hakkı'];
    if (hakkiSid) io.to(hakkiSid).emit('ceylan_setup_done');
  });

  // ── HAKKI MOD ────────────────────────────────────────
  socket.on('save_mode', ({ mode }) => {
    room.setup.mode = mode;
    socket.emit('mode_saved');
  });

  // ── HAZIR ────────────────────────────────────────────
  socket.on('player_ready', () => {
    room.readyToStart++;
    if (room.readyToStart >= 2) {
      room.readyToStart = 0;
      room.gameState = {
        ceylan: { score: 0, deaths: 0 },
        hakki:  { score: 0, deaths: 0 },
        over: false,
      };
      io.emit('game_start', { setup: room.setup });
    } else {
      socket.emit('waiting_for_other');
    }
  });

  // ── KUŞU ZIPLAT ──────────────────────────────────────
  socket.on('flap', ({ name }) => {
    io.emit('player_flap', { name });
  });

  // ── DURUM GÜNCELLE ───────────────────────────────────
 // ── DURUM GÜNCELLE ───────────────────────────────────
socket.on('update_state', ({ name, score, deaths, x, y, vel }) => {
  if (!room.gameState) return;
  const key = name === 'Ceylan' ? 'ceylan' : 'hakki';
  room.gameState[key].score  = score;
  room.gameState[key].deaths = deaths;
  room.gameState[key].x      = x;
  room.gameState[key].y      = y;
  room.gameState[key].vel    = vel;
  room.lastState[name] = { score, deaths, x, y, vel };
  io.emit('state_update', { ceylan: room.gameState.ceylan, hakki: room.gameState.hakki });
});

  // ── OYUN BİTTİ ───────────────────────────────────────
  socket.on('game_over', ({ winner, ceylan, hakki }) => {
    if (room.gameState && !room.gameState.over) {
      room.gameState.over = true;
      io.emit('game_ended', { winner, ceylan, hakki, setup: room.setup });
    }
  });

  // ── BAĞLANTI KESİLDİ ─────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log('[-]', socket.id, reason);
    const player = room.players[socket.id];
    if (!player) return;
    const { name } = player;

    // 15 sn grace period — geçici kopma ise yeniden bağlanabilir
    setTimeout(() => {
      if (room.roles[name] === socket.id) {
        delete room.roles[name];
        delete room.players[socket.id];
        console.log(`[timeout] ${name} kalıcı çıktı`);
        io.emit('player_disconnected', { name });
        broadcastRoomStatus();
        if (Object.keys(room.players).length === 0) resetRoom();
      }
    }, 15000);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
