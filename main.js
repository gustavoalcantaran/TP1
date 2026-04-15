import {createProgram, createShader} from "./gl-utils.js";
const { mat4 } = glMatrix;


//Configuração e Criação dos Sons
const volumeControl = document.getElementById('volume');
let masterVolume = 0.5;
const backgroundAudio = new Audio('Soundtrack.mp3');
backgroundAudio.loop = true;
backgroundAudio.volume = 0.5*masterVolume;
const gameOverAudio = new Audio('Gameover.mp3');
gameOverAudio.loop = true;
gameOverAudio.volume = 0.5*masterVolume;
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
//Model
let u_modelMatrixLocation;

// Variáveis para controle de player,enemies e tiros
let shipMatrix;
let tempShotMatrix;
let tempEnemyMatrix;

//Variável para controle de textura ou cor
let u_PointLocation;

//Variável para controlar as texturas que tem animações
let u_uvOffsetLocation;
let u_uvScaleLocation;

const scene = {
    program: null,
    texture: null,
    enemyTexture : null,
    gameWidth: 200, 
    shipX : 100,
    shipY : 9,
};

//Template de enemies e vetor para guardar enemies.
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
let enemies = [];

const explosions = [];
let explosionMatrix;

const shoots = [];
let lastShootTime = 0;
const shootTemplate = {
    x: 0,
    y: 0,
    speed: 0.8,
};

const enemyShoots = [];
const enemyShootTemplate = {
    x : 0,
    y : 0,
    speedX : 0.5,
    speedY : 0.5,
}
//Variáveis para controle de estado do jogo e menus
let life = 3;
let enemiesAlive = 0;
let rounds = 1;
//Score para mostrar na tela
const scoreElement = document.getElementById('score-ui');
let score = 0;

const keys = {
    w : false,
    a : false,
    s : false,
    d : false,
    space : false,
    esc : false,
    r : false,
    c : false,
}

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
let menuOrigin = null;

function updateMenuBackgroundByOrigin(menuElement) {
    if (!menuElement) return;
    const fromStartMenu = menuOrigin === startMenu;
    menuElement.classList.toggle('from-start', fromStartMenu);
}

function startGame(){
    initEnemies();
    backgroundAudio.play();
    gamePaused = false;
    enemiesAlive = enemies.length;
}

function checkWinCondition(){
    if(enemiesAlive <= 0){
        vitoriaScoreElement.innerText = `Sua pontuação: ${score}`;
        gamePaused = true;
        vitoriaMenu.style.display = 'flex';
        pauseMenu.style.display = 'none';
        controlsMenu.style.display = 'none';
        settingsMenu.style.display = 'none';
    }
}

