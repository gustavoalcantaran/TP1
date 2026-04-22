import {createProgram, createShader} from "./gl-utils.js";
const { mat4 } = glMatrix;

/* ============================================
   SISTEMA DE ÁUDIO
   ============================================ */
//Configuração e Criação dos Sons
const volumeControl = document.getElementById('volume');
let masterVolume = 0.5;
const backgroundAudio = new Audio('Soundtrack.mp3');
backgroundAudio.loop = true;
backgroundAudio.volume = 0.5 * masterVolume;
const gameOverAudio = new Audio('Gameover.mp3');
gameOverAudio.loop = true;
gameOverAudio.volume = 0.5 * masterVolume;
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const SFX = {
    playShoot : function(volume = 0.5){
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
    },
    playHit : function(volume = 0.5) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'sawtooth';

        // Som curto e mais agressivo para indicar dano no player
        oscillator.frequency.setValueAtTime(320, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(90, audioCtx.currentTime + 0.18);

        gainNode.gain.setValueAtTime(volume * 0.7, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.18);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.2);
    },
    playExplosion : function(volume = 0.5){
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const bufferSize = audioCtx.sampleRate * 0.5; // 0.5 segundos de duração
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1; // Ruído branco
        }
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        
        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        noise.start();
    },
    playDiveBomb: function(volume = 0.5) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'triangle'; // Som mais liso, estilo vento
        
        // Começa agudo e vai caindo até ficar grave (simula o efeito Doppler)
        oscillator.frequency.setValueAtTime(1500, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 1.0); 

        // O som dura o tempo do rasante (~1 segundo)
        gainNode.gain.setValueAtTime(volume * 0.5, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.0);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 1.0);
    },
}

/* ============================================
   VARIÁVEIS DE RENDERIZAÇÃO (UNIFORMS E MATRIZES)
   ============================================ */
let bgOffsetY = 0;
let bgMatrix;

let u_colorLocation;        // Cor dos objetos renderizados
let u_modelMatrixLocation;  // Matriz de transformação

let shipMatrix, tempShotMatrix, tempEnemyMatrix, tempLifeMatrix, tempPerkMatrix;
let u_PointLocation;        // Flag para desenhar ponto colorido vs textura
let u_uvOffsetLocation;     // Offset para animação de spritesheet
let u_uvScaleLocation;      // Escala de UV para spritesheet

let lastTime = 0, deltaTime = 0, frameScale = 1;
const GAME_SPEED_MULTIPLIER = 1.8;  // Controle de tempo para alta taxa de refresh

/* ============================================
   ESTADO DO JOGO
   ============================================ */
const scene = {
    program: null,
    texture: null,
    enemyTexture : null,
    gameWidth: 200, 
    shipX : 100,
    shipY : 9,
};

// Template base para criar novos inimigos
const enemyTemplate = {
    x: 0,
    y: 0,
    dir: 1, // 1 para direita, -1 para esquerda
    active: true,
    points: 10, // Pontos que o enemy vale ao ser destruído
    type : 0, //Para saber qual textura usar e comportamento.
    attacking : false,
    returning : false,
    lastShootTime : 0,
};

/* ============================================
   SISTEMAS: INIMIGOS, TIROS, PERKS, EXPLOSÕES
   ============================================ */
const perks = [];  // Itens que caem quando inimigos morrem
let speedPerk = 0;
let shootPerk = 0;
let speedPerkDropping = 0;
let shootPerkDropping = 0;
let slowPerkTime = 0;

let enemies = [];      // Lista de inimigos ativos
const explosions = []; // Animações de explosão
let explosionMatrix;

const shoots = [];     // Tiros do jogador
let lastShootTime = 0;
const shootTemplate = {
    x: 0,
    y: 0,
    speed: 0.8,
};

const enemyShoots = [];  // Tiros dos inimigos
const enemyShootTemplate = {
    x : 0,
    y : 0,
    speedX : 0.5,
    speedY : 0.5,
};

/* ============================================
   ESTADO DO JOGO E UI
   ============================================ */
let life = 3, enemiesAlive = 0, rounds = 1;
const scoreElement = document.getElementById('score-ui');
let score = 0;  // Pontuação atual

const BestScoreElement = document.getElementById('best-score');
let bestScore = 0;

// Carregar melhor pontuação salva no localStorage
const storedBestScore = localStorage.getItem('bestScore');
if (storedBestScore !== null) {
    bestScore = parseInt(storedBestScore);
    if (BestScoreElement) BestScoreElement.innerText = `Melhor Pontuação: ${bestScore}`;
}

// Rastreamento de teclas pressionadas
const keys = {
    w : false, a : false, s : false, d : false,
    space : false, esc : false, r : false, c : false,
};

/* ============================================
   REFERÊNCIAS DOS MENUS
   ============================================ */
const pauseMenu = document.getElementById('menu-pausa');
const btnContinue = document.getElementById('btn-continuar');
const btnRestart = document.getElementById('btn-reiniciar');
const btnSettings = document.getElementById('btn-configuracoes');
const settingsMenu = document.getElementById('menu-configuracoes');
const btnBack = document.getElementById('btn-voltar');
const controlsMenu = document.getElementById('menu-controles');
const btnControls = document.getElementById('btn-controles');
const btnBack1 = document.getElementById('btn-voltar1');
const btnGameOver = document.getElementById('btn-reiniciar-game-over');
const gameoverMenu = document.getElementById('menu-game-over');
const startMenu = document.getElementById('menu-start');
const btnStart = document.getElementById('btn-start');
const btnControlsStart = document.getElementById('btn-controles-start');
const btnSettingsStart = document.getElementById('btn-configuracoes-start');
const gameOverScoreElement = document.getElementById('gameover-score');
const vitoriaMenu = document.getElementById('menu-vitoria');
const vitoriaScoreElement = document.getElementById('vitoria-score');
const BtnVitoriaContinue = document.getElementById('btn-continuar-vitoria');
const menuConfirmRestart = document.getElementById('menu-confirmacao-reinicio');
const btnConfirmRestart = document.getElementById('btn-confirmar-reinicio');
const btnCancelRestart = document.getElementById('btn-cancelar-reinicio');
let menuOrigin = null;  // Rastreia de qual menu o usuário veio

