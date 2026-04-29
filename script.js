const socket = io();
let myName = null, setup = { deathLimit: 3, mode: 'Normal' }, gameRunning = false;
let W, H, PIPE_GAP, PIPE_WIDTH, PIPE_SPEED, animFrame, ctxCeylan, ctxHakki;
const GRAVITY = 0.35, FLAP_POWER = -7, BIRD_RADIUS = 16;
let birds = {}, pipes = { ceylan: [], hakki: [] }, scores = { ceylan: 0, hakki: 0 }, deaths = { ceylan: 0, hakki: 0 }, pipeTick = 0;

// UI & Socket Listeners
socket.on('both_bets_ready', () => goToSecretScreen());
socket.on('ceylan_setup_done', () => { if(myName==='Hakkı') { hideWaiting(); showScreen('hakkiSecretScreen'); }});
socket.on('game_start', (data) => { setup = data.setup; hideWaiting(); startGame(); });
socket.on('player_flap', ({ name }) => { if(name !== myName) birds[name==='Ceylan'?'ceylan':'hakki'].vel = FLAP_POWER; });

// KRİTİK: Boru Senkronizasyonu
socket.on('sync_pipe', ({ topH }) => {
    const p = { x: W, topH, passed: false };
    pipes.ceylan.push({...p}); pipes.hakki.push({...p});
});

socket.on('state_update', (state) => {
    ['ceylan', 'hakki'].forEach(role => {
        if ((role === 'ceylan' && myName !== 'Ceylan') || (role === 'hakki' && myName !== 'Hakkı')) {
            birds[role].x = state[role].x; birds[role].y = state[role].y;
            birds[role].vel = state[role].vel; scores[role] = state[role].score;
            deaths[role] = state[role].deaths; updateScoreUI(role);
        }
    });
});

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
        gameRunning = true; loop();
    }, 100);
}

function addPipes() {
    pipeTick++;
    if (pipeTick < 90) return;
    pipeTick = 0;
    if (myName === 'Ceylan') {
        const topH = 40 + Math.random() * (H - PIPE_GAP - 80);
        const p = { x: W, topH, passed: false };
        pipes.ceylan.push({...p}); pipes.hakki.push({...p});
        socket.emit('new_pipe', { topH });
    }
}

function update() {
    addPipes();
    ['ceylan', 'hakki'].forEach(role => {
        const bird = birds[role];
        if (!bird.alive) return;
        bird.vel += GRAVITY; bird.y += bird.vel;
        if (bird.y + BIRD_RADIUS > H || bird.y - BIRD_RADIUS < 0) handleDeath(role);
        
        pipes[role].forEach(pipe => {
            pipe.x -= PIPE_SPEED;
            if (bird.x+BIRD_RADIUS > pipe.x && bird.x-BIRD_RADIUS < pipe.x+PIPE_WIDTH) {
                if (bird.y-BIRD_RADIUS < pipe.topH || bird.y+BIRD_RADIUS > pipe.topH+PIPE_GAP) handleDeath(role);
            }
            if (!pipe.passed && pipe.x + PIPE_WIDTH < bird.x) { pipe.passed = true; scores[role]++; }
        });
        pipes[role] = pipes[role].filter(p => p.x + PIPE_WIDTH > 0);
    });

    // Her karede kendi konumunu gönder
    const myRole = myName === 'Ceylan' ? 'ceylan' : 'hakki';
    socket.emit('update_state', { 
        name: myName, score: scores[myRole], deaths: deaths[myRole],
        x: birds[myRole].x, y: birds[myRole].y, vel: birds[myRole].vel 
    });
}

// Draw ve Diğer Fonksiyonlar (Aynı Kalacak...)
function loop() { if (!gameRunning) return; update(); drawCeylan(); drawHakki(); animFrame = requestAnimationFrame(loop); }
function drawCeylan() { drawBg(ctxCeylan, '#e0f2ff'); drawPipes(ctxCeylan, pipes.ceylan, '#4CAF50'); drawBird(ctxCeylan, birds.ceylan, '👩'); }
function drawHakki() { drawBg(ctxHakki, '#f0e0ff'); drawPipes(ctxHakki, pipes.hakki, '#9C27B0'); drawBird(ctxHakki, birds.hakki, '👨'); }
// ... (Geri kalan yardımcı fonksiyonlar - drawBg, drawBird, showScreen vb. önceki kodundaki gibi ekle)
