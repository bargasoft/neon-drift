// Neon Drift 3D - Three.js WebGL Engine

// Canvas and DOM Elements
const canvas = document.getElementById('gameCanvas');
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

// Game Configuration & State
let gameState = 'START';
let score = 0;
let highScore = localStorage.getItem('neon_drift_3d_highscore') || 0;
highScoreVal.innerText = String(highScore).padStart(4, '0');

let speed = 0;
let targetSpeed = 0;
let frameCount = 0;
let boostTimer = 0;
let cameraShake = 0;

// Three.js Scene Variables
let scene, camera, renderer;
let playerCar;
let roadSegments = [];
let obstacles = [];
let powerups = [];
let particles = [];
let lightsPool = []; // running lights along barriers

// Road Specs
const ROAD_WIDTH = 120;
const LANE_WIDTH = 40;
const lanesX = [-LANE_WIDTH, 0, LANE_WIDTH]; // Left, Middle, Right lane center X coordinates
let currentLaneIndex = 1;

// Colors
const COLOR_CYAN = 0x00f0ff;
const COLOR_PINK = 0xff007f;
const COLOR_PURPLE = 0x9d00ff;
const COLOR_YELLOW = 0xffdd00;
const COLOR_GREEN = 0x39ff14;

// Audio Controller using Web Audio API
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
        this.engineOsc.frequency.setValueAtTime(45, this.ctx.currentTime);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(140, this.ctx.currentTime);

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
        // Map speed to engine humming pitch
        const baseFreq = 40;
        const maxFreq = 130;
        const targetFreq = baseFreq + (speedRatio * (maxFreq - baseFreq));
        this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
        
        const targetVolume = 0.03 + (speedRatio * 0.04);
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
        // Synthwave looping bassline frequencies (D1, F1, G1, Bb1)
        const notes = [36.71, 43.65, 48.99, 58.27]; 
        
        this.bgmInterval = setInterval(() => {
            if (this.muted || gameState !== 'PLAYING') return;
            
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();
            
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(notes[noteIndex], now);
            
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(120, now);
            
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.005, now + 0.38);
            
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start(now);
            osc.stop(now + 0.38);
            
            noteIndex = (noteIndex + 1) % notes.length;
        }, 380);
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
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 1.2);
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, now);
        
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 1.2);
    }

    playPointSound() {
        if (this.muted || !this.initialized || !this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(698.46, now + 0.08); // F5
        osc.frequency.setValueAtTime(880.00, now + 0.16); // A5
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
    }

    playBoostSound() {
        if (this.muted || !this.initialized || !this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(1500, now + 0.5);
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, now);
        
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);
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
                this.setEngineSpeed(speed / 135);
                this.playBGM();
            }
        }
    }
}

const audio = new AudioSynth();

// --- Procedural 3D Model Builders ---