/* ============================================
   FUNÇÕES DE MENU
   ============================================ */
function updateMenuBackgroundByOrigin(menuElement) {
    if (!menuElement) return;
    const fromStartMenu = menuOrigin === startMenu;
    menuElement.classList.toggle('from-start', fromStartMenu);
}

function startGame() {
    initEnemies();
    backgroundAudio.play();
    gamePaused = false;
    enemiesAlive = enemies.length;
}

// Verifica se o jogador eliminou todos os inimigos
function checkWinCondition() {
    if(enemiesAlive <= 0){
        checkBestScore();
        vitoriaScoreElement.innerText = `Sua pontuação: ${score}`;
        gamePaused = true;
        vitoriaMenu.style.display = 'flex';
        pauseMenu.style.display = 'none';
        controlsMenu.style.display = 'none';
        settingsMenu.style.display = 'none';
    }
}

// Atualiza melhor pontuação se a atual for maior
function checkBestScore() {
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('bestScore', bestScore);
        if (BestScoreElement) BestScoreElement.innerText = `Melhor Pontuação: ${bestScore}`;
    }
}

// Inicializa configuração padrão de inimigos (3 linhas de combatentes + 2 chefes)
function initEnemies() {
    for (let i = 0; i < 6; i++){
        const enemy = {
            ...enemyTemplate,
            x : 40 + (i * 20),
            y : 130,
            type : 1,
            pback : [40 + (i * 20), 130]
        };
        enemies.push(enemy);
    }
    for (let i = 0; i < 8; i++){
        const enemy = {
            ...enemyTemplate,
            x : 20 + (i * 20),
            y : 150,
            type : 2,
            pback : [20 + (i * 20), 150]
        };
        enemies.push(enemy);
    }
    for (let i = 0; i < 6; i++){
        const enemy = {
            ...enemyTemplate,
            x : 40 + (i * 20),
            y : 170,
            type : 1, 
            pback : [40 + (i * 20), 170]
        };
        enemies.push(enemy);
    }
    for (let i = 0; i < 2; i++){
        const enemy = {
            ...enemyTemplate,
            x : 60 + (i*60),
            y : 190,
            type : 3+i,
            points : 50,
            pback : [60 + (i*60), 190]
        };
        enemies.push(enemy);
    }
}

function gameOver() {
    checkBestScore();
    gamePaused = true;
    gameOverScoreElement.innerText = `Sua pontuação: ${score}`;
    gameoverMenu.style.display = 'flex';
    backgroundAudio.pause();
    gameOverAudio.currentTime = 0;
    gameOverAudio.play();
}

/* ============================================
   SISTEMAS DE MOVIMENTO E FÍSICA
   ============================================ */
function moveShots() {
    for (let i = 0; i < shoots.length; i++) {
        shoots[i].y += shoots[i].speed * frameScale;
        if (shoots[i].y > 200) {
            shoots.splice(i, 1);
            i--;
        }
    }
}

// Verifica colisão entre tiro e inimigo usando distância (otimizado)
function checkPlayerShootCollision(shoot, enemy) {
    const distX = shoot.x - enemy.x;
    const distY = shoot.y - enemy.y;
    const distanceSquare = distX * distX + distY * distY;
    return distanceSquare < 51.1225;  // Raio combinado pré-calculado
}

function renderExplosion(ship) {
    explosions.push({
        x: ship.x,
        y: ship.y,
        startTime: performance.now(),
    });
}

// Chance de soltar perk ao destruir inimigo (maiores têm mais chance)
function dropPerks(enemy) {
    if (enemy.type < 3 && Math.random() > 0.2) return;
    const perksToDrop = [];
    if (shootPerkDropping === 0 && shootPerk < rounds+2){
        perksToDrop.push('shoot');
    }
    if (speedPerkDropping === 0 && speedPerk < rounds+2){
        perksToDrop.push('speed');
    }
    perksToDrop.push('slow');
    const chance = Math.random();
    const selected = Math.floor(chance * perksToDrop.length);
    const perkType = perksToDrop[selected];
    if (perkType === 'shoot') {
        shootPerkDropping = 1;
    } else if (perkType === 'speed') {
        speedPerkDropping = 1;
    }
    perks.push({
        x: enemy.x,
        y: enemy.y,
        type: perkType,
        speed: 0.3,
    });
}

function movePerks() {
    for (let i = 0; i < perks.length; i++) {
        perks[i].y -= perks[i].speed * frameScale;  // Perks fluem para cima
        if (perks[i].y < 0) {
            if (perks[i].type === 'shoot') {
                shootPerkDropping = 0;
            }
            else if (perks[i].type === 'speed') {
                speedPerkDropping = 0;
            }
            perks.splice(i, 1);
            i--;
        }
    }
}

// Detecta colisão da nave com perks
function collectPerks() {
    for (let i = 0; i < perks.length; i++) {
        const distX = perks[i].x - scene.shipX;
        const distY = perks[i].y - scene.shipY;
        const distanceSquare = distX * distX + distY * distY;
        if (distanceSquare < 462.25){
            if (perks[i].type === 'shoot') {
                shootPerkDropping = 0;
                shootPerk++;
            }
            else if (perks[i].type === 'speed') {
                speedPerkDropping = 0;
                speedPerk++;
            }
            else if (perks[i].type === 'slow') {
                slowPerkTime = performance.now();
            }
            perks.splice(i, 1);
        }
    }
}

// Verifica colisão entre tiros do jogador e inimigos
function updateCollisionEnemies() {
    for (let i = 0; i < shoots.length; i++) {
        const shoot = shoots[i];
        let shotHit = false;
        for (let enemy of enemies) {
            if (!enemy.active) continue;
            if (checkPlayerShootCollision(shoot, enemy)) {
                enemy.active = false; // Inimigo é destruído
                shotHit = true;
                score += enemy.points * (rounds*0.5); // Incrementa a pontuação
                scoreElement.innerText = `Score: ${score}`;
                dropPerks(enemy);
                SFX.playExplosion(masterVolume);
                renderExplosion(enemy);
                enemiesAlive--;
                break; // Para de checar outros enemies para esse tiro
            }
        }
        if (shotHit) {
            shoots.splice(i, 1); // Remove o tiro que colidiu
            i--; // Ajusta o índice após remoção
        }
    }
}

