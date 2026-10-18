Promise.all([
    import("https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js")
]).then(([
    { initializeApp },
    { getAuth, signInAnonymously, signInWithCustomToken },
    { getFirestore, doc, setDoc, collection, onSnapshot, getDocs, updateDoc }
]) => {
    const firebaseConfig = {
        apiKey: "AIzaSyAXz6ZF5h6yVneATilV2xdT4bAqny3kiPE",
        authDomain: "batalha-quintal.firebaseapp.com",
        projectId: "batalha-quintal",
        storageBucket: "batalha-quintal.firebasestorage.app",
        messagingSenderId: "912421588886",
        appId: "1:912421588886:web:7a3409dc3a2d56d6f557b7",
        measurementId: "G-XRTF7HJ8B6"
    };

    window.firebaseDb = null;
    window.currentUser = null;
    window.firebaseAppId = typeof __app_id !== 'undefined' ? __app_id : 'batalha-quintal-2';

    async function initFirebase() {
        try {
            const app = initializeApp(firebaseConfig);
            const auth = getAuth(app);
            window.firebaseDb = getFirestore(app);

            if (typeof __initial_auth_token !== 'undefined') {
                await signInWithCustomToken(auth, __initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }
            window.currentUser = auth.currentUser;
            document.getElementById('connectionStatus').innerText = "✅ Servidor Multiplayer Conectado";
            document.getElementById('connectionStatus').classList.replace('text-gray-400', 'text-green-400');
        } catch (e) {
            console.error("Firebase init error:", e);
            document.getElementById('connectionStatus').innerText = "❌ Offline (Erro de Conexão)";
        }
    }

    initFirebase();

    window.fb_setDoc = setDoc;
    window.fb_doc = doc;
    window.fb_collection = collection;
    window.fb_onSnapshot = onSnapshot;
    window.fb_getDocs = getDocs;
    window.fb_updateDoc = updateDoc;
});

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const WORLD_WIDTH = 2500;
const WORLD_HEIGHT = 1200; 
let camera = { x: 0, y: 0, targetX: 0, targetY: 0, lastImpactX: 0, lastImpactY: 0 };
let terrainPoints = [];
const TERRAIN_RESOLUTION = 10; 

const mainMenu = document.getElementById('mainMenu');
const charSelectMenu = document.getElementById('charSelectMenu');
const gameHud = document.getElementById('gameHud');
const gameOverScreen = document.getElementById('gameOverScreen');
const charSelectTitle = document.getElementById('charSelectTitle');
const floatingMessage = document.getElementById('floatingMessage');
const powerBar = document.getElementById('powerBar');
const uiLayer = document.getElementById('uiLayer');

let gameState = 'MENU';
let playMode = 'local';
let aiDifficulty = 'easy'; 
let p1Selection = null;
let p2Selection = null;
let isP1Selecting = true;
let isPaused = false; 

const GRAVITY = 0.25;
let wind = 0;
let currentPlayer = 1;
let actionState = 'IDLE'; 
let mouseScreenX = 0, mouseScreenY = 0;
let aimAngle = 0;
let power = 0;
const maxPower = 40; 
let isPointerDown = false;
let screenShake = 0;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let windGain = null;

function initWindAudio() {
    if (windGain) return;
    let bufferSize = 2 * audioCtx.sampleRate;
    let noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    let output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    
    let whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;
    
    let filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 200; 
    
    windGain = audioCtx.createGain();
    windGain.gain.value = 0;
    
    whiteNoise.connect(filter);
    filter.connect(windGain);
    windGain.connect(audioCtx.destination);
    whiteNoise.start();
}

function playSwoosh() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.start(); osc.stop(audioCtx.currentTime + 0.3);
}

function playHitSound(isHeadshot) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    let t = audioCtx.currentTime;
    
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(10, t + 0.2);
    gain.gain.setValueAtTime(1.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    osc.start(t); osc.stop(t + 0.2);

    if (isHeadshot) {
        let crack = audioCtx.createOscillator();
        let crackGain = audioCtx.createGain();
        crack.connect(crackGain); crackGain.connect(audioCtx.destination);
        crack.type = 'triangle';
        crack.frequency.setValueAtTime(1200, t);
        crack.frequency.exponentialRampToValueAtTime(200, t + 0.1);
        crackGain.gain.setValueAtTime(1.2, t);
        crackGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        crack.start(t); crack.stop(t + 0.1);
    }
}

let players = [];
let projectiles = [];
let particles = [];
let leaves = [];
let crates = [];

const WEAPONS = {
    'normal': { name: 'Normal', damageMult: 1, radius: 8, color: '#aaa' },
    'giant': { name: 'Gigante', damageMult: 2.5, radius: 18, color: '#f00' },
    'triple': { name: 'Triplo', damageMult: 0.7, radius: 6, color: '#ff0', count: 3 }
};

let matchId = null;
let myPlayerNum = 1;
let unsubMatch = null;