// Create a futuristic glowing sports car
function create3DCar(mainColor, isPlayer = false, isPolice = false) {
    const carGroup = new THREE.Group();

    // 1. Main Chassis/Body
    const bodyGeom = new THREE.BoxGeometry(16, 5, 30);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: mainColor,
        roughness: 0.1,
        metalness: 0.8
    });
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    bodyMesh.position.y = 3.5;
    carGroup.add(bodyMesh);

    // Front hood slant
    const hoodGeom = new THREE.BoxGeometry(15, 3, 10);
    const hoodMesh = new THREE.Mesh(hoodGeom, bodyMat);
    hoodMesh.position.set(0, 2.5, -12);
    hoodMesh.rotation.x = -0.15;
    carGroup.add(hoodMesh);

    // 2. Cockpit Canopy (Glass)
    const glassGeom = new THREE.BoxGeometry(12, 4.5, 12);
    const glassMat = new THREE.MeshStandardMaterial({
        color: 0x05040a,
        roughness: 0.05,
        transparent: true,
        opacity: 0.8
    });
    const glassMesh = new THREE.Mesh(glassGeom, glassMat);
    glassMesh.position.set(0, 6.5, 0);
    glassMesh.rotation.x = -0.1;
    carGroup.add(glassMesh);

    // Windshield frame glow strip
    const frameGeom = new THREE.BoxGeometry(12.5, 0.5, 0.5);
    const glowMat = new THREE.MeshStandardMaterial({
        color: mainColor,
        emissive: mainColor,
        emissiveIntensity: 1.5
    });
    const frameGlow = new THREE.Mesh(frameGeom, glowMat);
    frameGlow.position.set(0, 6.6, -6.1);
    carGroup.add(frameGlow);

    // 3. Wheels (Cylinders)
    const wheelGeom = new THREE.CylinderGeometry(4.5, 4.5, 3, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    wheelGeom.rotateZ(Math.PI / 2); // rotate cylinder

    const wheels = [];
    const wheelPositions = [
        [-9, 3, -9],  // Front Left
        [9, 3, -9],   // Front Right
        [-9, 3, 9],   // Rear Left
        [9, 3, 9]     // Rear Right
    ];

    wheelPositions.forEach((pos, idx) => {
        const wheel = new THREE.Mesh(wheelGeom, wheelMat);
        wheel.position.set(pos[0], pos[1], pos[2]);
        carGroup.add(wheel);
        wheels.push(wheel);

        // Neon Wheel Rim Glow rings
        const rimGeom = new THREE.RingGeometry(3, 3.5, 16);
        const rim = new THREE.Mesh(rimGeom, glowMat);
        rim.position.set(pos[0] + (pos[0] > 0 ? 1.55 : -1.55), pos[1], pos[2]);
        rim.rotation.y = Math.PI / 2;
        carGroup.add(rim);
    });

    // Save wheels reference for rotation animation
    carGroup.userData = { wheels: wheels };

    // 4. Glowing lights
    if (isPlayer) {
        // Cyan Headlights
        const headGeom = new THREE.BoxGeometry(3, 1, 1);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 });
        const headL = new THREE.Mesh(headGeom, headMat);
        headL.position.set(-5, 2.5, -17);
        const headR = headL.clone();
        headR.position.x = 5;
        carGroup.add(headL);
        carGroup.add(headR);

        // Red Taillights
        const tailGeom = new THREE.BoxGeometry(4, 1, 1);
        const tailMat = new THREE.MeshStandardMaterial({ color: 0xff0033, emissive: 0xff0033, emissiveIntensity: 2 });
        const tailL = new THREE.Mesh(tailGeom, tailMat);
        tailL.position.set(-5, 3.5, 15);
        const tailR = tailL.clone();
        tailR.position.x = 5;
        carGroup.add(tailL);
        carGroup.add(tailR);
    } else if (isPolice) {
        // Red / Blue Flashing police siren bar on top
        const sirenGeom = new THREE.BoxGeometry(6, 1.2, 2);
        const redSirenMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });
        const blueSirenMat = new THREE.MeshStandardMaterial({ color: 0x0000ff, emissive: 0x0000ff, emissiveIntensity: 2 });
        
        const sirenL = new THREE.Mesh(sirenGeom, redSirenMat);
        sirenL.position.set(-3, 8.8, 0);
        const sirenR = new THREE.Mesh(sirenGeom, blueSirenMat);
        sirenR.position.set(3, 8.8, 0);
        
        carGroup.add(sirenL);
        carGroup.add(sirenR);
        
        carGroup.userData.sirenL = sirenL;
        carGroup.userData.sirenR = sirenR;
        carGroup.userData.isPolice = true;
    } else {
        // Standard Red taillights for obstacles
        const tailGeom = new THREE.BoxGeometry(3, 0.8, 1);
        const tailMat = new THREE.MeshStandardMaterial({ color: 0xff0033, emissive: 0xff0033, emissiveIntensity: 1.5 });
        const tailL = new THREE.Mesh(tailGeom, tailMat);
        tailL.position.set(-5, 3.5, 15.1);
        const tailR = tailL.clone();
        tailR.position.x = 5;
        carGroup.add(tailL);
        carGroup.add(tailR);
    }

    return carGroup;
}

