// Neon Drift 3D - Three.js WebGL Engine - VISUAL UPGRADE EDITION

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
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(698.46, now + 0.08);
        osc.frequency.setValueAtTime(880.00, now + 0.16);
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

// Create a highly detailed shiny metallic sports car
function create3DCar(mainColor, isPlayer = false, isPolice = false) {
    const carGroup = new THREE.Group();

    // 1. Shiny Metallic Car Body material (Asphalt metallic paint style)
    const bodyMat = new THREE.MeshStandardMaterial({
        color: mainColor,
        roughness: 0.1,  // Very smooth and shiny
        metalness: 0.9   // Highly metallic reflections
    });

    // Main central chassis box
    const centerGeom = new THREE.BoxGeometry(16, 4.5, 32);
    const centerMesh = new THREE.Mesh(centerGeom, bodyMat);
    centerMesh.position.y = 3.2;
    carGroup.add(centerMesh);

    // Front Slanted Hood (Aerodynamic look)
    const hoodGeom = new THREE.BoxGeometry(15.2, 2.5, 12);
    const hoodMesh = new THREE.Mesh(hoodGeom, bodyMat);
    hoodMesh.position.set(0, 2.2, -12);
    hoodMesh.rotation.x = -0.16; // Slanted hood
    carGroup.add(hoodMesh);

    // Side doors/Skirt panels (aerodynamic side panels)
    const skirtGeom = new THREE.BoxGeometry(17.5, 3.5, 24);
    const skirtMesh = new THREE.Mesh(skirtGeom, bodyMat);
    skirtMesh.position.set(0, 2.8, 0);
    carGroup.add(skirtMesh);

    // 2. Cockpit Canopy (Windshield & Roof)
    const cabinGeom = new THREE.BoxGeometry(11.5, 4.2, 14);
    const cabinMat = new THREE.MeshStandardMaterial({
        color: 0x05040a,
        roughness: 0.02,
        transparent: true,
        opacity: 0.85
    });
    const cabinMesh = new THREE.Mesh(cabinGeom, cabinMat);
    cabinMesh.position.set(0, 6.5, 1);
    cabinMesh.rotation.x = -0.12;
    carGroup.add(cabinMesh);

    // Glowing Neon Edge Contours along the cabin frame
    const glowMat = new THREE.MeshStandardMaterial({
        color: mainColor,
        emissive: mainColor,
        emissiveIntensity: 2.2
    });
    
    // Windshield top bar glow
    const windshieldBarGeom = new THREE.BoxGeometry(11.6, 0.4, 0.4);
    const windshieldBar = new THREE.Mesh(windshieldBarGeom, glowMat);
    windshieldBar.position.set(0, 6.7, -6.1);
    carGroup.add(windshieldBar);

    // 3. Rear Spoiler (Wing) for aerodynamic sports look
    const spoilerStrutGeom = new THREE.BoxGeometry(1.2, 4, 1.2);
    const spoilerStrutL = new THREE.Mesh(spoilerStrutGeom, bodyMat);
    spoilerStrutL.position.set(-6.5, 6.5, 13.5);
    spoilerStrutL.rotation.x = 0.2;
    const spoilerStrutR = spoilerStrutL.clone();
    spoilerStrutR.position.x = 6.5;
    carGroup.add(spoilerStrutL);
    carGroup.add(spoilerStrutR);

    // Spoiler Wing blade
    const wingGeom = new THREE.BoxGeometry(18.5, 0.8, 5);
    const wingMesh = new THREE.Mesh(wingGeom, bodyMat);
    wingMesh.position.set(0, 8.5, 14.5);
    wingMesh.rotation.x = -0.05; // slight angle
    carGroup.add(wingMesh);

    // Glowing neon stripe on the edge of the spoiler wing
    const wingNeonGeom = new THREE.BoxGeometry(18.7, 0.3, 0.3);
    const wingNeon = new THREE.Mesh(wingNeonGeom, glowMat);
    wingNeon.position.set(0, 8.5, 17.1);
    carGroup.add(wingNeon);

    // 4. Wheels with Silver Rim details
    const tireGeom = new THREE.CylinderGeometry(4.5, 4.5, 3, 16);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    tireGeom.rotateZ(Math.PI / 2);

    const rimGeom = new THREE.CylinderGeometry(2.8, 2.8, 3.2, 12);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 }); // Shiny silver rims
    rimGeom.rotateZ(Math.PI / 2);

    const wheels = [];
    const wheelPositions = [
        [-9, 3, -9],  // Front Left
        [9, 3, -9],   // Front Right
        [-9, 3, 9],   // Rear Left
        [9, 3, 9]     // Rear Right
    ];

    wheelPositions.forEach((pos) => {
        // Black rubber tire
        const tire = new THREE.Mesh(tireGeom, tireMat);
        tire.position.set(pos[0], pos[1], pos[2]);
        carGroup.add(tire);
        wheels.push(tire);

        // Shiny silver rim inside wheel hub
        const rim = new THREE.Mesh(rimGeom, rimMat);
        rim.position.set(pos[0] + (pos[0] > 0 ? 0.1 : -0.1), pos[1], pos[2]);
        carGroup.add(rim);

        // Neon Wheel Rim Glow rings on outer edge
        const rimGlowGeom = new THREE.RingGeometry(2.7, 3.1, 16);
        const rimGlow = new THREE.Mesh(rimGlowGeom, glowMat);
        rimGlow.position.set(pos[0] + (pos[0] > 0 ? 1.62 : -1.62), pos[1], pos[2]);
        rimGlow.rotation.y = Math.PI / 2;
        carGroup.add(rimGlow);
    });

    carGroup.userData = { wheels: wheels };

    // 5. Glowing lights (Fitted to backs/fronts)
    if (isPlayer) {
        // Front White xenon headlights
        const headGeom = new THREE.BoxGeometry(3, 0.8, 1);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.5 });
        const headL = new THREE.Mesh(headGeom, headMat);
        headL.position.set(-5, 2.5, -17.5);
        const headR = headL.clone();
        headR.position.x = 5;
        carGroup.add(headL);
        carGroup.add(headR);

        // Bright Red LED tail strip
        const tailGeom = new THREE.BoxGeometry(14, 0.6, 0.6);
        const tailMat = new THREE.MeshStandardMaterial({ color: 0xff0033, emissive: 0xff0033, emissiveIntensity: 3.5 });
        const tailLight = new THREE.Mesh(tailGeom, tailMat);
        tailLight.position.set(0, 3.8, 16.1);
        carGroup.add(tailLight);
    } else if (isPolice) {
        // Red / Blue Flashing police siren bar on top of cabin
        const sirenGeom = new THREE.BoxGeometry(5, 1.0, 1.8);
        const redSirenMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 3.0 });
        const blueSirenMat = new THREE.MeshStandardMaterial({ color: 0x0000ff, emissive: 0x0000ff, emissiveIntensity: 3.0 });
        
        const sirenL = new THREE.Mesh(sirenGeom, redSirenMat);
        sirenL.position.set(-2.5, 8.6, 1.0);
        const sirenR = new THREE.Mesh(sirenGeom, blueSirenMat);
        sirenR.position.set(2.5, 8.6, 1.0);
        
        carGroup.add(sirenL);
        carGroup.add(sirenR);
        
        carGroup.userData.sirenL = sirenL;
        carGroup.userData.sirenR = sirenR;
        carGroup.userData.isPolice = true;

        // Glowing blue under-glow for police
        const copGlowLight = new THREE.PointLight(0x0000ff, 2.5, 30);
        copGlowLight.position.set(0, -1, 0);
        carGroup.add(copGlowLight);

        // Standard taillights for visibility
        const tailGeom = new THREE.BoxGeometry(12, 0.6, 0.6);
        const tailMat = new THREE.MeshStandardMaterial({ color: 0xff0033, emissive: 0xff0033, emissiveIntensity: 3.0 });
        const tailLight = new THREE.Mesh(tailGeom, tailMat);
        tailLight.position.set(0, 3.8, 16.1);
        carGroup.add(tailLight);
    } else {
        // IMPORTANT: Bright glowing taillights & License plate so other cars are extremely visible in the dark!
        const tailGeom = new THREE.BoxGeometry(4, 0.8, 0.6);
        const tailMat = new THREE.MeshStandardMaterial({ color: 0xff0033, emissive: 0xff0033, emissiveIntensity: 4.0 }); // Very high intensity
        const tailL = new THREE.Mesh(tailGeom, tailMat);
        tailL.position.set(-5, 3.6, 16.1);
        const tailR = tailL.clone();
        tailR.position.x = 5;
        carGroup.add(tailL);
        carGroup.add(tailR);

        // Neon contour lines on the back bumper of obstacle cars so they stand out
        const bumperNeonGeom = new THREE.BoxGeometry(14, 0.4, 0.4);
        const bumperNeon = new THREE.Mesh(bumperNeonGeom, glowMat);
        bumperNeon.position.set(0, 1.8, 16.1);
        carGroup.add(bumperNeon);

        // Highlight headlights of enemy cars (pointing forward, casts subtle ambient glow)
        const enemyHeadGeom = new THREE.BoxGeometry(3, 0.8, 1);
        const enemyHeadMat = new THREE.MeshStandardMaterial({ color: 0xffea00, emissive: 0xffea00, emissiveIntensity: 2.0 });
        const enemyHeadL = new THREE.Mesh(enemyHeadGeom, enemyHeadMat);
        enemyHeadL.position.set(-5, 2.5, -17.5);
        const enemyHeadR = enemyHeadL.clone();
        enemyHeadR.position.x = 5;
        carGroup.add(enemyHeadL);
        carGroup.add(enemyHeadR);
    }

    return carGroup;
}

