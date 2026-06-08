// Retro-Neon Car Racing Game Logic - 4K ULTRA SHARP EDITION

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Logical coordinates for game geometry
const LOGICAL_WIDTH = 450;
const LOGICAL_HEIGHT = 650;

// High-DPI / 4K Scaling logic
function resizeCanvas() {
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    
    // Set internal canvas resolution scaled by Device Pixel Ratio
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    
    // Scale drawings so game logic can always draw in a 450x650 virtual grid
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset
    ctx.scale((cssWidth * dpr) / LOGICAL_WIDTH, (cssHeight * dpr) / LOGICAL_HEIGHT);
}

// Attach listener and trigger immediately
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 0);

// DOM Elements
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const scoreVal = document.getElementById('scoreVal');
const highScoreVal = document.getElementById('highScoreVal');
const speedVal = document.getElementById('speedVal');
const finalScoreVal = document.getElementById('finalScoreVal');

const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');
const audioToggle = document.getElementById('audioToggle');

// Game State & Config
let gameState = 'START';
let score = 0;
let highScore = localStorage.getItem('neon_drift_highscore') || 0;
let speed = 0;
let targetSpeed = 0;
let roadOffset = 0;
let frameCount = 0;
let shakeDuration = 0;
let boostTimer = 0;

highScoreVal.innerText = String(highScore).padStart(4, '0');

// Audio Controller (Web Audio API Synthesizer)
class AudioSynth {
    constructor() {
        this.ctx = null;
        this.engineOsc = null;
        this.engineGain = null;
        this.muted = false;
        this.initialized = false;
        this.bgmInterval = null;
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();
            this.setupEngine();
            this.initialized = true;
            this.playBGM();
        } catch (e) {
            console.warn('Web Audio API not supported', e);
        }
    }

    setupEngine() {
        if (!this.ctx) return;
        
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.setValueAtTime(40, this.ctx.currentTime);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(120, this.ctx.currentTime);

        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);

        this.engineOsc.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);
        this.engineOsc.start(0);
    }

    setEngineSpeed(speedRatio) {
        if (this.muted || !this.initialized || !this.engineOsc) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        const baseFreq = 35;
        const maxFreq = 120;
        const targetFreq = baseFreq + (speedRatio * (maxFreq - baseFreq));
        this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
        
        const targetVolume = 0.03 + (speedRatio * 0.05);
        this.engineGain.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, 0.1);
    }

    stopEngine() {
        if (this.engineGain) {
            this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
        }
    }

    playBGM() {
        if (this.muted || !this.initialized || !this.ctx) return;
        if (this.bgmInterval) return;

        let noteIndex = 0;
        const notes = [41.20, 48.99, 55.00, 65.41]; 
        
        this.bgmInterval = setInterval(() => {
            if (this.muted || gameState !== 'PLAYING') return;
            
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(notes[noteIndex], now);
            
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(150, now);
            
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.005, now + 0.4);
            
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start(now);
            osc.stop(now + 0.4);
            
            noteIndex = (noteIndex + 1) % notes.length;
        }, 400);
    }

    stopBGM() {
        if (this.bgmInterval) {
            clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }
    }

    playCrashSound() {
        if (this.muted || !this.initialized || !this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(8, now + 1.0);
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, now);
        
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 1.0);
    }

    playPointSound() {
        if (this.muted || !this.initialized || !this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.08);
        osc.frequency.setValueAtTime(783.99, now + 0.16);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
    }

    playBoostSound() {
        if (this.muted || !this.initialized || !this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.4);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.muted) {
            this.stopEngine();
            this.stopBGM();
            audioToggle.innerText = "Ses: KAPALI";
            audioToggle.classList.add('muted');
        } else {
            audioToggle.innerText = "Ses: AÇIK";
            audioToggle.classList.remove('muted');
            if (gameState === 'PLAYING') {
                this.setEngineSpeed(speed / 120);
                this.playBGM();
            }
        }
    }
}

const audio = new AudioSynth();

// Player Car Model
const player = {
    x: 225,
    y: 520,
    width: 44,
    height: 78,
    targetX: 225,
    speedX: 0.14,
    color: '#00f0ff',
    glowColor: 'rgba(0, 240, 255, 0.8)'
};

const lanes = [125, 225, 325];
let currentLaneIndex = 1;

let obstacles = [];
let powerups = [];

const obstacleColors = [
    { main: '#ff007f', glow: 'rgba(255, 0, 127, 0.8)' },
    { main: '#9d00ff', glow: 'rgba(157, 0, 255, 0.8)' },
    { main: '#ffdd00', glow: 'rgba(255, 221, 0, 0.8)' },
    { main: '#39ff14', glow: 'rgba(57, 255, 20, 0.8)' }
];