class Player {
    constructor(id, type, x) {
        this.id = id;
        this.type = type; 
        this.x = x;
        this.width = 40;
        this.height = 65;
        this.y = getTerrainHeightAt(this.x); 
        this.maxHp = 150;
        this.hp = this.maxHp;
        this.weapon = 'normal';
        this.lastShot = { angle: null, power: null };
        this.throwAnimTimer = 0;
        
        this.hitboxes = {
            head: { yOffset: -55, radius: 14, mult: 2.0 },
            body: { yOffset: -35, w: 28, h: 25, mult: 1.0 },
            legs: { yOffset: -12, w: 24, h: 15, mult: 0.5 }
        };
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        let damageRatio = 1 - (this.hp / this.maxHp);
        let isDead = this.hp <= 0;
        let isCurrent = (players[currentPlayer-1] === this);

        if (isDead) {
            ctx.rotate(Math.PI / 2);
            ctx.translate(-30, -10);
        }

        ctx.fillStyle = this.type === 'girl' ? '#0ea5e9' : '#16a34a'; 
        ctx.fillRect(-12, -15, 10, 15);
        ctx.fillRect(2, -15, 10, 15);

        if (this.type === 'girl') {
            ctx.fillStyle = '#9333ea';
            ctx.beginPath();
            ctx.moveTo(-10, -45); ctx.lineTo(10, -45);
            ctx.lineTo(18, -15); ctx.lineTo(-18, -15);
            ctx.fill();
        } else {
            ctx.fillStyle = '#16a34a';
            ctx.fillRect(-14, -40, 28, 25);
        }

        if (damageRatio > 0.3) {
            ctx.fillStyle = 'rgba(153, 27, 27, 0.8)';
            ctx.beginPath(); ctx.arc(-6, -25, 5, 0, Math.PI*2); ctx.fill();
            if (damageRatio > 0.6) {
                ctx.beginPath(); ctx.arc(10, -18, 6, 0, Math.PI*2); ctx.fill();
            }
        }

        let armX = 0; let armY = -35;
        let armAngle = Math.PI / 2; 
        
        if (isCurrent && !isDead) {
            if (actionState === 'CHARGING' || actionState === 'AIMING') {
                armAngle = aimAngle;
                if (actionState === 'CHARGING') {
                    let pullBack = (power / maxPower) * 1.5;
                    if (this.id === 1) { 
                        armAngle -= pullBack;
                    } else { 
                        armAngle += pullBack;
                    }
                }
            } else if (this.throwAnimTimer > 0) {
                armAngle = aimAngle;
                this.throwAnimTimer -= 0.1;
            }
        }
        
        ctx.save();
        ctx.translate(armX, armY);
        ctx.rotate(armAngle);
        
        if (this.type === 'boy') {
            ctx.fillStyle = '#16a34a';
            ctx.fillRect(-6, -6, 12, 12);
        }
        
        ctx.fillStyle = '#ffdbac'; 
        ctx.fillRect(-4, -4, 25, 8); 
        
        if (isCurrent && actionState === 'CHARGING') {
            ctx.translate(25, 0);
            let wp = WEAPONS[this.weapon];
            let scale = wp.name === 'Gigante' ? 2.0 : 1;
            ctx.scale(scale, scale);
            if (this.type === 'girl') {
                ctx.fillStyle = '#8B4513'; ctx.fillRect(-8, -4, 16, 8); ctx.beginPath(); ctx.arc(8, 0, 4, 0, Math.PI*2); ctx.fill();
            } else {
                ctx.fillStyle = '#71717a'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2); ctx.fill();
            }
        }
        ctx.restore();