// Movimenta inimigos em bloco e aplica lógica de ataque rasante
function moveEnemies() {
    const slowActive = slowPerkTime !== 0 && (performance.now() - slowPerkTime < 2000);
    const enemyMoveFactor = slowActive ? 0.5 : 1;  // Reduz velocidade se perk ativo
    let hittedwall = false;
    for (let enemy of enemies){
        if (!enemy.active) continue;
        if (enemy.pback[0] + (0.2 * rounds * enemyMoveFactor * enemy.dir * frameScale) > 190 || enemy.pback[0] + (0.2 * rounds * enemyMoveFactor * enemy.dir * frameScale) < 10) {
            hittedwall = true;
            break;
        }
        if (enemy.pback[1] < 0) {
            gameOver();
        }
    }
    for (let enemy of enemies){
        if (!enemy.active) continue;

        let movX = 0;
        let movY = 0;

        if (hittedwall) {
            movY -= 10 * enemyMoveFactor * frameScale;
            enemy.dir *= -1;
        } else {
            movX += 0.15 * rounds * enemyMoveFactor * enemy.dir * frameScale;
        }
        
        enemy.pback[0] += movX;
        enemy.pback[1] += movY;

        if (enemy.attacking) {
            enemy.t += 0.005 * enemyMoveFactor * frameScale;
            if (enemy.t >= 1) {
                startReturning(enemy);
            } else {
                const pos = calcBezier(enemy.p0, enemy.p1, enemy.p2, enemy.p3, enemy.t);
                enemy.x = pos[0];
                enemy.y = pos[1];
            }
        } else if (enemy.returning) {
            enemy.p3 = [enemy.pback[0], enemy.pback[1]];

            enemy.t += 0.005 * enemyMoveFactor * frameScale;

            if (enemy.t >= 1) {
                enemy.returning = false;
                enemy.x = enemy.pback[0];
                enemy.y = enemy.pback[1];
            } else {
                const pos = calcBezier(enemy.p0, enemy.p1, enemy.p2, enemy.p3, enemy.t);
                enemy.x = pos[0];
                enemy.y = pos[1];
            }
        } else {
            enemy.x = enemy.pback[0];
            enemy.y = enemy.pback[1];
        }
    }
}

let lastEnemyAttackingTime = 0;

// Seleciona aleatoriamente um inimigo para fazer rasante (a cada 2 segundos)
function selectEnemyToAttack() {
    const currentTime = performance.now();
    if (currentTime - lastEnemyAttackingTime < 2000) return; // Ataca a cada 2 segundos
    lastEnemyAttackingTime = currentTime;
    const aliveEnemies = enemies.filter(e => e.active 
        && !e.attacking && !e.returning 
        && e.type < 3);
    if (aliveEnemies.length > 0) {
        const enemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        startSkimming(enemy, scene.shipX, scene.shipY);
    }
    
}

// Curva de Bézier cúbica: interpola posição suave para ataque rasante
function calcBezier(p0, p1, p2, p3, t) {
    const u = 1 - t, tt = t * t, uu = u * u, uuu = uu * u, ttt = tt * t;
    const x = uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0];
    const y = uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1];
    return [x, y];
}

// Inicia ataque rasante de um inimigo em direção ao jogador
function startSkimming(enemy, targetX, targetY) {
    SFX.playDiveBomb(masterVolume);
    enemy.attacking = true;
    enemy.t = 0;
    enemy.pback = [enemy.x, enemy.y];
    enemy.p0 = [enemy.x, enemy.y];
    enemy.p1 = [enemy.x + 30, enemy.y + 20];
    enemy.p2 = [targetX + 60, targetY + 40];
    enemy.p3 = [targetX, -20];
}

// Retorna inimigo à formação após rasante
function startReturning(enemy) {
    enemy.attacking = false;
    enemy.returning = true;
    enemy.t = 0;
    enemy.p0 = [100, 220];
    enemy.p1 = [10, enemy.y/2];
    enemy.p2 = [190, enemy.pback[1] + 50];
    enemy.p3 = enemy.pback;
}

// Inimigos atiram em direção ao jogador com intervalo baseado na fase
function enemyShoot(enemy, targetX, targetY) {
    const currentTime = performance.now();
    if (currentTime - enemy.lastShootTime < 700 * (4 / rounds)) return;  // Cadência aumenta a cada fase
    enemy.lastShootTime = currentTime;
    const distX = targetX - enemy.x;
    const distY = targetY - enemy.y;
    const angle = Math.atan2(distY, distX);
    const speed = 0.6;
    const velocityX = Math.cos(angle) * speed;
    const velocityY = Math.sin(angle) * speed;
    enemyShoots.push({
        x: enemy.x,
        y: enemy.y,
        speedX: velocityX,
        speedY: velocityY,
    });
}

function makeEnemiesShoot() {
    // Inimigos em ataque rasante atiram em direção ao jogador
    for (let enemy of enemies) {
        if (enemy.attacking && enemy.active) {
            enemyShoot(enemy, scene.shipX, scene.shipY);
        }
    }
}

function moveEnemyShoots() {
    for (let i = 0; i < enemyShoots.length; i++) {
        enemyShoots[i].x += enemyShoots[i].speedX * frameScale;  // Tiros inimigos seguem trajetória calculada
        enemyShoots[i].y += enemyShoots[i].speedY * frameScale;

        if (enemyShoots[i].x < 0 
            || enemyShoots[i].x > 200 
            || enemyShoots[i].y < 0 
            || enemyShoots[i].y > 200) {
            enemyShoots.splice(i, 1);
            i--;
        }
    }
}