let particles = [];
function spawnExplosion(x, y, color) {
    for (let i = 0; i < 40; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            radius: Math.random() * 4 + 1,
            color: color,
            alpha: 1,
            decay: Math.random() * 0.025 + 0.015
        });
    }
}

function spawnBoostSparks(x, y) {
    for (let i = 0; i < 15; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 4,
            vy: Math.random() * 4 + 2,
            radius: Math.random() * 3 + 1,
            color: '#00f0ff',
            alpha: 1,
            decay: 0.03
        });
    }
}

const keys = {};
window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        e.preventDefault();
    }
    if (gameState === 'PLAYING') {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            moveLane(-1);
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            moveLane(1);
        }
    }
});

window.addEventListener('keyup', e => {
    keys[e.key] = false;
});

leftBtn.addEventListener('click', () => { if (gameState === 'PLAYING') moveLane(-1); });
rightBtn.addEventListener('click', () => { if (gameState === 'PLAYING') moveLane(1); });

function moveLane(direction) {
    currentLaneIndex = Math.max(0, Math.min(lanes.length - 1, currentLaneIndex + direction));
    player.targetX = lanes[currentLaneIndex];
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
audioToggle.addEventListener('click', () => audio.toggleMute());

function startGame() {
    audio.init();
    
    gameState = 'PLAYING';
    score = 0;
    speed = 40;
    targetSpeed = 85;
    currentLaneIndex = 1;
    player.x = lanes[currentLaneIndex];
    player.targetX = lanes[currentLaneIndex];
    obstacles = [];
    powerups = [];
    particles = [];
    boostTimer = 0;
    shakeDuration = 0;
    frameCount = 0;
    
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    
    audio.setEngineSpeed(speed / 120);
    audio.playBGM();
}

function gameOver() {
    gameState = 'GAMEOVER';
    shakeDuration = 25;
    audio.stopEngine();
    audio.stopBGM();
    audio.playCrashSound();
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('neon_drift_highscore', highScore);
        highScoreVal.innerText = String(highScore).padStart(4, '0');
    }
    
    finalScoreVal.innerText = score;
    gameOverScreen.classList.remove('hidden');
}

function checkCollision(rect1, rect2) {
    const paddingX = 4;
    const paddingY = 6;
    return (
        rect1.x < rect2.x + rect2.width - paddingX &&
        rect1.x + rect1.width > rect2.x + paddingX &&
        rect1.y < rect2.y + rect2.height - paddingY &&
        rect1.y + rect1.height > rect2.y + paddingY
    );
}

function drawCar(x, y, width, height, colorObj, isPlayer = false, isPolice = false) {
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = colorObj.glow || colorObj.main;
    ctx.fillStyle = colorObj.main;
    
    ctx.beginPath();
    ctx.moveTo(x + width * 0.25, y);
    ctx.lineTo(x + width * 0.75, y);
    ctx.lineTo(x + width * 0.85, y + height * 0.2);
    ctx.lineTo(x + width * 0.9, y + height * 0.75);
    ctx.lineTo(x + width * 0.95, y + height * 0.9);
    ctx.lineTo(x + width * 0.05, y + height * 0.9);
    ctx.lineTo(x + width * 0.1, y + height * 0.75);
    ctx.lineTo(x + width * 0.15, y + height * 0.2);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.fillStyle = '#05040a';
    ctx.beginPath();
    ctx.moveTo(x + width * 0.3, y + height * 0.25);
    ctx.lineTo(x + width * 0.7, y + height * 0.25);
    ctx.lineTo(x + width * 0.8, y + height * 0.5);
    ctx.lineTo(x + width * 0.2, y + height * 0.5);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = colorObj.main;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + width * 0.35, y + height * 0.45);
    ctx.lineTo(x + width * 0.65, y + height * 0.3);
    ctx.stroke();

    ctx.fillStyle = '#111';
    const wheelWidth = width * 0.12;
    const wheelHeight = height * 0.18;
    ctx.fillRect(x - wheelWidth + 1, y + height * 0.15, wheelWidth, wheelHeight);
    ctx.fillRect(x + width - 1, y + height * 0.15, wheelWidth, wheelHeight);
    ctx.fillRect(x - wheelWidth + 1, y + height * 0.65, wheelWidth, wheelHeight);
    ctx.fillRect(x + width - 1, y + height * 0.65, wheelWidth, wheelHeight);

    if (isPlayer) {
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#fff';
        ctx.fillRect(x + width * 0.25, y + 2, 4, 3);
        ctx.fillRect(x + width * 0.65, y + 2, 4, 3);
        
        ctx.fillStyle = '#ff003c';
        ctx.shadowColor = '#ff003c';
        ctx.fillRect(x + width * 0.15, y + height - 5, 8, 3);
        ctx.fillRect(x + width * 0.65, y + height - 5, 8, 3);
    } else if (isPolice) {
        const flash = Math.floor(frameCount / 6) % 2 === 0;
        ctx.shadowBlur = 15;
        
        ctx.fillStyle = flash ? '#ff0000' : '#0000ff';
        ctx.shadowColor = ctx.fillStyle;
        ctx.fillRect(x + width * 0.2, y + height * 0.4, width * 0.3, 4);

        ctx.fillStyle = flash ? '#0000ff' : '#ff0000';
        ctx.shadowColor = ctx.fillStyle;
        ctx.fillRect(x + width * 0.5, y + height * 0.4, width * 0.3, 4);
        
        ctx.fillStyle = '#ffdd00';
        ctx.shadowColor = '#ffdd00';
        ctx.fillRect(x + width * 0.25, y + 2, 4, 3);
        ctx.fillRect(x + width * 0.65, y + 2, 4, 3);
    } else {
        ctx.fillStyle = '#ff003c';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ff003c';
        ctx.fillRect(x + width * 0.2, y + height - 4, 6, 2);
        ctx.fillRect(x + width * 0.65, y + height - 4, 6, 2);
    }

    ctx.restore();
}

