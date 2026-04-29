const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, transports: ['websocket', 'polling'] });

app.use(express.static(path.join(__dirname)));
app.get('/ping', (req, res) => res.send('pong'));

function makeRoom() {
  return {
    players: {}, roles: {}, readyToStart: 0,
    setup: { ceylanBet: null, hakkiBet: null, deathLimit: 3, mode: 'Normal' },
    gameState: null
  };
}
let room = makeRoom();

io.on('connection', (socket) => {
  socket.on('select_character', ({ name }) => {
    if (room.roles[name]) return socket.emit('character_taken', { name });
    room.roles[name] = socket.id;
    room.players[socket.id] = { name };
    socket.emit('character_confirmed', { name });
    io.emit('room_status', { takenRoles: Object.keys(room.roles) });
  });

  socket.on('save_bet', ({ name, bet }) => {
    if (name === 'Ceylan') room.setup.ceylanBet = bet;
    else room.setup.hakkiBet = bet;
    if (room.setup.ceylanBet && room.setup.hakkiBet) io.emit('both_bets_ready');
    else socket.emit('bet_saved');
  });

  socket.on('save_death_limit', ({ deathLimit }) => {
    room.setup.deathLimit = parseInt(deathLimit);
    socket.emit('death_limit_saved');
    if (room.roles['Hakkı']) io.to(room.roles['Hakkı']).emit('ceylan_setup_done');
  });

  socket.on('save_mode', ({ mode }) => {
    room.setup.mode = mode;
    socket.emit('mode_saved');
  });

  socket.on('player_ready', () => {
    room.readyToStart++;
    if (room.readyToStart >= 2) {
      room.readyToStart = 0;
      io.emit('game_start', { setup: room.setup });
    }
  });

  socket.on('new_pipe', (data) => socket.broadcast.emit('sync_pipe', data));
  socket.on('flap', ({ name }) => io.emit('player_flap', { name }));
  socket.on('update_state', (data) => socket.broadcast.emit('state_update', data));
  socket.on('game_over', (data) => io.emit('game_ended', { ...data, setup: room.setup }));
  socket.on('disconnect', () => { if (Object.keys(io.sockets.sockets).length === 0) room = makeRoom(); });
});

server.listen(process.env.PORT || 3000);