        ctx.fillStyle = '#ffdbac'; 
        ctx.beginPath();
        ctx.arc(0, -55, 15, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = damageRatio > 0.5 ? '#581c87' : 'white';
        ctx.beginPath(); ctx.arc(-5, -57, 4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(5, -57, 4, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath(); ctx.arc(-5, -57, 1.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(5, -57, 1.5, 0, Math.PI*2); ctx.fill();

        if (this.type === 'girl') {
            ctx.fillStyle = '#fde047'; 
            ctx.beginPath(); ctx.arc(0, -62, 12, Math.PI, 0); ctx.fill();
            ctx.beginPath(); ctx.arc(-16, -60, 8, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(16, -60, 8, 0, Math.PI*2); ctx.fill();
            ctx.fillRect(-22, -60, 8, 20); ctx.fillRect(14, -60, 8, 20);
            ctx.fillStyle = '#9333ea';
            ctx.fillRect(-19, -62, 6, 4); ctx.fillRect(13, -62, 6, 4);
            ctx.fillStyle = 'white';
            ctx.fillRect(-4, -48, 8, 4);
            ctx.strokeStyle = 'silver'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(-5, -46); ctx.lineTo(5, -46); ctx.stroke();
        } else {
            ctx.fillStyle = '#ea580c'; 
            ctx.beginPath();
            ctx.moveTo(-14, -60); ctx.lineTo(-10, -75); ctx.lineTo(-4, -65);
            ctx.lineTo(0, -80); ctx.lineTo(4, -65); ctx.lineTo(10, -75);
            ctx.lineTo(14, -60); ctx.fill();
            ctx.strokeStyle = '#7e22ce'; ctx.lineWidth = 2.5;
            ctx.strokeRect(-10, -61, 8, 8); ctx.strokeRect(2, -61, 8, 8);
            ctx.beginPath(); ctx.moveTo(-2, -57); ctx.lineTo(2, -57); ctx.stroke();
            ctx.fillStyle = '#b45309';
            ctx.fillRect(-8, -52, 2, 2); ctx.fillRect(-6, -50, 2, 2);
            ctx.fillRect(4, -52, 2, 2); ctx.fillRect(6, -50, 2, 2);
        }

        if (damageRatio > 0.8) {
            ctx.fillStyle = 'rgba(153, 27, 27, 0.9)';
            ctx.beginPath(); ctx.arc(0, -65, 8, 0, Math.PI*2); ctx.fill();
            ctx.fillRect(-3, -65, 6, 20); 
        }

        ctx.restore();
    }
}

class Projectile {
    constructor(x, y, vx, vy, typeName, pType) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.weaponData = WEAPONS[typeName];
        this.pType = pType;
        this.rotation = 0;
        this.active = true;
    }

    update() {
        if(!this.active) return;
        this.vy += GRAVITY;
        this.vx += wind * 0.005;
        this.x += this.vx;
        this.y += this.vy;
        this.rotation += this.vx * 0.04;
    }

    draw() {
        if(!this.active) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        let scale = this.weaponData.name === 'Gigante' ? 2.5 : 1;
        ctx.scale(scale, scale);

        if (this.pType === 'girl') { 
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(-8, -4, 16, 8);
            ctx.beginPath(); ctx.arc(8, 0, 4, 0, Math.PI*2); ctx.fill();
        } else { 
            ctx.fillStyle = '#71717a';
            ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#52525b';
            ctx.beginPath(); ctx.arc(-2, -2, 2.5, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    }
}

class Particle {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type;
        this.active = true;
        if (type === 'blood') {
            this.vx = (Math.random() - 0.5) * 12; 
            this.vy = (Math.random() - 1) * 12;
            this.life = 1.0;
            this.decay = 0.01 + Math.random() * 0.02; 
            this.size = Math.random() * 6 + 3; 
            this.color = '#7f1d1d';
        } else if (type === 'leaf') {
            this.x = camera.x + Math.random() * (canvas.width + 1000) - 500;
            this.y = Math.random() * WORLD_HEIGHT;
            this.vx = wind * (Math.random() * 0.6 + 0.4);
            this.vy = Math.random() * 1.5 + 0.5;
            this.size = Math.random() * 5 + 3;
            this.color = Math.random() > 0.5 ? '#166534' : '#14532d';
            this.wobble = Math.random() * Math.PI * 2;
        } else if (type === 'smoke') {
            this.vx = (Math.random() - 0.5) * 3;
            this.vy = (Math.random() - 0.5) * 3 - 1;
            this.life = 1.0;
            this.decay = 0.04;
            this.size = Math.random() * 12 + 6;
            this.color = 'rgba(120, 120, 120, 0.6)';
        }
    }
    update() {
        if (!this.active) return;
        
        if (this.type === 'blood') {
            this.vy += GRAVITY;
            this.x += this.vx; this.y += this.vy;
            this.life -= this.decay;
            let groundY = getTerrainHeightAt(this.x);
            if (this.y > groundY) { this.y = groundY; this.vy = 0; this.vx = 0; }
            if (this.life <= 0) this.active = false;
        } else if (this.type === 'leaf') {
            this.wobble += 0.03;
            this.x += this.vx + Math.sin(this.wobble) * 1.5;
            this.y += this.vy;
            if (this.y > WORLD_HEIGHT) this.y = -50;
            if (this.x > camera.x + canvas.width + 500) this.x = camera.x - 500;
            if (this.x < camera.x - 500) this.x = camera.x + canvas.width + 500;
            this.vx = wind * 1.5;
        } else if (this.type === 'smoke') {
            this.x += this.vx; this.y += this.vy;
            this.life -= this.decay;
            if (this.life <= 0) this.active = false;
        }
    }
    draw() {
        if (!this.active) return;
        if (this.type === 'smoke' || this.type === 'blood') {
            ctx.globalAlpha = this.life;
            ctx.fillStyle = this.color;
            if (this.type === 'smoke') {
                ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI*2); ctx.fill();
            } else {
                ctx.fillRect(this.x, this.y, this.size, this.size);
            }
            ctx.globalAlpha = 1.0;
        } else if (this.type === 'leaf') {
            ctx.fillStyle = this.color;
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.wobble);
            ctx.beginPath(); ctx.ellipse(0, 0, this.size, this.size/2, 0, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        }
    }
}

class Crate {
    constructor() {
        this.x = Math.random() * (WORLD_WIDTH - 400) + 200;
        this.y = -100;
        this.width = 48; 
        this.height = 48;
        this.active = true;
        this.vy = 2.5;
        
        const types = [
            { id: 'heal', color: '#10b981', label: 'HP+' },
            { id: 'giant', color: '#ef4444', label: 'BIG' },
            { id: 'triple', color: '#eab308', label: 'X3' }
        ];
        this.type = types[Math.floor(Math.random() * types.length)];
    }
    update() {
        if(!this.active) return;
        this.x += wind * 0.7;
        let groundY = getTerrainHeightAt(this.x);
        if (this.y < groundY - this.height) {
            this.y += this.vy;
        } else {
            this.y = groundY - this.height; 
        }
        
        if(this.x < 50) this.x = 50;
        if(this.x > WORLD_WIDTH - 50) this.x = WORLD_WIDTH - 50;
    }
    draw() {
        if(!this.active) return;
        ctx.fillStyle = '#78350f';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.strokeStyle = '#fef08a'; ctx.lineWidth = 3;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        
        ctx.fillStyle = this.type.color;
        ctx.font = "bold 18px Inter"; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(this.type.label, this.x + this.width/2, this.y + this.height/2);

        let groundY = getTerrainHeightAt(this.x);
        if (this.y < groundY - this.height) { 
            ctx.fillStyle = '#f8fafc';
            ctx.beginPath();
            ctx.arc(this.x + this.width/2, this.y - 20, 30, Math.PI, 0);
            ctx.fill();
            ctx.strokeStyle = '#94a3b8'; ctx.lineWidth=2;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + this.width/2 - 30, this.y - 20);
            ctx.moveTo(this.x + this.width, this.y); ctx.lineTo(this.x + this.width/2 + 30, this.y - 20);
            ctx.stroke();
        }
    }
}

function generateTerrain() {
    terrainPoints = [];
    const baseHeight = WORLD_HEIGHT * 0.75;
    
    for (let x = 0; x <= WORLD_WIDTH + TERRAIN_RESOLUTION; x += TERRAIN_RESOLUTION) {
        let y = baseHeight 
                + Math.sin(x / 300) * 120  
                + Math.sin(x / 100) * 30   
                + Math.sin(x / 25) * 5;    
        
        if (x < 400 || x > WORLD_WIDTH - 400) {
            y = baseHeight + Math.sin(x / 100) * 10;
        }

        terrainPoints.push({ x, y });
    }
}

function getTerrainHeightAt(x) {
    if (x < 0) return terrainPoints[0].y;
    if (x > WORLD_WIDTH) return terrainPoints[terrainPoints.length-1].y;
    
    let index = Math.floor(x / TERRAIN_RESOLUTION);
    if (index >= terrainPoints.length - 1) return terrainPoints[terrainPoints.length-1].y;
    
    let p1 = terrainPoints[index];
    let p2 = terrainPoints[index + 1];
    let t = (x - p1.x) / TERRAIN_RESOLUTION;
    return p1.y + (p2.y - p1.y) * t;
}

function drawTerrain() {
    ctx.fillStyle = '#064e3b'; 
    ctx.beginPath();
    ctx.moveTo(0, WORLD_HEIGHT);
    for (let p of terrainPoints) {
        ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(WORLD_WIDTH, WORLD_HEIGHT);
    ctx.fill();

    ctx.strokeStyle = '#15803d'; 
    ctx.lineWidth = 12;
    ctx.beginPath();
    for (let i = 0; i < terrainPoints.length; i++) {
        if (i===0) ctx.moveTo(terrainPoints[i].x, terrainPoints[i].y);
        else ctx.lineTo(terrainPoints[i].x, terrainPoints[i].y);
    }
    ctx.stroke();
}

function updateCamera() {
    if (actionState === 'SHOOTING' && projectiles.length > 0) {
        let p = projectiles.find(pr => pr.active) || projectiles[0];
        camera.targetX = p.x - canvas.width / 2;
        camera.targetY = p.y - canvas.height / 2;
        camera.lastImpactX = p.x;
        camera.lastImpactY = p.y;
    } else if (actionState === 'IMPACT_DELAY') {
        camera.targetX = camera.lastImpactX - canvas.width / 2;
        camera.targetY = camera.lastImpactY - canvas.height / 1.5; 
    } else {
        let p = players[currentPlayer - 1];
        camera.targetX = p.x - canvas.width / 2;
        camera.targetY = p.y - canvas.height / 1.5; 
    }

    camera.x += (camera.targetX - camera.x) * 0.1;
    camera.y += (camera.targetY - camera.y) * 0.1;

    if (camera.x < 0) camera.x = 0;
    if (camera.x > WORLD_WIDTH - canvas.width) camera.x = WORLD_WIDTH - canvas.width;
    if (camera.y < -500) camera.y = -500; 
    if (camera.y > WORLD_HEIGHT - canvas.height) camera.y = WORLD_HEIGHT - canvas.height;
}

function initLeaves() {
    leaves = [];
    for(let i=0; i<40; i++) {
        leaves.push(new Particle(0, 0, 'leaf'));
    }
}

function createBloodExplosion(x, y, amount) {
    for(let i=0; i<amount; i++) particles.push(new Particle(x, y, 'blood'));
}

function createExplosion(x, y, color) {
    for (let i = 0; i < 12; i++) {
        const particle = new Particle(x, y, 'smoke');
        particle.color = color;
        particles.push(particle);
    }
}

function showMessage(text, color = '#ef4444') {
    floatingMessage.innerText = text;
    floatingMessage.style.color = color;
    floatingMessage.classList.remove('opacity-0');
    setTimeout(() => floatingMessage.classList.add('opacity-0'), 2500);
}

function generateWind() {
    wind = (Math.random() * 20 - 10).toFixed(1);
    document.getElementById('windValue').innerText = Math.abs(wind);
    document.getElementById('windArrow').innerText = wind > 0 ? '➡️' : (wind < 0 ? '⬅️' : '⏺️');
    
    if (windGain) {
        windGain.gain.setTargetAtTime((Math.abs(wind) / 10) * 0.4, audioCtx.currentTime, 0.5);
    }
}

function nextTurn() {
    if (players[0].hp <= 0 || players[1].hp <= 0) { endGame(); return; }
    
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    actionState = 'IDLE';
    power = 0;
    projectiles = [];
    isPointerDown = false; 
    
    generateWind();
    
    if (Math.random() < 0.35 && crates.length < 3) crates.push(new Crate());

    updateHud();

    if (playMode === 'ai' && currentPlayer === 2) {
        setTimeout(aiTurn, 2000); 
    }
}

function updateHud() {
    document.getElementById('p1HealthUI').style.width = (players[0].hp / players[0].maxHp * 100) + '%';
    document.getElementById('p1HealthText').innerText = Math.floor(players[0].hp);
    document.getElementById('p1Weapon').innerText = WEAPONS[players[0].weapon].name;
    
    document.getElementById('p2HealthUI').style.width = (players[1].hp / players[1].maxHp * 100) + '%';
    document.getElementById('p2HealthText').innerText = Math.floor(players[1].hp);
    document.getElementById('p2Weapon').innerText = WEAPONS[players[1].weapon].name;

    const turnInd = document.getElementById('turnIndicator');
    if (currentPlayer === 1) {
        turnInd.innerText = "Turno: " + (players[0].type==='girl' ? "Menina" : "Garoto");
        turnInd.style.backgroundColor = 'rgba(219, 39, 119, 0.9)';
    } else {
        turnInd.innerText = "Turno: " + (players[1].type==='girl' ? "Menina" : "Garoto");
        turnInd.style.backgroundColor = 'rgba(22, 163, 74, 0.9)';
    }

    let currentP = players[currentPlayer - 1];
    let ghostBar = document.getElementById('powerBarGhost');
    if (currentP.lastShot.power !== null && !(playMode === 'ai' && currentPlayer === 2)) {
        ghostBar.style.display = 'block';
        ghostBar.style.left = (currentP.lastShot.power / maxPower * 100) + '%';
    } else {
        ghostBar.style.display = 'none';
    }
}

function fire(angle, pwr) {
    actionState = 'SHOOTING';
    let p = players[currentPlayer - 1];
    p.throwAnimTimer = 1.0; 
    playSwoosh(); 
    
    p.lastShot = { angle: angle, power: pwr };

    let weaponDef = WEAPONS[p.weapon];
    let speed = (pwr / maxPower) * 26; 
    
    let startX = p.x;
    let startY = p.y - 60; 

    let count = weaponDef.count || 1;
    
    for(let i=0; i<count; i++) {
        let spread = count > 1 ? (i - 1) * 0.08 : 0; 
        let finalAngle = angle + spread;
        let vx = Math.cos(finalAngle) * speed;
        let vy = Math.sin(finalAngle) * speed;
        projectiles.push(new Projectile(startX, startY, vx, vy, p.weapon, p.type));
    }
    
    p.weapon = 'normal'; 
    power = 0;
    powerBar.style.width = '0%';
    updateHud();

    if (playMode === 'multiplayer' && currentPlayer === myPlayerNum) {
        sendActionToFirebase(angle, pwr);
    }
}

function checkCollisions() {
    if (actionState !== 'SHOOTING' || projectiles.length === 0) return;

    for (let i = projectiles.length - 1; i >= 0; i--) {
        let proj = projectiles[i];
        if (!proj.active) continue;

        let groundY = getTerrainHeightAt(proj.x);

        if (proj.y + proj.weaponData.radius >= groundY) {
            proj.y = groundY - proj.weaponData.radius; 
            
            if (Math.abs(proj.vx) > Math.abs(proj.vy) * 0.8 && Math.abs(proj.vx) > 4) {
                proj.vy = -Math.abs(proj.vy) * 0.6 - 2; 
                proj.vx *= 0.7; 
                proj.weaponData.damageMult *= 0.5; 
                createExplosion(proj.x, groundY, '#8B4513'); 
                screenShake += 2;
            } else {
                createExplosion(proj.x, groundY, '#3f6212'); 
                proj.active = false;
                screenShake += 5; 
            }
            continue;
        }
        
        if (proj.x < -500 || proj.x > WORLD_WIDTH + 500) {
            proj.active = false;
            continue;
        }

        for (let j = crates.length - 1; j >= 0; j--) {
            let crate = crates[j];
            if (!crate.active) continue;
            if (proj.x > crate.x && proj.x < crate.x + crate.width &&
                proj.y > crate.y && proj.y < crate.y + crate.height) {
                applyCrateEffect(currentPlayer, crate.type.id);
                createExplosion(crate.x + crate.width/2, crate.y + crate.height/2, crate.type.color);
                crate.active = false;
                proj.active = false;
                break; 
            }
        }
        if (!proj.active) continue;

        let target = currentPlayer === 1 ? players[1] : players[0];
        let hitResult = checkHitbox(proj, target);
        
        if (hitResult) {
            applyDamage(target, hitResult, proj);
            proj.active = false;
        }
    }

    projectiles = projectiles.filter(p => p.active);
    crates = crates.filter(c => c.active);

    if (projectiles.length === 0 && actionState === 'SHOOTING') {
        actionState = 'IMPACT_DELAY'; 
        
        setTimeout(() => {
            if (gameState === 'PLAYING') {
                actionState = 'WAITING';
                nextTurn();
            }
        }, 4000); 
    }
}

function checkHitbox(proj, target) {
    const h = target.hitboxes;
    
    let hx = target.x; let hy = target.y + h.head.yOffset;
    if (Math.hypot(proj.x - hx, proj.y - hy) < h.head.radius + proj.weaponData.radius) 
        return { part: 'head', mult: h.head.mult };

    let bx = target.x - h.body.w/2; let by = target.y + h.body.yOffset;
    if (proj.x > bx && proj.x < bx + h.body.w && proj.y > by && proj.y < by + h.body.h) 
        return { part: 'body', mult: h.body.mult };

    let lx = target.x - h.legs.w/2; let ly = target.y + h.legs.yOffset;
    if (proj.x > lx && proj.x < lx + h.legs.w && proj.y > ly && proj.y < ly + h.legs.h) 
        return { part: 'legs', mult: h.legs.mult };

    return null;
}

function applyDamage(target, hitResult, proj) {
    let baseDamage = 25 * proj.weaponData.damageMult;
    let finalDamage = baseDamage * hitResult.mult;
    
    target.hp -= finalDamage;
    if (target.hp < 0) target.hp = 0;

    let isHead = hitResult.part === 'head';
    
    screenShake += isHead ? 25 : 15;
    createBloodExplosion(proj.x, proj.y, isHead ? 150 : 80);
    playHitSound(isHead);

    if (isHead) {
        showMessage("HEADSHOT! -" + Math.floor(finalDamage), "#ef4444");
    } else if (hitResult.part === 'legs') {
        showMessage("NA CANELA! -" + Math.floor(finalDamage), "#f59e0b");
    } else {
        showMessage("-" + Math.floor(finalDamage) + " HP", "#f87171");
    }

    updateHud();
}

function applyCrateEffect(playerIndex, effectId) {
    let p = players[playerIndex - 1];
    if (effectId === 'heal') {
        p.hp += 60;
        if(p.hp > p.maxHp) p.hp = p.maxHp;
        showMessage("CURA +60!", "#10b981");
    } else if (effectId === 'giant') {
        p.weapon = 'giant';
        showMessage("ARMA GIGANTE!", "#ef4444");
    } else if (effectId === 'triple') {
        p.weapon = 'triple';
        showMessage("TIRO TRIPLO!", "#eab308");
    }
    updateHud();
}

function aiTurn() {
    if (gameState !== 'PLAYING' || actionState !== 'IDLE') return;
    
    actionState = 'AIMING';
    let p1 = players[0]; 
    let p2 = players[1]; 
    
    let bestAngle = Math.PI; 
    let bestPower = 20;
    let minMiss = 99999;
    
    let targetY = p1.y - 35; 

    for(let a = Math.PI*0.7; a < Math.PI*1.4; a+=0.04) { 
        for(let pwr = 10; pwr <= maxPower; pwr+=1.5) {
            let speed = (pwr / maxPower) * 26;
            let vx = Math.cos(a) * speed;
            let vy = Math.sin(a) * speed;
            
            let simX = p2.x; let simY = p2.y - 60;
            let steps = 0;
            
            while(simY < WORLD_HEIGHT && steps < 200) {
                vy += GRAVITY;
                vx += wind * 0.005;
                simX += vx; simY += vy;
                steps++;
                let gY = getTerrainHeightAt(simX);
                if (simY >= gY) break; 
            }
            
            let missDistX = Math.abs(simX - p1.x);
            let missDistY = Math.abs(simY - targetY);
            let totalMiss = missDistX + (missDistY * 0.5); 
            
            if(totalMiss < minMiss) {
                minMiss = totalMiss;
                bestAngle = a;
                bestPower = pwr;
            }
        }
    }

    let errorSpread = 0;
    let powerSpread = 0;
    
    if (aiDifficulty === 'easy') {
        errorSpread = 0.15; 
        powerSpread = 6;
    } else if (aiDifficulty === 'medium') {
        errorSpread = 0.06;
        powerSpread = 3;
    } else if (aiDifficulty === 'hard') {
        errorSpread = 0.015; 
        powerSpread = 1;
    }

    bestAngle += (Math.random() - 0.5) * errorSpread;
    bestPower += (Math.random() - 0.5) * powerSpread;
    
    if(bestPower > maxPower) bestPower = maxPower;
    if(bestPower < 5) bestPower = 5;

    let chargeInterval = setInterval(() => {
        power += 0.2; 
        powerBar.style.width = (power / maxPower * 100) + '%';
        
        aimAngle = bestAngle; 

        if(power >= bestPower) {
            clearInterval(chargeInterval);
            fire(bestAngle, power);
        }
    }, 20);
}

function drawBackground() {
    ctx.fillStyle = '#0f172a'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-camera.x * 0.1, -camera.y * 0.1); 
    ctx.fillStyle = 'white';
    for(let i=0; i<50; i++){
        ctx.globalAlpha = Math.random() * 0.5 + 0.1;
        ctx.fillRect(Math.sin(i*99)*WORLD_WIDTH, Math.cos(i*77)*WORLD_HEIGHT/2, 2, 2);
    }
    ctx.globalAlpha = 1.0;
    ctx.restore();
}

function drawAimLine() {
    if (actionState !== 'IDLE' && actionState !== 'CHARGING' && actionState !== 'AIMING') return;
    if (playMode === 'multiplayer' && currentPlayer !== myPlayerNum) return; 

    let p = players[currentPlayer - 1];
    let startX = p.x;
    let startY = p.y - 60;

    let isHuman = !(playMode === 'ai' && currentPlayer === 2);

    if (isHuman) {
        let worldMouseX = mouseScreenX + camera.x;
        let worldMouseY = mouseScreenY + camera.y;
        aimAngle = Math.atan2(worldMouseY - startY, worldMouseX - startX);
    }

    ctx.save();

    if (p.lastShot.angle !== null && isHuman) {
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(startX, startY);
        let ghostLength = 120;
        let gEndX = startX + Math.cos(p.lastShot.angle) * ghostLength;
        let gEndY = startY + Math.sin(p.lastShot.angle) * ghostLength;
        ctx.lineTo(gEndX, gEndY);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.setLineDash([8, 8]);
    ctx.moveTo(startX, startY);
    
    let aimLength = 120; 
    let endX = startX + Math.cos(aimAngle) * aimLength;
    let endY = startY + Math.sin(aimAngle) * aimLength;
    
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = currentPlayer === 1 ? 'rgba(236, 72, 153, 0.6)' : 'rgba(34, 197, 94, 0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(endX, endY, 5, 0, Math.PI * 2);
    ctx.fillStyle = currentPlayer === 1 ? '#ec4899' : '#22c55e';
    ctx.fill();
    ctx.restore();
}

function togglePause() {
    if (gameState !== 'PLAYING') return;
    isPaused = !isPaused;
    const pm = document.getElementById('pauseMenu');
    if (isPaused) {
        pm.classList.remove('hidden');
    } else {
        pm.classList.add('hidden');
    }
}

function forceReturnToMenu() {
    isPaused = false;
    document.getElementById('pauseMenu').classList.add('hidden');
    returnToMenu();
}

function gameLoop() {
    if (gameState !== 'PLAYING' && gameState !== 'GAMEOVER') {
        requestAnimationFrame(gameLoop);
        return;
    }

    if (isPaused) {
        requestAnimationFrame(gameLoop);
        return;
    }

    updateCamera();
    drawBackground();

    ctx.save();
    let currentShakeX = 0;
    let currentShakeY = 0;
    if (screenShake > 0) {
        currentShakeX = (Math.random() - 0.5) * screenShake;
        currentShakeY = (Math.random() - 0.5) * screenShake;
        screenShake *= 0.9; 
        if (screenShake < 0.5) screenShake = 0;
    }
    
    ctx.translate(-camera.x + currentShakeX, -camera.y + currentShakeY);

    leaves.forEach(l => { l.update(); l.draw(); });

    drawTerrain();
    crates.forEach(c => { c.update(); c.draw(); });
    players.forEach(p => p.draw());
    
    drawAimLine();

    projectiles.forEach(p => { p.update(); p.draw(); });
    checkCollisions();

    particles.forEach(p => { p.update(); p.draw(); });
    particles = particles.filter(p => p.active); 

    ctx.restore(); 

    if (actionState === 'CHARGING') {
        power += 0.25; 
        if (power > maxPower) power = maxPower;
        powerBar.style.width = (power / maxPower * 100) + '%';
    }

    requestAnimationFrame(gameLoop);
}

function updateMousePos(e) {
    if (e.touches && e.touches.length > 0) {
        mouseScreenX = e.touches[0].clientX;
        mouseScreenY = e.touches[0].clientY;
    } else if (e.clientX !== undefined) {
        mouseScreenX = e.clientX;
        mouseScreenY = e.clientY;
    }
}

function handlePointerDown(e) {
    if (gameState !== 'PLAYING' || isPaused) return;
    if (actionState !== 'IDLE') return;
    if (playMode === 'ai' && currentPlayer === 2) return;
    if (playMode === 'multiplayer' && currentPlayer !== myPlayerNum) return;

    updateMousePos(e);
    isPointerDown = true;
    actionState = 'CHARGING';
}

function handlePointerMove(e) {
    updateMousePos(e);
}

function handlePointerUp(e) {
    if (isPointerDown && actionState === 'CHARGING') {
        isPointerDown = false;
        fire(aimAngle, power);
    }
}

canvas.addEventListener('mousedown', handlePointerDown);
canvas.addEventListener('mousemove', handlePointerMove);
window.addEventListener('mouseup', handlePointerUp); 

canvas.addEventListener('touchstart', (e) => { 
    e.preventDefault(); 
    handlePointerDown(e); 
}, {passive: false});

canvas.addEventListener('touchmove', (e) => { 
    e.preventDefault();
    handlePointerMove(e); 
}, {passive: false});

window.addEventListener('touchend', handlePointerUp);

window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') togglePause(); 
    
    if (gameState !== 'PLAYING' || actionState !== 'IDLE' || isPaused) return;
    if (playMode === 'ai' && currentPlayer === 2) return;
    if (playMode === 'multiplayer' && currentPlayer !== myPlayerNum) return;

    if (e.code === 'Space') {
        isPointerDown = true;
        actionState = 'CHARGING';
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && actionState === 'CHARGING') {
        isPointerDown = false;
        fire(aimAngle, power);
    }
});

function startGameMode(mode) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    initWindAudio();
    