// Detecta colisão entre tiros inimigos e nave do jogador
function checkEnemyShootCollision() {
    for (let i = 0; i < enemyShoots.length; i++) {
        const shoot = enemyShoots[i];
        const distX = shoot.x - scene.shipX;
        const distY = shoot.y - scene.shipY;
        const distanceSquare = distX * distX + distY * distY;
        const radiusSumSquare = 51.1225; // Raio da nave + raio do tiro (7.15^2)
        if (distanceSquare < radiusSumSquare) {
            SFX.playHit(masterVolume);
            life--;
            enemyShoots.splice(i, 1);
            i--;
        }
        if (life <= 0) {
            renderExplosion({ x: scene.shipX, y: scene.shipY });
            gameOver();
        }
    }
}

let gamePaused = true;

/* ============================================
   ENTRADA DO USUÁRIO E EVENTOS DE TECLADO
   ============================================ */
volumeControl.addEventListener('input', (event) => {
    masterVolume = event.target.value;
    backgroundAudio.volume = masterVolume * 0.5;
    gameOverAudio.volume = masterVolume * 0.5;
});

btnContinue.addEventListener('click', () => {
    gamePaused = false;
    pauseMenu.style.display = 'none';
});

btnRestart.addEventListener('click', () => {
    pauseMenu.style.display = 'none';
    menuConfirmRestart.style.display = 'flex';
});

btnConfirmRestart.addEventListener('click', () => {
    resetGame();
    gamePaused = false;
    settingsMenu.style.display = 'none';
    pauseMenu.style.display = 'none';
    menuConfirmRestart.style.display = 'none';
});

btnCancelRestart.addEventListener('click', () => {
    menuConfirmRestart.style.display = 'none';
    pauseMenu.style.display = 'flex';
});

btnSettings.addEventListener('click', () => {
    pauseMenu.style.display = 'none';
    menuOrigin = pauseMenu;
    updateMenuBackgroundByOrigin(settingsMenu);
    settingsMenu.style.display = 'flex';
});

btnBack1.addEventListener('click', () => {
    settingsMenu.style.display = 'none';
    menuOrigin.style.display = 'flex';
});

btnBack.addEventListener('click', () => {
    controlsMenu.style.display = 'none';
    menuOrigin.style.display = 'flex';
});

btnControls.addEventListener('click', () => {
    pauseMenu.style.display = 'none';
    settingsMenu.style.display = 'none';
    menuOrigin = pauseMenu;
    updateMenuBackgroundByOrigin(controlsMenu);
    controlsMenu.style.display = 'flex';
});

btnGameOver.addEventListener('click', () => {
    resetGame();
    gameoverMenu.style.display = 'none';
    gamePaused = false;
    backgroundAudio.currentTime = 0;
    backgroundAudio.play();
    gameOverAudio.pause();
});

btnStart.addEventListener('click', () => {
    startGame();
    startMenu.style.display = 'none';
    backgroundAudio.currentTime = 0;
    backgroundAudio.play();
});

btnControlsStart.addEventListener('click', () => {
    startMenu.style.display = 'none';
    menuOrigin = startMenu;
    updateMenuBackgroundByOrigin(controlsMenu);
    controlsMenu.style.display = 'flex';
});

btnSettingsStart.addEventListener('click', () => {
    startMenu.style.display = 'none';
    menuOrigin = startMenu;
    updateMenuBackgroundByOrigin(settingsMenu);
    settingsMenu.style.display = 'flex';
});

BtnVitoriaContinue.addEventListener('click', () => {
    vitoriaMenu.style.display = 'none';
    gamePaused = false;
    rounds++;
    enemies.length = 0; // Limpa os inimigos 
    initEnemies();//Inicia Inimigos
    enemiesAlive = enemies.length;
    shoots.length = 0; // Limpa os tiros ativos
    enemyShoots.length = 0; // Limpa os tiros inimigos ativos
    scene.shipX = 100;
    scene.shipY = 9;
});

function resetGame() {
    // Reseta todos os sistemas para início de novo jogo
    perks.length = 0;
    shootPerk = 0;
    speedPerk = 0;
    speedPerkDropping = 0;
    shootPerkDropping = 0;
    slowPerkTime = 0;
    rounds = 1;
    score = 0;
    life = 3;
    scene.shipX = 100;
    scene.shipY = 9;
    enemies.length = 0; // Limpa os inimigos ativos
    initEnemies();//Inicia Inimigos
    enemiesAlive = enemies.length;
    shoots.length = 0; // Limpa os tiros ativos
    enemyShoots.length = 0; // Limpa os tiros inimigos ativos
    document.getElementById('score-ui').innerText = `Score: ${score}`;
}