function drawBattery(x, y) {
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f0ff';
    ctx.fillStyle = '#00f0ff';
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x + 6, y - 2);
    ctx.lineTo(x + 1, y - 2);
    ctx.lineTo(x + 5, y + 10);
    ctx.lineTo(x - 6, y + 2);
    ctx.lineTo(x - 1, y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawRoad() {
    // Asphalt base
    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Grid details on the sides
    ctx.save();
    ctx.strokeStyle = 'rgba(157, 0, 255, 0.08)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < LOGICAL_WIDTH; x += gridSize) {
        if (x < 75 || x > 375) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, LOGICAL_HEIGHT);
            ctx.stroke();
        }
    }
    const gridOffset = roadOffset % gridSize;
    for (let y = gridOffset; y < LOGICAL_HEIGHT; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(75, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(375, y);
        ctx.lineTo(LOGICAL_WIDTH, y);
        ctx.stroke();
    }
    ctx.restore();

    // Road asphalt fill
    ctx.fillStyle = '#08070d';
    ctx.fillRect(75, 0, 300, LOGICAL_HEIGHT);

    // Neon Pink side barriers
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = 'var(--neon-pink)';
    ctx.strokeStyle = 'var(--neon-pink)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(75, 0);
    ctx.lineTo(75, LOGICAL_HEIGHT);
    ctx.moveTo(375, 0);
    ctx.lineTo(375, LOGICAL_HEIGHT);
    ctx.stroke();
    ctx.restore();

    // Barrier animated running lights
    ctx.fillStyle = '#fff';
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#fff';
    const barrierDashes = 100;
    const dashOffset = roadOffset % barrierDashes;
    for (let y = dashOffset - barrierDashes; y < LOGICAL_HEIGHT; y += barrierDashes) {
        ctx.fillRect(73, y, 4, 15);
        ctx.fillRect(373, y, 4, 15);
    }
    ctx.restore();

    // Moving Warp-speed background lines (active during boost)
    if (boostTimer > 0) {
        ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
        for (let i = 0; i < 6; i++) {
            const lineY = (roadOffset * 2.5 + i * 150) % LOGICAL_HEIGHT;
            const lineX = 90 + (i * 45) % 260;
            ctx.fillRect(lineX, lineY, 2, 40);
        }
    }

    // Lane Dividers
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([25, 35]);
    ctx.lineDashOffset = -roadOffset;
    ctx.beginPath();
    ctx.moveTo(175, 0);
    ctx.lineTo(175, LOGICAL_HEIGHT);
    ctx.moveTo(275, 0);
    ctx.lineTo(275, LOGICAL_HEIGHT);
    ctx.stroke();
    ctx.restore();
}

function updateAndDrawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
            particles.splice(i, 1);
            continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function update(time) {
    frameCount++;
    
    ctx.save();
    if (shakeDuration > 0) {
        const dx = (Math.random() - 0.5) * 8;
        const dy = (Math.random() - 0.5) * 8;
        ctx.translate(dx, dy);
        shakeDuration--;
    }
    
    drawRoad();
    
    if (gameState === 'PLAYING') {
        if (boostTimer > 0) {
            boostTimer--;
            speed = 135;
            targetSpeed = 135;
            if (frameCount % 2 === 0) {
                spawnBoostSparks(player.x + 5, player.y + player.height);
                spawnBoostSparks(player.x + player.width - 5, player.y + player.height);
            }
        } else {
            if (speed < targetSpeed) {
                speed += 0.2;
            } else if (speed > targetSpeed) {
                speed -= 0.15;
            }

            if (frameCount % 600 === 0) {
                targetSpeed = Math.min(115, targetSpeed + 5);
                audio.playPointSound();
            }
        }

        roadOffset += speed * 0.15;
        
        score = Math.floor(frameCount / 8);
        if (boostTimer > 0) {
            score += Math.floor(frameCount / 4);
        }
        scoreVal.innerText = String(score).padStart(4, '0');
        speedVal.innerText = `${Math.floor(speed)} km/h`;
        
        audio.setEngineSpeed(speed / 135);

        const diffX = player.targetX - (player.x + player.width / 2);
        player.x += diffX * player.speedX;

        // Obstacles
        const spawnInterval = Math.max(45, 130 - Math.floor(speed * 0.7));
        if (frameCount % spawnInterval === 0) {
            const randomLaneIndex = Math.floor(Math.random() * lanes.length);
            const laneX = lanes[randomLaneIndex] - player.width / 2;
            
            const isPoliceCar = Math.random() < 0.20;
            const randomColor = isPoliceCar 
                ? { main: '#08070d', glow: 'rgba(0, 240, 255, 0.4)' }
                : obstacleColors[Math.floor(Math.random() * obstacleColors.length)];
            
            const obsSpeed = (speed * 0.08) + Math.random() * 2 + 1;

            obstacles.push({
                x: laneX,
                y: -100,
                width: player.width,
                height: player.height,
                speedY: obsSpeed,
                color: randomColor,
                isPolice: isPoliceCar
            });
        }

        // Powerups
        if (frameCount % 450 === 0 && boostTimer === 0) {
            const randomLaneIndex = Math.floor(Math.random() * lanes.length);
            powerups.push({
                x: lanes[randomLaneIndex],
                y: -50,
                width: 15,
                height: 20
            });
        }

        // Update Powerups
        for (let i = powerups.length - 1; i >= 0; i--) {
            const p = powerups[i];
            p.y += speed * 0.15;

            if (p.y > LOGICAL_HEIGHT + 50) {
                powerups.splice(i, 1);
                continue;
            }

            drawBattery(p.x, p.y);

            const dist = Math.hypot((player.x + player.width / 2) - p.x, (player.y + player.height / 2) - p.y);
            if (dist < 40) {
                boostTimer = 180;
                audio.playBoostSound();
                spawnExplosion(p.x, p.y, '#00f0ff');
                powerups.splice(i, 1);
            }
        }

        // Update Obstacles
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obs = obstacles[i];
            obs.y += obs.speedY;

            if (obs.y > LOGICAL_HEIGHT + 50) {
                obstacles.splice(i, 1);
                continue;
            }

            drawCar(obs.x, obs.y, obs.width, obs.height, obs.color, false, obs.isPolice);

            const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
            if (checkCollision(playerRect, obs)) {
                if (boostTimer > 0) {
                    spawnExplosion(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.color.main || '#ff007f');
                    audio.playCrashSound();
                    shakeDuration = 8;
                    obstacles.splice(i, 1);
                } else {
                    spawnExplosion(player.x + player.width / 2, player.y + player.height / 2, player.color);
                    spawnExplosion(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.color.main);
                    gameOver();
                }
            }
        }

        // Draw Player Car
        const playerColor = boostTimer > 0 ? '#ffffff' : player.color;
        const playerGlow = boostTimer > 0 ? '#00f0ff' : player.glowColor;
        drawCar(player.x, player.y, player.width, player.height, { main: playerColor, glow: playerGlow }, true);
        
        // Exhaust particles
        if (frameCount % 3 === 0) {
            particles.push({
                x: player.x + player.width / 2 + (Math.random() - 0.5) * 8,
                y: player.y + player.height - 2,
                vx: (Math.random() - 0.5) * 1.5,
                vy: Math.random() * 2 + 2,
                radius: Math.random() * 3 + 1,
                color: boostTimer > 0 ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 240, 255, 0.5)',
                alpha: 0.8,
                decay: 0.04
            });
        }
    } else {
        roadOffset += 1.5;
        for (let obs of obstacles) {
            obs.y += obs.speedY * 0.1;
            drawCar(obs.x, obs.y, obs.width, obs.height, obs.color, false, obs.isPolice);
        }

        if (gameState === 'GAMEOVER') {
            drawCar(player.x, player.y, player.width, player.height, { main: '#333', glow: 'rgba(0,0,0,0)' }, true);
        }
    }

    updateAndDrawParticles();
    
    ctx.restore();

    requestAnimationFrame(update);
}

requestAnimationFrame(update);