    playMode = mode;
    mainMenu.classList.add('hidden');
    
    if (mode === 'ai') {
        let radios = document.getElementsByName('difficulty');
        for (let i = 0; i < radios.length; i++) {
            if (radios[i].checked) aiDifficulty = radios[i].value;
        }
    }

    if (mode === 'multiplayer') {
        if (!window.firebaseDb || !window.currentUser) {
            alert("Firebase não conectado. Verifique a configuração do Firebase em script.js.");
            mainMenu.classList.remove('hidden');
            return;
        }
        startMatchmaking();
    } else {
        charSelectMenu.classList.remove('hidden');
        isP1Selecting = true;
        charSelectTitle.innerText = "Jogador 1: Escolha seu lutador";
        charSelectTitle.className = "text-4xl font-black text-pink-400 drop-shadow-md";
    }
}

function selectCharacter(type) {
    if (playMode === 'multiplayer') {
        p1Selection = type;
        charSelectMenu.classList.add('hidden');
        initGame(); 
        return;
    }

    if (isP1Selecting) {
        p1Selection = type;
        isP1Selecting = false;
        if (playMode === 'ai') {
            p2Selection = type === 'girl' ? 'boy' : 'girl'; 
            charSelectMenu.classList.add('hidden');
            initGame();
        } else {
            charSelectTitle.innerText = "Jogador 2: Escolha seu lutador";
            charSelectTitle.className = "text-4xl font-black text-green-400 drop-shadow-md";
        }
    } else {
        p2Selection = type;
        charSelectMenu.classList.add('hidden');
        initGame();
    }
}