// Create 3D lightning bolt boost model
function create3DPowerup() {
    const group = new THREE.Group();
    
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
    
    // REDUCED FOG DENSITY (0.002 instead of 0.0035) to allow visibility of cars at the horizon
    scene.fog = new THREE.FogExp2(0x05040a, 0.002); 

    // 2. Create Camera
    camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 1, 1000);
    
    // 3. Create WebGL Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 4. BRIGHTER SCENE LIGHTING (Ambient increased from 0.6 to 0.95, lighter indigo color)
    const ambientLight = new THREE.AmbientLight(0x5a4a9b, 0.95); 
    scene.add(ambientLight);

    // Directional light positioned behind the camera to light up the backs of traffic cars clearly
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4); 
    dirLight.position.set(0, 120, 150); // angled slightly from behind/above
    scene.add(dirLight);

    // Extra fill light from the front
    const fillLight = new THREE.DirectionalLight(COLOR_PURPLE, 0.4);
    fillLight.position.set(0, 50, -400);
    scene.add(fillLight);

    // 5. Build 3D Road Mesh
    createRoadMesh();

    // 6. Build Player Car
    playerCar = create3DCar(COLOR_CYAN, true);
    scene.add(playerCar);

    // Under-glow point light for player car
    const playerGlowLight = new THREE.PointLight(COLOR_CYAN, 2.5, 45);
    playerGlowLight.position.set(0, -2, 0);
    playerCar.add(playerGlowLight);
}

