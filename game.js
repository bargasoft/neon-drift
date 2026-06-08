// Retro-Neon Car Racing Game Logic

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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
let gameState = 'START'; // START, PLAYING, GAMEOVER
let score = 0;
let highScore = localStorage.getItem('neon_drift_highscore') || 0;
let speed = 0;
let targetSpeed = 0;
let roadOffset = 0;
let frameCount = 0;

// Update High Score Display
highScoreVal.innerText = String(highScore).padStart(4, '0');

// Audio Controller using Web Audio API
class AudioSynth {
    constructor() {
        this.ctx = null;
        this.engineOsc = null;
        this.engineGain = null;
        this.muted = false;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();
            this.setupEngine();
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported in this browser', e);
        }
    }

    setupEngine() {
        if (!this.ctx) return;
        
        // Create engine sound using a saw wave oscillator combined with a lowpass filter
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.setValueAtTime(40, this.ctx.currentTime);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(120, this.ctx.currentTime);

        this.engineGain = this.ctx.createGain();
        // Start silent
        this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);

        this.engineOsc.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);
        this.engineOsc.start(0);
    }

    setEngineSpeed(speedRatio) {
        if (this.muted || !this.initialized || !this.engineOsc) return;
        
        // Resume context if suspended (browser security)
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        // Map speed to frequency (engine pitch)
        const baseFreq = 35;
        const maxFreq = 110;
        const targetFreq = baseFreq + (speedRatio * (maxFreq - baseFreq));
        
        this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
        
        // Map speed to volume (higher speed = slightly louder/more roaring engine)
        const targetVolume = 0.04 + (speedRatio * 0.06);
        this.engineGain.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, 0.1);
    }

    stopEngine() {
        if (this.engineGain) {
            this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
        }
    }

    playCrashSound() {
        if (this.muted || !this.initialized || !this.ctx) return;

        const now = this.ctx.currentTime;
        
        // Low pitch boom
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.8);
        
        // Noise simulation
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, now);
        
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.8);
    }

    playPointSound() {
        if (this.muted || !this.initialized || !this.ctx) return;
        
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.3);
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.muted) {
            this.stopEngine();
            audioToggle.innerText = "Ses: KAPALI";
            audioToggle.classList.add('muted');
        } else {
            audioToggle.innerText = "Ses: AÇIK";
            audioToggle.classList.remove('muted');
            if (gameState === 'PLAYING') {
                this.setEngineSpeed(speed / 120);
            }
        }
    }
}

const audio = new AudioSynth();

// Player Car Model
const player = {
    x: 225, // Start in middle lane
    y: 520,
    width: 44,
    height: 78,
    targetX: 225,
    speedX: 0.12, // Smooth interpolation factor
    color: '#00f0ff',
    glowColor: 'rgba(0, 240, 255, 0.8)'
};

// Lane configuration
const lanes = [125, 225, 325]; // Center X of Left, Middle, and Right lanes
let currentLaneIndex = 1; // Start in middle lane

// Obstacle (Enemy) Cars
let obstacles = [];
const obstacleColors = [
    { main: '#ff007f', glow: 'rgba(255, 0, 127, 0.8)' }, // Neon Pink
    { main: '#9d00ff', glow: 'rgba(157, 0, 255, 0.8)' }, // Neon Purple
    { main: '#ffdd00', glow: 'rgba(255, 221, 0, 0.8)' }, // Neon Yellow
    { main: '#39ff14', glow: 'rgba(57, 255, 20, 0.8)' }  // Neon Green
];

// Particle Effect System (for collisions or speed streaks)
let particles = [];
function spawnExplosion(x, y, color) {
    for (let i = 0; i < 30; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            radius: Math.random() * 4 + 1,
            color: color,
            alpha: 1,
            decay: Math.random() * 0.02 + 0.015
        });
    }
}