function keyboardHandler() {
    const speed = 30;
    const movementStep = speed * deltaTime * GAME_SPEED_MULTIPLIER;
    const speedBonus = 0.1 * speedPerk * frameScale;  // Bônus de velocidade por perk
    const isMenuVisible = vitoriaMenu.style.display === 'flex' || 
                          gameoverMenu.style.display === 'flex' || 
                          getComputedStyle(startMenu).display === 'flex' || 
                          menuConfirmRestart.style.display === 'flex';
    
    // Não permite movimento se algum menu estiver aberto
    if (isMenuVisible) {
        return;
    }
    if (keys.w && scene.shipY < 191 && !gamePaused){
            scene.shipY += movementStep + speedBonus;
    }
    if (keys.s && scene.shipY > 9 && !gamePaused){
            scene.shipY -= movementStep + speedBonus;
    }
    if (keys.a && scene.shipX > 16 && !gamePaused){
            scene.shipX -= movementStep + speedBonus;
    }
    if (keys.d && scene.shipX < 184 && !gamePaused){
            scene.shipX += movementStep + speedBonus;
    }
    const currentTime = performance.now();
    if (keys.space && (currentTime - lastShootTime > 500 - shootPerk * 50) && !gamePaused) {
        const centroX = scene.shipX;
        const topoY = scene.shipY + 5;
        shoots.push({ x: centroX, y: topoY, speed: 0.8 });  // Tiro sai do centro da nave
        lastShootTime = currentTime;
        SFX.playShoot(masterVolume);
    }
    if (keys.r){
        gamePaused = true;
        settingsMenu.style.display = 'none';
        pauseMenu.style.display = 'none';
        menuConfirmRestart.style.display = 'flex';
    }
    if (keys.esc) {
        keys.esc = false; // Consumimos a tecla
        if (settingsMenu.style.display === 'flex' || controlsMenu.style.display === 'flex') {
            settingsMenu.style.display = 'none';
            controlsMenu.style.display = 'none';
            if (menuOrigin === startMenu) {
                startMenu.style.display = 'flex';
                gamePaused = true;
            } else {
                pauseMenu.style.display = 'flex';
                gamePaused = true;
            }
        } else if (pauseMenu.style.display === 'flex') {
            pauseMenu.style.display = 'none';
            gamePaused = false;
        } else {
            pauseMenu.style.display = 'flex';
            gamePaused = true;
        }
    }
    if (keys.c) {
        keys.c = false; // Consumimos a tecla
        gamePaused = true; // Força o jogo a ficar pausado para mostrar o menu de configurações
        if (gamePaused) {
            if (settingsMenu.style.display === 'flex') {
                settingsMenu.style.display = 'none';
                if (menuOrigin === startMenu) {
                    startMenu.style.display = 'flex';
                } else {
                    pauseMenu.style.display = 'none';
                    gamePaused = false;
                }
            } else {
                menuOrigin = (startMenu.style.display === 'flex') ? startMenu : pauseMenu;
                updateMenuBackgroundByOrigin(settingsMenu);
                if (menuOrigin === startMenu) {
                    startMenu.style.display = 'none';
                } else {
                    pauseMenu.style.display = 'none';
                }
                settingsMenu.style.display = 'flex';   
            }
        }
    }
}

window.addEventListener('keydown', (event) => {
    // Rastreia teclas pressionadas
    if ((event.key === ' ')){
        keys.space = true;
    }
    if ((event.key.toLowerCase() === 'w' || event.key === 'ArrowUp')){
        keys.w = true;
    }
    if ((event.key.toLowerCase() === 's' || event.key === 'ArrowDown')){
        keys.s = true;
    }
    if ((event.key.toLowerCase() === 'a' || event.key === 'ArrowLeft')){
        keys.a = true;
    }
    if ((event.key.toLowerCase() === 'd' || event.key === 'ArrowRight')){
        keys.d = true;
    }
    if ((event.key.toLowerCase() === 'r')){
        keys.r = true;
    }
    if (event.key === 'Escape'){
        keys.esc = true;
    }
    if ((event.key.toLowerCase() === 'c')){
        keys.c = true;
    }
});

window.addEventListener('keyup', (event) => {
    // Rastreia teclas soltas
    if ((event.key === ' ')){
        keys.space = false;
    }
    if ((event.key.toLowerCase() === 'w' || event.key === 'ArrowUp')){
        keys.w = false;
    }
    if ((event.key.toLowerCase() === 's' || event.key === 'ArrowDown')){
        keys.s = false;
    }
    if ((event.key.toLowerCase() === 'a' || event.key === 'ArrowLeft')){
        keys.a = false;
    }
    if ((event.key.toLowerCase() === 'd' || event.key === 'ArrowRight')){
        keys.d = false;
    }
    if ((event.key.toLowerCase() === 'r')){
        keys.r = false;
    }
    if (event.key === 'Escape'){
        keys.esc = false;
    }
    if ((event.key.toLowerCase() === 'c')){
        keys.c = false;
    }
});

/* ============================================
   MATRIZES E UTILITÁRIOS DE TRANSFORMAÇÃO
   ============================================ */
function translate(matrix, tx, ty, tz) {
    matrix[12] = tx;
    matrix[13] = ty;
    matrix[14] = tz;
}

function rotate(matrix, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    matrix[0] = c;
    matrix[1] = s;
    matrix[4] = -s;
    matrix[5] = c;
}

/* ============================================
   WEBGL SETUP E INICIALIZAÇÃO
   ============================================ */