// Procedural highway meshes
function createRoadMesh() {
    const roadGeom = new THREE.PlaneGeometry(ROAD_WIDTH, 1200);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x07060b, roughness: 0.6 });
    const road = new THREE.Mesh(roadGeom, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -500);
    scene.add(road);

    const laneGeom = new THREE.BoxGeometry(1.5, 0.1, 15);
    const laneMat = new THREE.MeshStandardMaterial({
        color: COLOR_CYAN,
        emissive: COLOR_CYAN,
        emissiveIntensity: 1.2
    });

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

    const lineXPositions = [-LANE_WIDTH / 2, LANE_WIDTH / 2];
    
    for (let z = 0; z > -1000; z -= 80) {
        lineXPositions.forEach(x => {
            const laneLine = new THREE.Mesh(laneGeom, laneMat);
            laneLine.position.set(x, 0.1, z);
            scene.add(laneLine);
            roadSegments.push(laneLine);
        });

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

// Particle System
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
    
    playerCar.position.set(lanesX[currentLaneIndex], 0, 0);
    playerCar.userData.targetX = lanesX[currentLaneIndex];
    playerCar.rotation.set(0, 0, 0);

    obstacles.forEach(obs => {
        scene.remove(obs);
    });
    obstacles = [];

    powerups.forEach(p => {
        scene.remove(p);
    });
    powerups = [];

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
    cameraShake = 35;
    audio.stopEngine();
    audio.stopBGM();
    audio.playCrashSound();

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
        if (boostTimer > 0) {
            boostTimer--;
            speed = 145;
            targetSpeed = 145;
            
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

            if (frameCount % 600 === 0) {
                targetSpeed = Math.min(125, targetSpeed + 5);
                audio.playPointSound();
            }
        }

        score = Math.floor(frameCount / 8);
        if (boostTimer > 0) score += Math.floor(frameCount / 4);
        scoreVal.innerText = String(score).padStart(4, '0');
        speedVal.innerText = `${Math.floor(speed)} km/h`;

        audio.setEngineSpeed(speed / 145);

        // Player movement
        const diffX = playerCar.userData.targetX - playerCar.position.x;
        playerCar.position.x += diffX * 0.14;
        
        playerCar.rotation.y = -diffX * 0.02;
        playerCar.rotation.z = diffX * 0.03;

        if (playerCar.userData.wheels) {
            playerCar.userData.wheels.forEach(wheel => {
                wheel.rotation.x -= speed * 0.003;
            });
        }

        // Scroll lanes
        roadSegments.forEach(segment => {
            segment.position.z += speed * 0.15;
            if (segment.position.z > 50) {
                segment.position.z = -900;
            }
        });

        // Scroll barrier lights
        lightsPool.forEach(light => {
            light.position.z += speed * 0.15;
            if (light.position.z > 50) {
                light.position.z = -900;
            }
        });

        // Spawn Obstacles
        const spawnInterval = Math.max(50, 130 - Math.floor(speed * 0.6));
        if (frameCount % spawnInterval === 0) {
            const laneIndex = Math.floor(Math.random() * lanesX.length);
            const obsX = lanesX[laneIndex];
            
            const isPolice = Math.random() < 0.2;
            const colors = [COLOR_PINK, COLOR_PURPLE, COLOR_YELLOW, COLOR_GREEN];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            
            const obs = create3DCar(isPolice ? 0x0f0e15 : randomColor, false, isPolice);
            obs.position.set(obsX, 0, -800);
            
            obs.userData = { 
                speedZ: (speed * 0.08) + Math.random() * 2 + 1,
                colorHex: isPolice ? COLOR_PINK : randomColor,
                isPolice: isPolice,
                sirenL: obs.userData.sirenL,
                sirenR: obs.userData.sirenR,
                wheels: obs.userData.wheels
            };
            
            scene.add(obs);
            obstacles.push(obs);
        }

        // Spawn Powerups
        if (frameCount % 500 === 0 && boostTimer === 0) {
            const laneIndex = Math.floor(Math.random() * lanesX.length);
            const p = create3DPowerup();
            p.position.set(lanesX[laneIndex], 0, -800);
            scene.add(p);
            powerups.push(p);
        }

        // Update Powerups
        for (let i = powerups.length - 1; i >= 0; i--) {
            const p = powerups[i];
            p.position.z += speed * 0.15;
            p.rotation.y += 0.05;

            if (p.position.z > 50) {
                scene.remove(p);
                powerups.splice(i, 1);
                continue;
            }

            const dist = p.position.distanceTo(playerCar.position);
            if (dist < 22) {
                boostTimer = 180;
                audio.playBoostSound();
                spawn3DExplosion(p.position.x, p.position.y + 4, p.position.z, COLOR_CYAN);
                scene.remove(p);
                powerups.splice(i, 1);
            }
        }

        // Update Obstacles
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obs = obstacles[i];
            obs.position.z += obs.userData.speedZ;

            if (obs.userData.wheels) {
                obs.userData.wheels.forEach(wheel => {
                    wheel.rotation.x -= obs.userData.speedZ * 0.05;
                });
            }

            // Flashing police siren bar
            if (obs.userData.isPolice && frameCount % 6 === 0) {
                const flash = Math.floor(frameCount / 6) % 2 === 0;
                if (obs.userData.sirenL && obs.userData.sirenR) {
                    obs.userData.sirenL.material.emissiveIntensity = flash ? 3 : 0.2;
                    obs.userData.sirenR.material.emissiveIntensity = flash ? 0.2 : 3;
                }
            }

            if (obs.position.z > 100) {
                scene.remove(obs);
                obstacles.splice(i, 1);
                continue;
            }

            // AABB Collision
            const playerBox = new THREE.Box3().setFromObject(playerCar);
            const obsBox = new THREE.Box3().setFromObject(obs);
            
            playerBox.expandByScalar(-1.5);
            obsBox.expandByScalar(-1.5);

            if (playerBox.intersectsBox(obsBox)) {
                if (boostTimer > 0) {
                    spawn3DExplosion(obs.position.x, obs.position.y + 3, obs.position.z, obs.userData.colorHex);
                    audio.playCrashSound();
                    cameraShake = 10;
                    scene.remove(obs);
                    obstacles.splice(i, 1);
                } else {
                    spawn3DExplosion(playerCar.position.x, playerCar.position.y + 3, playerCar.position.z, COLOR_CYAN);
                    spawn3DExplosion(obs.position.x, obs.position.y + 3, obs.position.z, obs.userData.colorHex);
                    gameOver();
                }
            }
        }

    } else {
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

    for (let i = particles.length - 1; i >= 0; i--) {
        const active = particles[i].update();
        if (!active) {
            particles.splice(i, 1);
        }
    }

    // Camera follow
    if (gameState === 'PLAYING') {
        const targetCamX = playerCar.position.x * 0.6;
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.05);
        
        const targetFov = boostTimer > 0 ? 74 : 60;
        if (Math.abs(camera.fov - targetFov) > 0.1) {
            camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.08);
            camera.updateProjectionMatrix();
        }

        camera.position.y = 26;
        camera.position.z = playerCar.position.z + 46;
        camera.lookAt(playerCar.position.x * 0.8, playerCar.position.y + 4, playerCar.position.z - 25);
    } else if (gameState === 'START') {
        camera.position.set(0, 30, 60);
        camera.lookAt(0, 5, -10);
    }

    if (cameraShake > 0) {
        camera.position.x += (Math.random() - 0.5) * cameraShake * 0.15;
        camera.position.y += (Math.random() - 0.5) * cameraShake * 0.15;
        cameraShake *= 0.9;
        if (cameraShake < 0.1) cameraShake = 0;
    }

    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
}

// Window resize
window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    }
});

// Setup
initThree();
requestAnimationFrame(gameLoop);