// Create 3D lightning bolt boost model
function create3DPowerup() {
    const group = new THREE.Group();
    
    // Construct bolt shape out of two pyramids/tetrahedrons
    const geom1 = new THREE.ConeGeometry(4, 12, 4);
    const mat = new THREE.MeshStandardMaterial({
        color: COLOR_CYAN,
        emissive: COLOR_CYAN,
        emissiveIntensity: 2.0
    });
    
    const cone1 = new THREE.Mesh(geom1, mat);
    cone1.rotation.x = Math.PI;
    cone1.position.y = 4;
    
    const cone2 = new THREE.Mesh(geom1, mat);
    cone2.position.set(2, -4, 0);
    
    group.add(cone1);
    group.add(cone2);
    group.add(new THREE.PointLight(COLOR_CYAN, 1.5, 30));
    
    group.position.y = 8;
    return group;
}

// --- Scene Initialization ---

function initThree() {
    // 1. Create Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05040a, 0.0035); // fog fade in the distance

    // 2. Create Camera
    camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 1, 1000);
    
    // 3. Create WebGL Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit DPR for performance

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0x402b80, 0.6); // Deep violet background ambient
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(0, 100, -50);
    scene.add(dirLight);

    // 5. Build 3D Road Mesh
    createRoadMesh();

    // 6. Build Player Car
    playerCar = create3DCar(COLOR_CYAN, true);
    scene.add(playerCar);

    // Under-glow point light for player car
    const playerGlowLight = new THREE.PointLight(COLOR_CYAN, 2, 45);
    playerGlowLight.position.set(0, -2, 0);
    playerCar.add(playerGlowLight);
}

// Procedural highway meshes
function createRoadMesh() {
    // Road asphalt plane
    const roadGeom = new THREE.PlaneGeometry(ROAD_WIDTH, 1200);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x07060b, roughness: 0.6 });
    const road = new THREE.Mesh(roadGeom, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -500);
    scene.add(road);

    // Dynamic Dashed Lane dividers (moving)
    const laneGeom = new THREE.BoxGeometry(1.5, 0.1, 15);
    const laneMat = new THREE.MeshStandardMaterial({
        color: COLOR_CYAN,
        emissive: COLOR_CYAN,
        emissiveIntensity: 1.0
    });

    // Dynamic Pink barriers on the side
    const barrierGeom = new THREE.BoxGeometry(2, 4, 1200);
    const barrierMat = new THREE.MeshStandardMaterial({
        color: COLOR_PINK,
        emissive: COLOR_PINK,
        emissiveIntensity: 1.5
    });

    const leftBarrier = new THREE.Mesh(barrierGeom, barrierMat);
    leftBarrier.position.set(-ROAD_WIDTH / 2 - 1, 2, -500);
    scene.add(leftBarrier);

    const rightBarrier = leftBarrier.clone();
    rightBarrier.position.x = ROAD_WIDTH / 2 + 1;
    scene.add(rightBarrier);

    // Create pooled dynamic items that move backward (lane lines, barrier light bars)
    // Dashed lines between lanes (Lanes are at X: -40, 0, 40)
    // Lines drawn at X: -20, 20
    const lineXPositions = [-LANE_WIDTH / 2, LANE_WIDTH / 2];
    
    for (let z = 0; z > -1000; z -= 80) {
        lineXPositions.forEach(x => {
            const laneLine = new THREE.Mesh(laneGeom, laneMat);
            laneLine.position.set(x, 0.1, z);
            scene.add(laneLine);
            roadSegments.push(laneLine);
        });

        // Running lights on barriers
        const sideLightGeom = new THREE.BoxGeometry(0.5, 1, 10);
        const sideLightMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 2.0
        });

        const lightL = new THREE.Mesh(sideLightGeom, sideLightMat);
        lightL.position.set(-ROAD_WIDTH / 2 - 0.5, 3, z);
        scene.add(lightL);
        lightsPool.push(lightL);

        const lightR = new THREE.Mesh(sideLightGeom, sideLightMat);
        lightR.position.set(ROAD_WIDTH / 2 + 0.5, 3, z);
        scene.add(lightR);
        lightsPool.push(lightR);
    }
}