function initGame() {
    resize();
    generateTerrain();
    
    let p1X = 300;
    let p2X = WORLD_WIDTH - 300;

    players = [
        new Player(1, p1Selection, p1X),
        new Player(2, p2Selection || (p1Selection==='girl'?'boy':'girl'), p2X) 
    ];
    
    if (playMode === 'multiplayer') {
        document.getElementById('p1Name').innerText = "Você (" + (myPlayerNum===1 ? "P1" : "P2") + ")";
        document.getElementById('p2Name').innerText = "Oponente";
        if(myPlayerNum === 2) {
            players[0].type = p2Selection; 
            players[1].type = p1Selection;
        }
    } else {
        document.getElementById('p1Name').innerText = "Jogador 1";
        document.getElementById('p2Name').innerText = playMode === 'ai' ? "Máquina (" + aiDifficulty.toUpperCase() + ")" : "Jogador 2";
    }

    projectiles = [];
    particles = [];
    crates = [];
    currentPlayer = 1;
    gameState = 'PLAYING';
    actionState = 'IDLE';
    power = 0;
    
    camera.x = p1X - canvas.width/2;
    camera.y = players[0].y - canvas.height/1.5;
    
    initLeaves();
    generateWind();
    updateHud();
    
    gameHud.classList.remove('hidden');
    uiLayer.classList.remove('interactive');
}