function initEnemies(){
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

function gameOver(){
    gamePaused = true;
    gameOverScoreElement.innerText = `Sua pontuação: ${score}`;
    gameoverMenu.style.display = 'flex';
    backgroundAudio.pause();
    gameOverAudio.currentTime = 0;
    gameOverAudio.play();
}

function moveShots(){
    for (let i = 0; i < shoots.length; i++) {
        shoots[i].y += shoots[i].speed;
        if (shoots[i].y > 200) {
            shoots.splice(i, 1);
            i--;
        }
    }
}

function checkPlayerShootCollision(shoot, enemy){
    const distX = shoot.x - enemy.x;
    const distY = shoot.y - enemy.y;
    
    const distanceSquare = distX * distX + distY * distY;
    const radiusSumSquare = 51.1225;
    
    return distanceSquare < radiusSumSquare;
}
function enemyExplosion(enemy){
    explosions.push({
        x: enemy.x,
        y: enemy.y,
        startTime: performance.now(),
    });
}

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
                SFX.playExplosion(masterVolume);
                enemyExplosion(enemy);
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

function moveEnemies(){
    let hittedwall = false;
    for (let enemy of enemies){
        if (!enemy.active) continue;
        if(enemy.pback[0] + (0.2*(rounds)*enemy.dir) > 190 || enemy.pback[0] + (0.2*(rounds)*enemy.dir) < 10){
            hittedwall = true;
            break;
        }
        if(enemy.pback[1] < 16){
            gameOver();
        }
    }
    for (let enemy of enemies){
        if (!enemy.active) continue;

        let movX = 0;
        let movY = 0;

        if(hittedwall){
            movY -= 10;
            enemy.dir *= -1;
        } else {
            movX += 0.15*(rounds)*enemy.dir;
        }
        
        enemy.pback[0] += movX;
        enemy.pback[1] += movY;

        if (enemy.attacking) {
            enemy.t += 0.005;
            if(enemy.t >= 1){
                startReturning(enemy);
            } else {
                const pos = calcBezier(enemy.p0, enemy.p1, enemy.p2, enemy.p3, enemy.t);
                enemy.x = pos[0];
                enemy.y = pos[1];
            }
        }
        else if(enemy.returning){
            enemy.p3 = [enemy.pback[0], enemy.pback[1]];

            enemy.t += 0.005;

            if(enemy.t >= 1){
                enemy.returning = false;
                enemy.x = enemy.pback[0];
                enemy.y = enemy.pback[1];
            } else {
                const pos = calcBezier(enemy.p0, enemy.p1, enemy.p2, enemy.p3, enemy.t);
                enemy.x = pos[0];
                enemy.y = pos[1];
            }
        }else {
            enemy.x = enemy.pback[0];
            enemy.y = enemy.pback[1];
        }
    }
}

let lastEnemyAttackingTime = 0;

function selectEnemyToAttack(){
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

function calcBezier(p0,p1,p2,p3,t){
    const u = 1-t;
    const tt = t*t;
    const uu = u*u;
    const uuu = uu * u;
    const ttt = tt * t;
    let x = (uuu * p0[0]) 
    + (3 * uu * t * p1[0]) 
    + (3 * u * tt * p2[0]) 
    + (ttt * p3[0]);
    let y = (uuu * p0[1]) 
    + (3 * uu * t * p1[1]) 
    + (3 * u * tt * p2[1]) 
    + (ttt * p3[1]);
    return [x, y];
}

function startSkimming(enemy, targetX, targetY){
    SFX.playDiveBomb(masterVolume);
    enemy.attacking = true;
    enemy.t = 0;
    enemy.pback = [enemy.x, enemy.y];
    enemy.p0 = [enemy.x, enemy.y];
    enemy.p1 = [enemy.x + 30, enemy.y + 20];
    enemy.p2 = [targetX + 60, targetY + 40];
    enemy.p3 = [targetX, -20];
}

function startReturning(enemy){
    enemy.attacking = false;
    enemy.returning = true;
    enemy.t = 0;
    enemy.p0 = [100, 220];
    enemy.p1 = [10, enemy.y/2];
    enemy.p2 = [190, enemy.pback[1] + 50];
    enemy.p3 = enemy.pback;
}

function enemyShoot(enemy,targetX,targetY){
    const currentTime = performance.now();
    if (currentTime - enemy.lastShootTime < 700*(2/rounds)) return;
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

function makeEnemiesShoot(){
    for (let enemy of enemies){
        if (enemy.attacking && enemy.active) {
            enemyShoot(enemy, scene.shipX, scene.shipY);
        }
    }
}

function moveEnemyShoots(){
    for (let i = 0; i < enemyShoots.length; i++) {
        enemyShoots[i].x += enemyShoots[i].speedX;
        enemyShoots[i].y += enemyShoots[i].speedY;

        if (enemyShoots[i].x < 0 
            || enemyShoots[i].x > 200 
            || enemyShoots[i].y < 0 
            || enemyShoots[i].y > 200) {
            enemyShoots.splice(i, 1);
            i--;
        }
    }
}

function checkEnemyShootCollision(){
    for (let i = 0; i < enemyShoots.length; i++) {
        const shoot = enemyShoots[i];
        const distX = shoot.x - scene.shipX;
        const distY = shoot.y - scene.shipY;
        const distanceSquare = distX * distX + distY * distY;
        const radiusSumSquare = 51.1225; // Raio da nave + raio do tiro (7.15^2)
        if (distanceSquare < radiusSumSquare) {
            life--;
            enemyShoots.splice(i, 1);
            i--;
        }
        if (life <= 0) {
            gameOver();
        }
    }
}
let gamePaused = true;

volumeControl.addEventListener('input', (event) => {
    masterVolume = event.target.value;
    backgroundAudio.volume = masterVolume * 0.5;
});

btnContinue.addEventListener('click', () => {
    gamePaused = false;
    pauseMenu.style.display = 'none';
});

btnRestart.addEventListener('click', () => {
    resetGame();
    gamePaused = false;
    settingsMenu.style.display = 'none';
    pauseMenu.style.display = 'none';
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

function resetGame(){
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

function keyboardHandler(){
    if (vitoriaMenu.style.display === 'flex') {
        return;
    }
    // Como a minha nave tem 16 de largura para um lado e 16 para o outro, coloquei que
    // O eixo x tem que ser maior que 16 para não sair da tela, e menor que 184 (200 - 16) 
    // para o mesmo motivo. O mesmo raciocínio para o eixo y, mas com 9 de largura para cada lado.
    if (keys.w && scene.shipY < 191 && !gamePaused){
            scene.shipY += 0.5;
    }
    if (keys.s && scene.shipY > 9 && !gamePaused){
            scene.shipY -= 0.5;
    }
    if (keys.a && scene.shipX > 16 && !gamePaused){
            scene.shipX -= 0.5;
    }
    if (keys.d && scene.shipX < 184 && !gamePaused){
            scene.shipX += 0.5;
    }
    const currentTime = performance.now();
    if (keys.space && (currentTime - lastShootTime > 100) && !gamePaused){
        const centroX = scene.shipX
        const topoY = scene.shipY + 5
        shoots.push({
            x: centroX,
            y: topoY,
            speed: 0.8
        });
        lastShootTime = currentTime;
        SFX.playShoot(masterVolume);
    }
    if (keys.r && !gamePaused){
        keys.r = false; // Consumimos a tecla para não rodar várias vezes por segundo
        resetGame();
        if (gamePaused) {
            gamePaused = false;
            settingsMenu.style.display = 'none';
            pauseMenu.style.display = 'none';
        }
        
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

window.addEventListener('keydown', (event) =>{
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

window.addEventListener('keyup', (event) =>{
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

function translate(matrix,tx, ty, tz) {
    matrix[12] = tx;
    matrix[13] = ty;
    matrix[14] = tz;
}

function rotate(matrix, angle){
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    matrix[0] = c;
    matrix[1] = s;
    matrix[4] = -s;
    matrix[5] = c;
}

export function setupWebGL(){
    const canvas = document.querySelector(".example-canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) {
        console.error("WebGL2 não está disponível");
        throw new Error("WebGL2 não suportado");
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    return gl;
}

export function initialize(gl){
    
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
}

function ortho(left, right, bottom, top, near, far) {
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

export function render(gl) {

    keyboardHandler();
    if (!gamePaused) {
        moveShots();
        updateCollisionEnemies();
        moveEnemies();
        selectEnemyToAttack();
        moveEnemyShoots();
        makeEnemiesShoot();
        checkEnemyShootCollision();
        checkWinCondition();
    }
    gl.clear(gl.COLOR_BUFFER_BIT);
    //Limpa a Tela

    //--- RENDERIZAÇÃO DA NAVE ---
    gl.uniform2f(u_uvScaleLocation, 1.0, 1.0);
    gl.uniform2f(u_uvOffsetLocation, 0.0, 0.0);
    gl.uniform1i(u_PointLocation, 0); 
    gl.bindVertexArray(scene.universalVao);
    // Configura a matriz de modelo da nave combinando Translação e Escala
    mat4.identity(shipMatrix);
    translate(shipMatrix,scene.shipX, scene.shipY, 0);
    mat4.scale(shipMatrix, shipMatrix, [32, 18, 1]);
    // Passa a matriz correta (com tamanho e posição) para o vertex shader
    gl.uniformMatrix4fv(u_modelMatrixLocation, false, shipMatrix);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.texture);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    
    //--- RENDERIZAÇÃO DOS TIROS ---
    gl.uniform1i(u_PointLocation, 1);
    gl.uniform2f(u_uvScaleLocation, 1.0, 1.0);
    gl.uniform2f(u_uvOffsetLocation, 0.0, 0.0);
    for (let shoot of shoots){
        mat4.identity(tempShotMatrix);
        translate(tempShotMatrix,shoot.x, shoot.y, 0);
        mat4.scale(tempShotMatrix, tempShotMatrix, [1, 4, 1]);

        gl.uniformMatrix4fv(u_modelMatrixLocation, false, tempShotMatrix);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }

    //--- RENDERIZAÇÃO DOS INIMIGOS ---
    gl.uniform1i(u_PointLocation, 0);
    for (let enemy of enemies){
        if (!enemy.active) continue;
        let texturaInimigo;
        mat4.identity(tempEnemyMatrix);
        translate(tempEnemyMatrix, enemy.x, enemy.y, 0);
        let frameDuration, currentTime, frameIndex;
        switch(enemy.type){
            case 1:
                texturaInimigo = scene.enemyTexture1;
                mat4.scale(tempEnemyMatrix, tempEnemyMatrix, [16, 16, 1]);
                if (enemy.attacking || enemy.returning){
                    gl.uniform2f(u_uvScaleLocation, 1/3, 1.0);
                    gl.uniform2f(u_uvOffsetLocation, 2/3, 0.0);
                } else {
                    frameDuration = 500; // Duração de cada frame em ms
                    currentTime = performance.now();
                    frameIndex = Math.floor(currentTime / frameDuration) % 2; // Alterna entre 0 e 1
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
                    currentTime = performance.now();
                    frameIndex = Math.floor(currentTime / frameDuration) % 2; // Alterna entre 0 e 1
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
    gl.uniform1i(u_PointLocation, 0);
    gl.bindTexture(gl.TEXTURE_2D, scene.textureExplosion);
    const currentTime = performance.now();
    const totalFrames = 7;
    const FrameDuration = 75;
    for (let i = 0; i < explosions.length; i++){
        const explosion = explosions[i];
        const elapsedTime = currentTime - explosion.startTime;
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
    gl.uniform1i(u_PointLocation, 1);
    gl.uniform2f(u_uvScaleLocation, 1.0, 1.0);
    gl.uniform2f(u_uvOffsetLocation, 0.0, 0.0);
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
    gl.uniform1i(u_PointLocation, 0);
    gl.uniform2f(u_uvScaleLocation, 1.0, 1.0);
    gl.uniform2f(u_uvOffsetLocation, 0.0, 0.0);
        for (let i = 0; i < life; i++){
        mat4.identity(shipMatrix);
        translate(shipMatrix, 10 + i*12, 10, 0);
        mat4.scale(shipMatrix, shipMatrix, [10, 6, 1]);
        gl.uniformMatrix4fv(u_modelMatrixLocation, false, shipMatrix);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, scene.texture);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }

    requestAnimationFrame(() => render(gl));
}