// High-performance Particle Explosions
class ThreeParticle {
    constructor(x, y, z, color) {
        const geom = new THREE.SphereGeometry(Math.random() * 1.5 + 0.5, 4, 4);
        const mat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 1
        });
        this.mesh = new THREE.Mesh(geom, mat);
        this.mesh.position.set(x, y, z);
        scene.add(this.mesh);

        this.vx = (Math.random() - 0.5) * 8;
        this.vy = Math.random() * 6 + 2;
        this.vz = (Math.random() - 0.5) * 8;
        this.decay = Math.random() * 0.02 + 0.015;
    }

    update() {
        this.mesh.position.x += this.vx;
        this.mesh.position.y += this.vy;
        this.mesh.position.z += this.vz;
        
        this.vy -= 0.25; // gravity
        this.mesh.material.opacity -= this.decay;

        if (this.mesh.material.opacity <= 0) {
            scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            return false;
        }
        return true;
    }
}

function spawn3DExplosion(x, y, z, colorCode) {
    for (let i = 0; i < 30; i++) {
        particles.push(new ThreeParticle(x, y, z, colorCode));
    }
}

// --- Input Handling ---

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
    currentLaneIndex = Math.max(0, Math.min(lanesX.length - 1, currentLaneIndex + direction));
    playerCar.userData.targetX = lanesX[currentLaneIndex];
}

// Start / Restart Actions
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
audioToggle.addEventListener('click', () => audio.toggleMute());

function startGame() {
    audio.init();
    
    // Reset state
    gameState = 'PLAYING';
    score = 0;
    speed = 40;
    targetSpeed = 85;
    currentLaneIndex = 1;
    
    playerCar.position.set(lanesX[currentLaneIndex], 0, 0);
    playerCar.userData.targetX = lanesX[currentLaneIndex];
    playerCar.rotation.set(0, 0, 0);

    // Clean old obstacles
    obstacles.forEach(obs => {
        scene.remove(obs);
    });
    obstacles = [];

    // Clean old powerups
    powerups.forEach(p => {
        scene.remove(p);
    });
    powerups = [];

    // Clean old particles
    particles.forEach(p => {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
    });
    particles = [];

    boostTimer = 0;
    cameraShake = 0;
    frameCount = 0;

    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    audio.setEngineSpeed(speed / 135);
    audio.playBGM();
}

function gameOver() {
    gameState = 'GAMEOVER';
    cameraShake = 35; // Trigger camera shake
    audio.stopEngine();
    audio.stopBGM();
    audio.playCrashSound();

    // Spin car out dynamically on crash
    playerCar.rotation.y = Math.PI / 4;
    playerCar.rotation.z = Math.PI / 8;

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('neon_drift_3d_highscore', highScore);
        highScoreVal.innerText = String(highScore).padStart(4, '0');
    }

    finalScoreVal.innerText = score;
    gameOverScreen.classList.remove('hidden');
}

// --- Main 3D Animation & Logic Frame Loop ---