function endGame() {
    gameState = 'GAMEOVER';
    let winner = players[0].hp > 0 ? "JOGADOR 1" : (playMode==='ai' ? "A MÁQUINA" : "JOGADOR 2");
    let color = players[0].hp > 0 ? "text-pink-500" : "text-green-500";
    
    if (playMode === 'multiplayer') {
        winner = players[myPlayerNum-1].hp > 0 ? "VOCÊ VENCEU!" : "VOCÊ FOI DESTRUÍDO!";
        color = players[myPlayerNum-1].hp > 0 ? "text-yellow-400" : "text-gray-500";
    }

    document.getElementById('winnerText').innerHTML = `<span class="${color} drop-shadow-lg">${winner}</span>`;
    gameOverScreen.classList.remove('hidden');
    uiLayer.classList.add('interactive');
    gameHud.classList.add('hidden');

    if (unsubMatch) unsubMatch();
}

function returnToMenu() {
    gameOverScreen.classList.add('hidden');
    gameHud.classList.add('hidden'); 
    uiLayer.classList.add('interactive'); 
    mainMenu.classList.remove('hidden');
    gameState = 'MENU';
    ctx.clearRect(0,0,canvas.width,canvas.height);
}

async function startMatchmaking() {
    const matchesRef = window.fb_collection(window.firebaseDb, `artifacts/${window.firebaseAppId}/public/data/matches`);
    document.getElementById('connectionStatus').innerText = "Procurando partida online...";
    
    try {
        const snapshot = await window.fb_getDocs(matchesRef);
        let foundMatch = false;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.status === 'waiting' && !foundMatch) {
                foundMatch = true;
                matchId = doc.id;
            }
        });

        if (foundMatch) {
            myPlayerNum = 2;
            await window.fb_updateDoc(window.fb_doc(window.firebaseDb, `artifacts/${window.firebaseAppId}/public/data/matches`, matchId), {
                status: 'playing',
                p2_id: window.currentUser.uid
            });
            document.getElementById('connectionStatus').innerText = "Partida Encontrada!";
            setupMatchListener();
        } else {
            myPlayerNum = 1;
            const newMatchRef = window.fb_doc(matchesRef); 
            matchId = newMatchRef.id;
            await window.fb_setDoc(newMatchRef, {
                status: 'waiting',
                p1_id: window.currentUser.uid,
                turn: 1,
                lastAction: null
            });
            document.getElementById('connectionStatus').innerText = "Aguardando oponente entrar...";
            setupMatchListener();
        }

        setTimeout(() => {
            charSelectTitle.innerText = "Escolha seu lutador";
            charSelectTitle.className = "text-4xl font-black text-yellow-400";
            charSelectMenu.classList.remove('hidden');
        }, 1000);

    } catch(e) {
        console.error("Matchmaking error", e);
        alert("Falha no servidor. Verifique conexão.");
        mainMenu.classList.remove('hidden');
    }
}