export function setupWebGL() {
    const canvas = document.querySelector(".example-canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) {
        console.error("WebGL2 não está disponível");
        throw new Error("WebGL2 não suportado");
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    return gl;
}

export function initialize(gl) {
    // Carrega e compila shaders
    const vertexShaderSource = document.querySelector('script[type="shader/vertex"]').textContent;
    const fragmentShaderSource = document.querySelector('script[type="shader/fragment"]').textContent;
    
    const program = createProgram(gl, 
        createShader(gl, 'vertex', gl.VERTEX_SHADER, vertexShaderSource),
        createShader(gl, 'fragment', gl.FRAGMENT_SHADER, fragmentShaderSource)
    );
    scene.program = program;
    gl.useProgram(program);
    
    // Matriz de projeção 
    const projectionUniformLocation = gl.getUniformLocation(program, "projection");
    const projectionMatrix = ortho(0, 200, 0, 200, -1, 1);
    gl.uniformMatrix4fv(projectionUniformLocation, false, projectionMatrix);
    
    // Uniform para a matriz de modelo
    u_modelMatrixLocation = gl.getUniformLocation(program, "model");
    
    // Uniform de textura definido
    const textureUniformLocation = gl.getUniformLocation(program, "u_texture");
    gl.uniform1i(textureUniformLocation, 0);

    //Uniform para ver se é cor ou textura
    u_PointLocation = gl.getUniformLocation(program, "u_isPoint");

    //Uniform para setar as cores
    u_colorLocation = gl.getUniformLocation(program, "u_color");

    //Uniform para controlar as texturas com animações
    u_uvOffsetLocation = gl.getUniformLocation(program, "u_uvOffset");
    u_uvScaleLocation = gl.getUniformLocation(program, "u_uvScale");

    // --- SETUP DOS BUFFERS --- Pensei em usar somente um VAO e um VBO para os enemies, 
    // tiros e nave, já que todos são quadrados ou retângulos.
    const baseShape = new Float32Array([
        -0.5, -0.5, 0.0, // baixo-esquerda
        0.5, -0.5, 0.0, // baixo-direita
        0.5, 0.5, 0.0, // cima-direita
        -0.5, 0.5, 0.0, // cima-esquerda
    ]);

    // Definir coordenadas de textura (vec2)
    const texCoords = new Float32Array([
        0, 0,
        1, 0,
        1, 1,
        0, 1
    ]);
    
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    scene.universalVao = vao;

    // Buffer de posição
    const positionBuffer = gl.createBuffer();
    scene.positionBuffer = positionBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, baseShape, gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    // Buffer de coordenadas de textura
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    // Mat4.create() para não pesar em outra parte do código
    shipMatrix = new Float32Array(16);
    tempShotMatrix = new Float32Array(16);
    tempEnemyMatrix = new Float32Array(16);
    explosionMatrix = new Float32Array(16);
    bgMatrix = new Float32Array(16);
    tempLifeMatrix = new Float32Array(16);
    tempPerkMatrix = new Float32Array(16);

    // --- SETUP DAS TEXTURAS ---
    const texture = gl.createTexture();
    scene.texture = texture;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 255, 255])
    );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.enable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    const image = new Image();
    image.onload = () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);
        render(gl);
    };
    image.src = './assets/ship.png';

    // --- TEXTURAS DOS INIMIGOS ---
    const texEnemy1 = gl.createTexture();
    scene.enemyTexture1 = texEnemy1;
    gl.bindTexture(gl.TEXTURE_2D, texEnemy1);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const imgEnemy = new Image();
    imgEnemy.onload = () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texEnemy1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgEnemy);
        gl.generateMipmap(gl.TEXTURE_2D);
        console.log("Textura do enemy carregada com sucesso.");
    }
    imgEnemy.onerror = () => {
        console.error('Falha ao carregar enemie_ship.png. Verifique se o nome e o formato estão corretos na sua pasta.');
    }
    imgEnemy.src = './assets/enemie_ship.png';

    const texEnemy2 = gl.createTexture();
    scene.enemyTexture2 = texEnemy2;
    gl.bindTexture(gl.TEXTURE_2D, texEnemy2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const imgEnemy2 = new Image();
    imgEnemy2.onload = () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texEnemy2);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgEnemy2);
        gl.generateMipmap(gl.TEXTURE_2D);
        console.log("Textura do enemy 2 carregada com sucesso.");
    }
    imgEnemy2.onerror = () => {
        console.error('Falha ao carregar enemie_ship2.png. Verifique se o nome e o formato estão corretos na sua pasta.');
    }
    imgEnemy2.src = './assets/enemie_ship2.png';

    const texBoss1 = gl.createTexture();
    scene.textureBoss1 = texBoss1;
    gl.bindTexture(gl.TEXTURE_2D, texBoss1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const imgBoss1 = new Image();
    imgBoss1.onload = () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texBoss1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgBoss1);
        gl.generateMipmap(gl.TEXTURE_2D);
        console.log("Textura do boss carregada com sucesso.");
    }
    imgBoss1.onerror = () => {
        console.error('Falha ao carregar boss_ship.png. Verifique se o nome e o formato estão corretos na sua pasta.');
    }
    imgBoss1.src = './assets/enemie_ship_boss.png';
    
    const texBoss2 = gl.createTexture();
    scene.textureBoss2 = texBoss2;
    gl.bindTexture(gl.TEXTURE_2D, texBoss2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const imgBoss2 = new Image();
    imgBoss2.onload = () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texBoss2);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgBoss2);
        gl.generateMipmap(gl.TEXTURE_2D);
        console.log("Textura do boss 2 carregada com sucesso.");
    }
    imgBoss2.onerror = () => {
        console.error('Falha ao carregar boss_ship2.png. Verifique se o nome e o formato estão corretos na sua pasta.');
    }
    imgBoss2.src = './assets/enemie_ship_boss2.png';

    const texExplosion = gl.createTexture();
    scene.textureExplosion = texExplosion;
    gl.bindTexture(gl.TEXTURE_2D, texExplosion);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const imgExplosion = new Image();
    imgExplosion.onload = () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texExplosion);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgExplosion);
        gl.generateMipmap(gl.TEXTURE_2D);
        console.log("Textura da explosão carregada com sucesso.");
    }
    imgExplosion.onerror = () => {
        console.error('Falha ao carregar explosion.png. Verifique se o nome e o formato estão corretos na sua pasta.');
    }
    imgExplosion.src = './assets/explosion.png';

    const texBackground = gl.createTexture();
    scene.textureBackground = texBackground;
    gl.bindTexture(gl.TEXTURE_2D, texBackground);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const imgBackground = new Image();
    imgBackground.onload = () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texBackground);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgBackground);
        gl.generateMipmap(gl.TEXTURE_2D);
        console.log("Textura de fundo carregada com sucesso.");
    }
    imgBackground.onerror = () => {
        console.error('Falha ao carregar Fundo.png. Verifique se o nome e o formato estão corretos na sua pasta.');
    }
    imgBackground.src = './assets/Fundo.png';

    const texLife = gl.createTexture();
    scene.textureLife = texLife;
    gl.bindTexture(gl.TEXTURE_2D, texLife);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const imgLife = new Image();
    imgLife.onload = () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texLife);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgLife);
        gl.generateMipmap(gl.TEXTURE_2D);
        console.log("Textura de vida carregada com sucesso.");
    }
    imgLife.onerror = () => {
        console.error('Falha ao carregar life.png. Verifique se o nome e o formato estão corretos na sua pasta.');
    }
    imgLife.src = './assets/life.png';

    const texPerks = gl.createTexture();
    scene.texturePerks = texPerks;
    gl.bindTexture(gl.TEXTURE_2D, texPerks);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const imgPerks = new Image();
    imgPerks.onload = () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texPerks);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgPerks);
        gl.generateMipmap(gl.TEXTURE_2D);
        console.log("Textura de perks carregada com sucesso.");
    }
    imgPerks.onerror = () => {
        console.error('Falha ao carregar perks.png. Verifique se o nome e o formato estão corretos na sua pasta.');
    }
    imgPerks.src = './assets/perks.png';
}

