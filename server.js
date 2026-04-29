const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname)));

// Tek oda: iki kişilik oyun
let room = {
  players: {},       // socketId -> { name, role }
  roles: {},         // 'Ceylan' | 'Hakkı' -> socketId
  setup: {
    ceylanBet: null,
    hakkiBet: null,
    deathLimit: 3,
    mode: null
  },
  gameState: null,
  readyToStart: 0
};

function resetRoom() {
  room = {
    players: {},
    roles: {},
    setup: {
      ceylanBet: null,
      hakkiBet: null,
      deathLimit: 3,
      mode: null
    },
    gameState: null,
    readyToStart: 0
  };
}

io.on('connection', (socket) => {
  console.log('Bağlandı:', socket.id);

  // Kaç kişi bağlı
  const playerCount = Object.keys(room.players).length;

  if (playerCount >= 2) {
    socket.emit('room_full');
    return;
  }

  socket.emit('connection_ok', { playerCount });

  // --- KARAKTER SEÇİMİ ---
  socket.on('select_character', ({ name }) => {
    if (room.roles[name]) {
      socket.emit('character_taken', { name });
      return;
    }
    // Önceki rolü temizle
    for (const [role, sid] of Object.entries(room.roles)) {
      if (sid === socket.id) delete room.roles[role];
    }
    room.roles[name] = socket.id;
    room.players[socket.id] = { name, role: name };
    socket.emit('character_confirmed', { name });
    io.emit('room_status', {
      takenRoles: Object.keys(room.roles),
      playerCount: Object.keys(room.players).length
    });
  });

  // --- BET KAYDET ---
  socket.on('save_bet', ({ name, bet }) => {
    if (name === 'Ceylan') room.setup.ceylanBet = bet;
    if (name === 'Hakkı') room.setup.hakkiBet = bet;

    // İkisi de bet kaydetmişse haber ver
    if (room.setup.ceylanBet && room.setup.hakkiBet) {
      io.emit('both_bets_ready');
    } else {
      socket.emit('bet_saved');
    }
  });

  // --- CEYLAN GİZLİ AYAR ---
  socket.on('save_death_limit', ({ deathLimit }) => {
    room.setup.deathLimit = parseInt(deathLimit) || 3;
    socket.emit('death_limit_saved');
    // Hakkı'ya sıra bildirimi gönder (hazır olması için)
    const hakkiSocketId = room.roles['Hakkı'];
    if (hakkiSocketId) {
      io.to(hakkiSocketId).emit('ceylan_setup_done');
    }
  });

  // --- HAKKI MOD SEÇİMİ ---
  socket.on('save_mode', ({ mode }) => {
    room.setup.mode = mode;
    socket.emit('mode_saved');
  });

  // --- OYUN HAZIR ---
  socket.on('player_ready', () => {
    room.readyToStart++;
    if (room.readyToStart >= 2) {
      room.readyToStart = 0;
      room.gameState = {
        ceylan: { score: 0, deaths: 0, alive: true, x: 80, y: 150, vel: 0 },
        hakki:  { score: 0, deaths: 0, alive: true, x: 80, y: 150, vel: 0 },
        pipes: [],
        tick: 0,
        started: true,
        over: false
      };
      io.emit('game_start', { setup: room.setup });
    } else {
      socket.emit('waiting_for_other');
    }
  });

  // --- OYUNCU ATLAMA (flap) ---
  socket.on('flap', ({ name }) => {
    io.emit('player_flap', { name });
  });

  // --- SKOR / ÖLÜM GÜNCELLE ---
  socket.on('update_state', ({ name, score, deaths }) => {
    if (!room.gameState) return;
    const key = name === 'Ceylan' ? 'ceylan' : 'hakki';
    room.gameState[key].score = score;
    room.gameState[key].deaths = deaths;
    io.emit('state_update', {
      ceylan: room.gameState.ceylan,
      hakki: room.gameState.hakki
    });
  });

  // --- OYUN BİTTİ ---
  socket.on('game_over', ({ winner, ceylan, hakki }) => {
    if (room.gameState && !room.gameState.over) {
      room.gameState.over = true;
      io.emit('game_ended', {
        winner,
        ceylan,
        hakki,
        setup: room.setup
      });
    }
  });

  // --- BAĞLANTI KESİLDİ ---
  socket.on('disconnect', () => {
    console.log('Ayrıldı:', socket.id);
    const player = room.players[socket.id];
    if (player) {
      delete room.roles[player.name];
      delete room.players[socket.id];
      io.emit('player_disconnected', { name: player.name });
      io.emit('room_status', {
        takenRoles: Object.keys(room.roles),
        playerCount: Object.keys(room.players).length
      });
    }
    // Oda boşsa sıfırla
    if (Object.keys(room.players).length === 0) {
      resetRoom();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