// Input Handlers
const keys = {};
window.addEventListener('keydown', e => {
    keys[e.key] = true;
    
    // Prevent default scrolling for arrows and space
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

// Touch control clicks
leftBtn.addEventListener('click', () => { if (gameState === 'PLAYING') moveLane(-1); });
rightBtn.addEventListener('click', () => { if (gameState === 'PLAYING') moveLane(1); });

function moveLane(direction) {
    currentLaneIndex = Math.max(0, Math.min(lanes.length - 1, currentLaneIndex + direction));
    player.targetX = lanes[currentLaneIndex];
}

// Start Game
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
audioToggle.addEventListener('click', () => audio.toggleMute());

function startGame() {
    audio.init();
    
    // Reset state
    gameState = 'PLAYING';
    score = 0;
    speed = 40;
    targetSpeed = 80;
    currentLaneIndex = 1;
    player.x = lanes[currentLaneIndex];
    player.targetX = lanes[currentLaneIndex];
    obstacles = [];
    particles = [];
    
    // Hide UI overlays
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    
    // Resume engine sound
    audio.setEngineSpeed(speed / 120);
}

function gameOver() {
    gameState = 'GAMEOVER';
    audio.stopEngine();
    audio.playCrashSound();
    
    // Save High Score
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('neon_drift_highscore', highScore);
        highScoreVal.innerText = String(highScore).padStart(4, '0');
    }
    
    // Display Final Score
    finalScoreVal.innerText = score;
    gameOverScreen.classList.remove('hidden');
}

// Collision Check
function checkCollision(rect1, rect2) {
    // Add a slight margin/padding for more forgiving gameplay
    const paddingX = 4;
    const paddingY = 6;
    return (
        rect1.x < rect2.x + rect2.width - paddingX &&
        rect1.x + rect1.width > rect2.x + paddingX &&
        rect1.y < rect2.y + rect2.height - paddingY &&
        rect1.y + rect1.height > rect2.y + paddingY
    );
}

// Draw futuristic car (Vector Art via Canvas Paths)
function drawCar(x, y, width, height, colorObj, isPlayer = false) {
    ctx.save();
    
    // Glow effect
    ctx.shadowBlur = 15;
    ctx.shadowColor = colorObj.glow || colorObj.main;
    
    ctx.fillStyle = colorObj.main;
    
    // Main Car Body
    ctx.beginPath();
    // Front hood
    ctx.moveTo(x + width * 0.25, y);
    ctx.lineTo(x + width * 0.75, y);
    // Front fenders
    ctx.lineTo(x + width * 0.85, y + height * 0.2);
    // Side profile
    ctx.lineTo(x + width * 0.9, y + height * 0.75);
    // Rear spoiler
    ctx.lineTo(x + width * 0.95, y + height * 0.9);
    ctx.lineTo(x + width * 0.05, y + height * 0.9);
    ctx.lineTo(x + width * 0.1, y + height * 0.75);
    ctx.lineTo(x + width * 0.15, y + height * 0.2);
    ctx.closePath();
    ctx.fill();

    // Reset shadow for inner parts
    ctx.shadowBlur = 0;

    // Windshield / Glass Canopy
    ctx.fillStyle = '#05040a';
    ctx.beginPath();
    ctx.moveTo(x + width * 0.3, y + height * 0.25);
    ctx.lineTo(x + width * 0.7, y + height * 0.25);
    ctx.lineTo(x + width * 0.8, y + height * 0.5);
    ctx.lineTo(x + width * 0.2, y + height * 0.5);
    ctx.closePath();
    ctx.fill();
    
    // Windshield Highlights (diagonal neon line reflection)
    ctx.strokeStyle = colorObj.main;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + width * 0.35, y + height * 0.45);
    ctx.lineTo(x + width * 0.65, y + height * 0.3);
    ctx.stroke();

    // Wheels (4 black rounded rectangles on the side)
    ctx.fillStyle = '#111';
    const wheelWidth = width * 0.12;
    const wheelHeight = height * 0.18;
    // Front wheels
    ctx.fillRect(x - wheelWidth + 1, y + height * 0.15, wheelWidth, wheelHeight);
    ctx.fillRect(x + width - 1, y + height * 0.15, wheelWidth, wheelHeight);
    // Rear wheels
    ctx.fillRect(x - wheelWidth + 1, y + height * 0.65, wheelWidth, wheelHeight);
    ctx.fillRect(x + width - 1, y + height * 0.65, wheelWidth, wheelHeight);

    // Glowing Neon Headlights/Taillights
    if (isPlayer) {
        // Cyan Headlights
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#fff';
        ctx.fillRect(x + width * 0.25, y + 2, 4, 3);
        ctx.fillRect(x + width * 0.65, y + 2, 4, 3);
        
        // Red glowing taillights
        ctx.fillStyle = '#ff003c';
        ctx.shadowColor = '#ff003c';
        ctx.fillRect(x + width * 0.15, y + height - 5, 8, 3);
        ctx.fillRect(x + width * 0.65, y + height - 5, 8, 3);
    } else {
        // Red glowing taillights for enemy cars
        ctx.fillStyle = '#ff003c';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ff003c';
        ctx.fillRect(x + width * 0.2, y + height - 4, 6, 2);
        ctx.fillRect(x + width * 0.65, y + height - 4, 6, 2);
    }

    ctx.restore();
}