function ortho(left, right, bottom, top, near, far) {
    // Matriz de projeção ortográfica (sem perspectiva)
    const tx = -(right + left) / (right - left);
    const ty = -(top + bottom) / (top - bottom);
    const tz = -(far + near) / (far - near);
    return new Float32Array([
        2 / (right - left), 0, 0, 0,
        0, 2 / (top - bottom), 0, 0,
        0, 0, -2 / (far - near), 0,
        tx, ty, tz, 1
    ]);
}

export function render(gl, currentTime) {
    // Cálculo de deltaTime para compatibilidade com diferentes taxa de refresh
    if (!currentTime) currentTime = performance.now();
    deltaTime = lastTime === 0 ? 0 : (currentTime - lastTime) / 1000;
    if (deltaTime > 0.1) deltaTime = 0.1;  // Cap deltaTime para evitar saltos grandes
    frameScale = deltaTime * 60 * GAME_SPEED_MULTIPLIER;
    lastTime = currentTime;

    // Lógica do jogo rodando enquanto despausa
    keyboardHandler();
    if (!gamePaused) {
        moveShots();
        updateCollisionEnemies();  // Verifica tiros do jogador colidindo com inimigos
        moveEnemies();             // Move inimigos e seleciona quem ataca
        selectEnemyToAttack();
        moveEnemyShoots();         // Move tiros inimigos
        makeEnemiesShoot();        // Inimigos atacando atiram
        checkEnemyShootCollision(); // Verifica dano ao jogador
        checkWinCondition();       // Verifica vitória
        collectPerks();            // Jogador coleta itens
        movePerks();               // Perks fluem para cima
        bgOffsetY += 0.002 * frameScale;  // Animação de fundo
        if(bgOffsetY >= 1) bgOffsetY = -1;
    }

    //Limpa a Tela
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(scene.universalVao);
    
    /* ============================================
       RENDERIZAÇÃO
       ============================================ */
    
    /* ---- FUNDO ---- */
    gl.uniform1i(u_PointLocation, 0);
    gl.uniform2f(u_uvScaleLocation, 1.0, 1.0);
    gl.uniform2f(u_uvOffsetLocation, 0.0, bgOffsetY);
    mat4.identity(bgMatrix);
    translate(bgMatrix,100, 100, 0);
    mat4.scale(bgMatrix, bgMatrix, [200, 200, 1]);
    gl.uniformMatrix4fv(u_modelMatrixLocation, false, bgMatrix);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.textureBackground);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    //--- RENDERIZAÇÃO DA NAVE ---
    gl.uniform2f(u_uvScaleLocation, 1/4, 1.0);  // 4 frames (parado, esq, dir, baixo)
    gl.uniform2f(u_uvOffsetLocation, 0.0, 0.0);
    if (life > 0) {
        // Animação da nave conforme direção
        if(keys.w || keys.a && keys.d){
            gl.uniform2f(u_uvOffsetLocation, 0, 0.0);
        }else if (keys.a){
            gl.uniform2f(u_uvOffsetLocation, 2/4, 0.0);
        }else if (keys.d){
            gl.uniform2f(u_uvOffsetLocation, 1/4, 0.0);
        }else if (keys.s){
            gl.uniform2f(u_uvOffsetLocation, 3/4, 0.0);
        }
        gl.uniform1i(u_PointLocation, 0); 
        // Configura a matriz de modelo da nave combinando Translação e Escala
        mat4.identity(shipMatrix);
        translate(shipMatrix,scene.shipX, scene.shipY, 0);
        mat4.scale(shipMatrix, shipMatrix, [33, 33, 1]);
        // Passa a matriz correta (com tamanho e posição) para o vertex shader
        gl.uniformMatrix4fv(u_modelMatrixLocation, false, shipMatrix);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, scene.texture);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }
    
    //--- RENDERIZAÇÃO DOS TIROS ---
    // Tiros são retângulos amarelos
    gl.uniform1i(u_PointLocation, 1);
    gl.uniform2f(u_uvScaleLocation, 1.0, 1.0);
    gl.uniform2f(u_uvOffsetLocation, 0.0, 0.0);
    gl.uniform4f(u_colorLocation, 1.0, 1.0, 0.0, 1.0);
    for (let shoot of shoots){
        mat4.identity(tempShotMatrix);
        translate(tempShotMatrix,shoot.x, shoot.y, 0);
        mat4.scale(tempShotMatrix, tempShotMatrix, [1, 4, 1]);

        gl.uniformMatrix4fv(u_modelMatrixLocation, false, tempShotMatrix);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }

    //--- RENDERIZAÇÃO DOS INIMIGOS ---
    // Cada tipo de inimigo tem sua textura e comportamento de animação
    gl.uniform1i(u_PointLocation, 0);
    for (let enemy of enemies){
        if (!enemy.active) continue;
        let texturaInimigo;
        mat4.identity(tempEnemyMatrix);
        translate(tempEnemyMatrix, enemy.x, enemy.y, 0);
        let frameDuration, currentTimeEnemy, frameIndex;
        switch(enemy.type){
            case 1:
                texturaInimigo = scene.enemyTexture1;
                mat4.scale(tempEnemyMatrix, tempEnemyMatrix, [16, 16, 1]);
                if (enemy.attacking || enemy.returning){
                    gl.uniform2f(u_uvScaleLocation, 1/3, 1.0);
                    gl.uniform2f(u_uvOffsetLocation, 2/3, 0.0);
                } else {
                    frameDuration = 500; // Duração de cada frame em ms
                    currentTimeEnemy = performance.now();
                    frameIndex = Math.floor(currentTimeEnemy / frameDuration) % 2; // Alterna entre 0 e 1
                    gl.uniform2f(u_uvScaleLocation, 1/3, 1.0);
                    gl.uniform2f(u_uvOffsetLocation, frameIndex/3, 0.0);
                }
                break;
            case 2:
                texturaInimigo = scene.enemyTexture2;
                mat4.scale(tempEnemyMatrix, tempEnemyMatrix, [16, 16, 1]);
                if (enemy.attacking || enemy.returning){
                    gl.uniform2f(u_uvScaleLocation, 1/3, 1.0);
                    gl.uniform2f(u_uvOffsetLocation, 2/3, 0.0);
                } else {
                    frameDuration = 500; // Duração de cada frame em ms
                    currentTimeEnemy = performance.now();
                    frameIndex = Math.floor(currentTimeEnemy / frameDuration) % 2; // Alterna entre 0 e 1
                    gl.uniform2f(u_uvScaleLocation, 1/3, 1.0);
                    gl.uniform2f(u_uvOffsetLocation, frameIndex/3, 0.0);
                }
                break;
            case 3:
                texturaInimigo = scene.textureBoss1;
                mat4.scale(tempEnemyMatrix, tempEnemyMatrix, [32, 32, 1]);
                gl.uniform2f(u_uvScaleLocation, 1.0, 1.0);
                gl.uniform2f(u_uvOffsetLocation, 0.0, 0.0);
                break;
            case 4:
                texturaInimigo = scene.textureBoss2;
                mat4.scale(tempEnemyMatrix, tempEnemyMatrix, [32, 32, 1]);
                gl.uniform2f(u_uvScaleLocation, 1.0, 1.0);
                gl.uniform2f(u_uvOffsetLocation, 0.0, 0.0);
                break;
            default:
                texturaInimigo = scene.enemyTexture1; // Fallback para texture padrão
                mat4.scale(tempEnemyMatrix, tempEnemyMatrix, [16, 16, 1]);
                gl.uniform2f(u_uvScaleLocation, 1.0, 1.0);
                gl.uniform2f(u_uvOffsetLocation, 0.0, 0.0);
        }
        gl.uniform1i(u_PointLocation, 0);
        gl.uniformMatrix4fv(u_modelMatrixLocation, false, tempEnemyMatrix);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texturaInimigo);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    }

    //--- RENDERIZAÇÃO DAS EXPLOSÕES ---
    // Animação de spritesheet com 7 frames
    gl.uniform1i(u_PointLocation, 0);
    gl.bindTexture(gl.TEXTURE_2D, scene.textureExplosion);
    const currentTimeExplosion = performance.now();
    const totalFrames = 7;
    const FrameDuration = 75;
    for (let i = 0; i < explosions.length; i++){
        const explosion = explosions[i];
        const elapsedTime = currentTimeExplosion - explosion.startTime;
        const ActualFrame = Math.floor(elapsedTime / FrameDuration);
        if (ActualFrame >= totalFrames){
            explosions.splice(i, 1);
            i--;
            continue;
        }
        gl.uniform2f(u_uvScaleLocation, 1/totalFrames, 1);
        gl.uniform2f(u_uvOffsetLocation, ActualFrame/totalFrames, 0);
        mat4.identity(explosionMatrix);
        translate(explosionMatrix, explosion.x, explosion.y, 0);
        mat4.scale(explosionMatrix, explosionMatrix, [20, 20, 1]);
        gl.uniformMatrix4fv(u_modelMatrixLocation, false, explosionMatrix);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }

    //--- RENDERIZAÇÃO DOS TIROS INIMIGOS ---
    // Tiros vermelhos, rotacionados conforme direção
    gl.uniform1i(u_PointLocation, 1);
    gl.uniform2f(u_uvScaleLocation, 1.0, 1.0);
    gl.uniform2f(u_uvOffsetLocation, 0.0, 0.0);
    gl.uniform4f(u_colorLocation, 1.0, 0.0, 0.0, 1.0);
    for (let shoot of enemyShoots){
        mat4.identity(tempShotMatrix);
        translate(tempShotMatrix,shoot.x, shoot.y, 0);
        const anguloDaBala = Math.atan2(shoot.speedY, shoot.speedX);
        rotate(tempShotMatrix, anguloDaBala);
        mat4.scale(tempShotMatrix, tempShotMatrix, [4, 1, 1]);
        gl.uniformMatrix4fv(u_modelMatrixLocation, false, tempShotMatrix);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }

    //--- RENDERIZAÇÃO DO UI DE VIDA ---
    // Mostra corações no canto superior esquerdo
    gl.uniform1i(u_PointLocation, 0);
    gl.uniform2f(u_uvScaleLocation, 1.0, 1.0);
    gl.uniform2f(u_uvOffsetLocation, 0.0, 0.0);
    for (let i = 0; i < life; i++) {
        mat4.identity(tempLifeMatrix);
        translate(tempLifeMatrix, 10 + i * 12, 10, 0);
        mat4.scale(tempLifeMatrix, tempLifeMatrix, [11, 11, 1]);
        gl.uniformMatrix4fv(u_modelMatrixLocation, false, tempLifeMatrix);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, scene.textureLife);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }

    //--- RENDERIZAÇÃO DOS PERKS ---
    // Itens com 3 variações conforme tipo (ataque, velocidade, lentidão)
    gl.uniform1i(u_PointLocation, 0);
    gl.uniform2f(u_uvScaleLocation, 1 / 3, 1.0);
    for (let perk of perks) {
        mat4.identity(tempPerkMatrix);
        translate(tempPerkMatrix, perk.x, perk.y, 0);
        mat4.scale(tempPerkMatrix, tempPerkMatrix, [10, 10, 1]);
        switch (perk.type) {
            case 'shoot':
                gl.uniform2f(u_uvOffsetLocation, 1 / 3, 0);
                break;
            case 'speed':
                gl.uniform2f(u_uvOffsetLocation, 0, 0);
                break;
            case 'slow':
                gl.uniform2f(u_uvOffsetLocation, 2 / 3, 0);
                break;
            default:
                gl.uniform2f(u_uvOffsetLocation, 0, 0);
        }
        gl.uniformMatrix4fv(u_modelMatrixLocation, false, tempPerkMatrix);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, scene.texturePerks);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }
    requestAnimationFrame((time) => render(gl,time));
}
