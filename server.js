const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Oyun oturumunu yönet
let gameRoom = {
  players: {},
  gameStarted: false,
  gameData: {
    ceylan: {
      name: '',
      bet: '',
      deathLimit: 0,
      isPlaying: true,
      currentScore: 0,
      deaths: 0
    },
    hakki: {
      name: '',
      bet: '',
      isPlaying: true,
      loveMode: false,
      currentScore: 0,
      deaths: 0
    }
  }
};

io.on('connection', (socket) => {
  console.log('Yeni kullanıcı bağlandı:', socket.id);

  // İlk oyuncu (Ceylan) veya ikinci oyuncu (Hakkı) ata
  const playerCount = Object.keys(gameRoom.players).length;
  
  if (playerCount === 0) {
    gameRoom.players[socket.id] = 'ceylan';
    socket.emit('playerAssigned', { role: 'ceylan' });
    io.emit('waitingForPlayer', { message: 'Hakkı\'yı bekliyorum...' });
  } else if (playerCount === 1) {
    gameRoom.players[socket.id] = 'hakki';
    socket.emit('playerAssigned', { role: 'hakki' });
    io.emit('bothPlayersReady', { message: 'Her iki oyuncu hazır!' });
  } else {
    socket.emit('roomFull', { message: 'Oda dolu! Başka bir zamanda deneyin.' });
    socket.disconnect();
    return;
  }

  // Oyun başlangıç ayarlarını al
  socket.on('gameSetup', (data) => {
    const playerRole = gameRoom.players[socket.id];
    
    if (playerRole === 'ceylan') {
      gameRoom.gameData.ceylan.name = data.name;
      gameRoom.gameData.ceylan.bet = data.bet;
      gameRoom.gameData.ceylan.deathLimit = data.deathLimit;
    } else if (playerRole === 'hakki') {
      gameRoom.gameData.hakki.name = data.name;
      gameRoom.gameData.hakki.bet = data.bet;
    }

    // Her iki oyuncu da hazırsa oyunu başlat
    if (gameRoom.gameData.ceylan.name && gameRoom.gameData.hakki.name) {
      gameRoom.gameStarted = true;
      io.emit('startGame', gameRoom.gameData);
    }
  });

  // Zıplama hareketi
  socket.on('jump', (data) => {
    const playerRole = gameRoom.players[socket.id];
    io.emit('playerJumped', { player: playerRole, timestamp: Date.now() });
  });

  // Ölüm olayı
  socket.on('playerDied', (data) => {
    const playerRole = gameRoom.players[socket.id];
    gameRoom.gameData[playerRole].deaths += 1;
    gameRoom.gameData[playerRole].currentScore = data.score;
    gameRoom.gameData[playerRole].isPlaying = false;

    // Aşk Modu kontrol et
    if (gameRoom.gameData.hakki.loveMode) {
      io.emit('gameOver', {
        winner: 'ceylan',
        reason: 'loveMode',
        ceylanDeaths: gameRoom.gameData.ceylan.deaths,
        hakkiDeaths: gameRoom.gameData.hakki.deaths,
        ceylanScore: gameRoom.gameData.ceylan.currentScore,
        hakkiScore: gameRoom.gameData.hakki.currentScore,
        ceylanBet: gameRoom.gameData.ceylan.bet,
        hakkiBet: gameRoom.gameData.hakki.bet
      });
      resetGame();
      return;
    }

    // Ölüm sınırına ulaştı mı kontrol et
    if (playerRole === 'ceylan' && gameRoom.gameData.ceylan.deaths >= gameRoom.gameData.ceylan.deathLimit) {
      io.emit('gameOver', {
        winner: 'hakki',
        reason: 'deathLimit',
        ceylanDeaths: gameRoom.gameData.ceylan.deaths,
        hakkiDeaths: gameRoom.gameData.hakki.deaths,
        ceylanScore: gameRoom.gameData.ceylan.currentScore,
        hakkiScore: gameRoom.gameData.hakki.currentScore,
        ceylanBet: gameRoom.gameData.ceylan.bet,
        hakkiBet: gameRoom.gameData.hakki.bet,
        deathLimit: gameRoom.gameData.ceylan.deathLimit
      });
      resetGame();
      return;
    }

    // Diğer oyuncuya bildir
    io.emit('updateDeaths', {
      ceylan: gameRoom.gameData.ceylan.deaths,
      hakki: gameRoom.gameData.hakki.deaths
    });
  });

  // Aşk Modu aktivasyon
  socket.on('activateLoveMode', () => {
    gameRoom.gameData.hakki.loveMode = true;
    io.emit('loveModeActivated', { message: '💕 Aşk Modu aktif!' });
  });

  // Skor güncelleme
  socket.on('updateScore', (data) => {
    const playerRole = gameRoom.players[socket.id];
    gameRoom.gameData[playerRole].currentScore = data.score;
    io.emit('scoreUpdated', {
      ceylan: gameRoom.gameData.ceylan.currentScore,
      hakki: gameRoom.gameData.hakki.currentScore
    });
  });

  // Bağlantı kesme
  socket.on('disconnect', () => {
    console.log('Kullanıcı ayrıldı:', socket.id);
    delete gameRoom.players[socket.id];
    
    if (Object.keys(gameRoom.players).length === 0) {
      resetGame();
    } else {
      io.emit('playerDisconnected', { message: 'Karşı oyuncu bağlantısı kesti.' });
    }
  });

  // Oyun sıfırla
  socket.on('resetGame', () => {
    resetGame();
  });
});

function resetGame() {
  gameRoom = {
    players: {},
    gameStarted: false,
    gameData: {
      ceylan: {
        name: '',
        bet: '',
        deathLimit: 0,
        isPlaying: true,
        currentScore: 0,
        deaths: 0
      },
      hakki: {
        name: '',
        bet: '',
        isPlaying: true,
        loveMode: false,
        currentScore: 0,
        deaths: 0
      }
    }
  };
  io.emit('gameReset');
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server çalışıyor: http://localhost:${PORT}`);
});