// Draw scrolling background road
function drawRoad() {
    // Pitch Black Asphalt background
    ctx.fillStyle = '#06050b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid effect on the left and right roadside areas
    ctx.save();
    ctx.strokeStyle = 'rgba(157, 0, 255, 0.08)'; // faint purple grid
    ctx.lineWidth = 1;
    const gridSize = 40;
    
    // Draw vertical lines outside road boundaries
    for (let x = 0; x < canvas.width; x += gridSize) {
        if (x < 75 || x > 375) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
    }
    // Draw moving horizontal grid lines
    const gridOffset = roadOffset % gridSize;
    for (let y = gridOffset; y < canvas.height; y += gridSize) {
        // Left area
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(75, y);
        ctx.stroke();
        // Right area
        ctx.beginPath();
        ctx.moveTo(375, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    ctx.restore();

    // Road asphalt fill
    ctx.fillStyle = '#08070d';
    ctx.fillRect(75, 0, 300, canvas.height);

    // Neon Pink side barriers
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'var(--neon-pink)';
    ctx.strokeStyle = 'var(--neon-pink)';
    ctx.lineWidth = 4;
    
    // Left barrier
    ctx.beginPath();
    ctx.moveTo(75, 0);
    ctx.lineTo(75, canvas.height);
    ctx.stroke();

    // Right barrier
    ctx.beginPath();
    ctx.moveTo(375, 0);
    ctx.lineTo(375, canvas.height);
    ctx.stroke();
    ctx.restore();

    // Side barrier glow animations (running lights)
    ctx.fillStyle = '#fff';
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#fff';
    const barrierDashes = 100;
    const dashOffset = roadOffset % barrierDashes;
    for (let y = dashOffset - barrierDashes; y < canvas.height; y += barrierDashes) {
        ctx.fillRect(73, y, 4, 15);
        ctx.fillRect(373, y, 4, 15);
    }
    ctx.restore();

    // Lane dividers (Dashed lines between lanes)
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)'; // neon blue dash
    ctx.lineWidth = 2;
    ctx.setLineDash([25, 35]);
    ctx.lineDashOffset = -roadOffset;

    // Line between lane 1 and 2
    ctx.beginPath();
    ctx.moveTo(175, 0);
    ctx.lineTo(175, canvas.height);
    ctx.stroke();

    // Line between lane 2 and 3
    ctx.beginPath();
    ctx.moveTo(275, 0);
    ctx.lineTo(275, canvas.height);
    ctx.stroke();
    
    ctx.restore();
}

// Particle update and render
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

// Main Game Loop
function update(time) {
    frameCount++;
    
    // Draw background and road
    drawRoad();
    
    if (gameState === 'PLAYING') {
        // Accelerate up to target speed
        if (speed < targetSpeed) {
            speed += 0.2;
        } else if (speed > targetSpeed) {
            speed -= 0.1;
        }

        // Increase base target speed slowly over time to escalate difficulty
        if (frameCount % 600 === 0) {
            targetSpeed = Math.min(120, targetSpeed + 6);
            audio.playPointSound(); // Milestone beep
        }

        // Scroll the road based on speed
        roadOffset += speed * 0.15;
        
        // Display score & speed
        score = Math.floor(frameCount / 8);
        scoreVal.innerText = String(score).padStart(4, '0');
        speedVal.innerText = `${Math.floor(speed)} km/h`;
        
        // Update audio pitch based on current speed ratio (relative to max 120)
        audio.setEngineSpeed(speed / 120);

        // Smoothly interpolate player X toward target lane position
        const diffX = player.targetX - (player.x + player.width / 2);
        player.x += diffX * player.speedX;

        // Obstacle spawning logic (once every X frames depending on speed)
        const spawnInterval = Math.max(50, 140 - Math.floor(speed * 0.7));
        if (frameCount % spawnInterval === 0) {
            // Pick a random lane
            const randomLaneIndex = Math.floor(Math.random() * lanes.length);
            const laneX = lanes[randomLaneIndex] - player.width / 2;
            
            // Random color scheme
            const randomColor = obstacleColors[Math.floor(Math.random() * obstacleColors.length)];
            
            // Determine relative speed of obstacle (moving slower than player)
            const obsSpeed = (speed * 0.1) + Math.random() * 2 + 1;

            obstacles.push({
                x: laneX,
                y: -100, // Spawn above screen
                width: player.width,
                height: player.height,
                speedY: obsSpeed,
                color: randomColor,
                passed: false
            });
        }

        // Update Obstacles
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obs = obstacles[i];
            
            // Move down relative to player scroll
            obs.y += obs.speedY;

            // Remove off-screen obstacles
            if (obs.y > canvas.height + 50) {
                obstacles.splice(i, 1);
                continue;
            }

            // Draw obstacle car
            drawCar(obs.x, obs.y, obs.width, obs.height, obs.color, false);

            // Collision detection
            const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
            if (checkCollision(playerRect, obs)) {
                spawnExplosion(player.x + player.width / 2, player.y + player.height / 2, player.color);
                spawnExplosion(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.color.main);
                gameOver();
            }
        }

        // Draw Player Car
        drawCar(player.x, player.y, player.width, player.height, { main: player.color, glow: player.glowColor }, true);
        
        // Spawn engine heat/exhaust particle trail occasionally
        if (frameCount % 3 === 0) {
            particles.push({
                x: player.x + player.width / 2 + (Math.random() - 0.5) * 8,
                y: player.y + player.height - 2,
                vx: (Math.random() - 0.5) * 1.5,
                vy: Math.random() * 2 + 2,
                radius: Math.random() * 3 + 1,
                color: 'rgba(0, 240, 255, 0.5)',
                alpha: 0.8,
                decay: 0.04
            });
        }
    } else {
        // Idle scrolling speed when not playing
        roadOffset += 1.5;
        
        // Update obstacles idle animation
        for (let obs of obstacles) {
            obs.y += obs.speedY * 0.1;
            drawCar(obs.x, obs.y, obs.width, obs.height, obs.color, false);
        }

        if (gameState === 'GAMEOVER') {
            // Draw player static/broken car at location
            drawCar(player.x, player.y, player.width, player.height, { main: '#444', glow: 'rgba(50,50,50,0)' }, true);
        }
    }

    // Render particles (explosion or trails)
    updateAndDrawParticles();

    requestAnimationFrame(update);
}

// Initial draw call to start game loop
requestAnimationFrame(update);