function gameLoop() {
    frameCount++;

    if (gameState === 'PLAYING') {
        // --- Speed Controls ---
        if (boostTimer > 0) {
            boostTimer--;
            speed = 145; // Max nos speed
            targetSpeed = 145;
            
            // Spawn exhaust spark particles
            if (frameCount % 2 === 0) {
                particles.push(new ThreeParticle(playerCar.position.x - 5, 2, playerCar.position.z + 15, COLOR_CYAN));
                particles.push(new ThreeParticle(playerCar.position.x + 5, 2, playerCar.position.z + 15, COLOR_CYAN));
            }
        } else {
            if (speed < targetSpeed) {
                speed += 0.25;
            } else if (speed > targetSpeed) {
                speed -= 0.2;
            }

            // Slowly scale difficulty
            if (frameCount % 600 === 0) {
                targetSpeed = Math.min(125, targetSpeed + 5);
                audio.playPointSound(); // Milestone ping
            }
        }

        // Display HUD metrics
        score = Math.floor(frameCount / 8);
        if (boostTimer > 0) score += Math.floor(frameCount / 4); // Boost bonus points
        scoreVal.innerText = String(score).padStart(4, '0');
        speedVal.innerText = `${Math.floor(speed)} km/h`;

        // Engine Pitch
        audio.setEngineSpeed(speed / 145);

        // --- Player Movement & Tilt ---
        const diffX = playerCar.userData.targetX - playerCar.position.x;
        playerCar.position.x += diffX * 0.14;
        
        // Dynamically tilt the car group during lane switches (adds realism!)
        playerCar.rotation.y = -diffX * 0.02;
        playerCar.rotation.z = diffX * 0.03;

        // Rotate wheels based on scrolling speed
        if (playerCar.userData.wheels) {
            playerCar.userData.wheels.forEach(wheel => {
                wheel.rotation.x -= speed * 0.003;
            });
        }

        // --- Scrolling Road segments & Lights ---
        // Scroll lane dividers toward player (positive Z)
        roadSegments.forEach(segment => {
            segment.position.z += speed * 0.15;
            if (segment.position.z > 50) {
                segment.position.z = -900; // Reset to horizon
            }
        });

        // Scroll barrier running lights
        lightsPool.forEach(light => {
            light.position.z += speed * 0.15;
            if (light.position.z > 50) {
                light.position.z = -900;
            }
        });

        // --- Spawning Obstacle Cars ---
        const spawnInterval = Math.max(50, 130 - Math.floor(speed * 0.6));
        if (frameCount % spawnInterval === 0) {
            const laneIndex = Math.floor(Math.random() * lanesX.length);
            const obsX = lanesX[laneIndex];
            
            const isPolice = Math.random() < 0.2;
            const colors = [COLOR_PINK, COLOR_PURPLE, COLOR_YELLOW, COLOR_GREEN];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            
            const obs = create3DCar(isPolice ? 0x0f0e15 : randomColor, false, isPolice);
            obs.position.set(obsX, 0, -800); // spawn far away
            
            // Relative speed (slower than player)
            obs.userData = { 
                speedZ: (speed * 0.08) + Math.random() * 2 + 1,
                colorHex: isPolice ? COLOR_PINK : randomColor
            };
            
            scene.add(obs);
            obstacles.push(obs);
        }

        // --- Spawning Boost Powerups ---
        if (frameCount % 500 === 0 && boostTimer === 0) {
            const laneIndex = Math.floor(Math.random() * lanesX.length);
            const p = create3DPowerup();
            p.position.set(lanesX[laneIndex], 0, -800);
            scene.add(p);
            powerups.push(p);
        }

        // --- Update Powerups ---
        for (let i = powerups.length - 1; i >= 0; i--) {
            const p = powerups[i];
            p.position.z += speed * 0.15; // Move down with road speed
            
            // Rotate powerup
            p.rotation.y += 0.05;

            if (p.position.z > 50) {
                scene.remove(p);
                powerups.splice(i, 1);
                continue;
            }

            // Collision Check (Distance based)
            const dist = p.position.distanceTo(playerCar.position);
            if (dist < 22) {
                boostTimer = 180; // 3 seconds nos
                audio.playBoostSound();
                spawn3DExplosion(p.position.x, p.position.y + 4, p.position.z, COLOR_CYAN);
                scene.remove(p);
                powerups.splice(i, 1);
            }
        }

        // --- Update Obstacles ---
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obs = obstacles[i];
            
            // Move relative to player speed
            obs.position.z += obs.userData.speedZ;

            // Rotate wheels
            if (obs.userData.wheels) {
                obs.userData.wheels.forEach(wheel => {
                    wheel.rotation.x -= obs.userData.speedZ * 0.05;
                });
            }

            // Police flashing siren logic
            if (obs.userData.isPolice && frameCount % 6 === 0) {
                const flash = Math.floor(frameCount / 6) % 2 === 0;
                obs.userData.sirenL.material.emissiveIntensity = flash ? 3 : 0.2;
                obs.userData.sirenR.material.emissiveIntensity = flash ? 0.2 : 3;
            }

            if (obs.position.z > 100) {
                scene.remove(obs);
                obstacles.splice(i, 1);
                continue;
            }

            // 3D Collision Detection (Box vs Box intersection)
            const playerBox = new THREE.Box3().setFromObject(playerCar);
            const obsBox = new THREE.Box3().setFromObject(obs);
            
            // Shrink boxes slightly for fair collision physics
            playerBox.expandByScalar(-1.5);
            obsBox.expandByScalar(-1.5);

            if (playerBox.intersectsBox(obsBox)) {
                if (boostTimer > 0) {
                    // Destroy obstacle during active boost
                    spawn3DExplosion(obs.position.x, obs.position.y + 3, obs.position.z, obs.userData.colorHex);
                    audio.playCrashSound();
                    cameraShake = 10;
                    scene.remove(obs);
                    obstacles.splice(i, 1);
                } else {
                    // Normal Game Over Crash
                    spawn3DExplosion(playerCar.position.x, playerCar.position.y + 3, playerCar.position.z, COLOR_CYAN);
                    spawn3DExplosion(obs.position.x, obs.position.y + 3, obs.position.z, obs.userData.colorHex);
                    gameOver();
                }
            }
        }

    } else {
        // Idle state road scroll
        roadSegments.forEach(segment => {
            segment.position.z += 1.5;
            if (segment.position.z > 50) segment.position.z = -900;
        });
        lightsPool.forEach(light => {
            light.position.z += 1.5;
            if (light.position.z > 50) light.position.z = -900;
        });
        obstacles.forEach(obs => {
            obs.position.z += 0.5;
        });
    }

    // --- Update Particles ---
    for (let i = particles.length - 1; i >= 0; i--) {
        const active = particles[i].update();
        if (!active) {
            particles.splice(i, 1);
        }
    }

    // --- Dynamic Tracking Camera Physics ---
    if (gameState === 'PLAYING') {
        // Smooth target follow
        const targetCamX = playerCar.position.x * 0.6;
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.05);
        
        // Boost changes FOV (Zoom stretch effect)
        const targetFov = boostTimer > 0 ? 74 : 60;
        if (Math.abs(camera.fov - targetFov) > 0.1) {
            camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.08);
            camera.updateProjectionMatrix();
        }

        // Standard height and depth relative to player car
        camera.position.y = 26;
        camera.position.z = playerCar.position.z + 46;
        camera.lookAt(playerCar.position.x * 0.8, playerCar.position.y + 4, playerCar.position.z - 25);
    } else if (gameState === 'START') {
        // Cinematic panning angle on start menu
        camera.position.set(0, 30, 60);
        camera.lookAt(0, 5, -10);
    }

    // Apply Screen Shake if active (panning the camera by offsets)
    if (cameraShake > 0) {
        camera.position.x += (Math.random() - 0.5) * cameraShake * 0.15;
        camera.position.y += (Math.random() - 0.5) * cameraShake * 0.15;
        cameraShake *= 0.9; // decay
        if (cameraShake < 0.1) cameraShake = 0;
    }

    // 7. Render frame
    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
}

// Window resize handler
window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    }
});

// Setup and start loop
initThree();
requestAnimationFrame(gameLoop);