function setupMatchListener() {
    if(unsubMatch) unsubMatch();
    
    const matchDoc = window.fb_doc(window.firebaseDb, `artifacts/${window.firebaseAppId}/public/data/matches`, matchId);
    
    unsubMatch = window.fb_onSnapshot(matchDoc, (doc) => {
        if(!doc.exists()) return;
        const data = doc.data();
        
        if (data.lastAction && data.lastAction.player !== myPlayerNum && data.turn === myPlayerNum) {
            let a = data.lastAction.angle;
            let pwr = data.lastAction.power;
            
            currentPlayer = data.lastAction.player;
            fire(a, pwr);
        }
    }, (error) => console.error("Listen error", error));
}

async function sendActionToFirebase(angle, power) {
    if (!matchId || !window.firebaseDb) return;
    const matchDoc = window.fb_doc(window.firebaseDb, `artifacts/${window.firebaseAppId}/public/data/matches`, matchId);
    
    let nextP = currentPlayer === 1 ? 2 : 1;
    
    try {
        await window.fb_updateDoc(matchDoc, {
            turn: nextP,
            lastAction: { player: currentPlayer, angle: angle, power: power, timestamp: Date.now() }
        });
    } catch(e) { console.error("Sync error", e); }
}

requestAnimationFrame(gameLoop);