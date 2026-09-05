/**
 * ==========================================
 * QUANTUM REFLEX - WHITE LABEL CONFIGURATION
 * ==========================================
 * Modify these values to create custom reskins or adjust gameplay balance.
 */
const CONFIG = {
    colors: {
        primary: '#66fcf1',     // Standard targets & UI accents
        danger: '#ff0033',      // Collapse state & P2 network color
        anomaly: '#f2a900',     // High-risk anomaly targets
        grid: 'rgba(102, 252, 241, 0.04)' // Blueprint overlay
    },
    audio: {
        bpm: 140,               // Base heartbeat pace
        enableSynth: true       // Toggle Web Audio API
    },
    gameplay: {
        anomalyProbability: 0.04, // 4% chance per spawn
        comboTimeoutMs: 600,      // Max time between hits to keep combo
        difficultyScaling: 0.3    // Speed multiplier added every 15s
    },
    storageKey: 'qr_standalone_highScore_v1'
};

// CORE DOM VARIABLES
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mainMenu = document.getElementById('mainMenu');
const gameContainer = document.getElementById('gameContainer');
const hudTime = document.getElementById('hudTime');
const scoreP1El = document.getElementById('scoreP1');
const scoreP2El = document.getElementById('scoreP2');
const hudP2 = document.getElementById('hudP2');
const sysMsg = document.getElementById('sysMsg');
const hudCombo = document.getElementById('hudCombo');
const comboValEl = document.getElementById('comboVal');
const countdownDisplay = document.getElementById('countdownDisplay');
const endGameModal = document.getElementById('endGameModal');
const modalButtons = document.getElementById('modalButtons');

const highScoreHUDEl = document.getElementById('highScoreHUD');
const rankHUDEl = document.getElementById('rankHUD');
const modalTimeEl = document.getElementById('modalTime');
const modalScoreEl = document.getElementById('modalScore');
const modalHighScoreEl = document.getElementById('modalHighScore');
const modalRankEl = document.getElementById('modalRank');

let mode = 'solo', isPlaying = false, isCountingDown = false;
let gameLoop = null, opponentInterval = null, countdownInterval = null;
let scoreP1 = 0, scoreP2 = 0;

let storedHighScore = 0;
try { storedHighScore = parseInt(localStorage.getItem(CONFIG.storageKey)) || 0; } 
catch (e) { console.warn("Storage restricted."); }
highScoreHUDEl.innerText = storedHighScore;

let lastFrameTime = 0, accumulatorSeconds = 0;
let elapsedSeconds = 0, lastDifficultyBump = 0;
let baseSpeed = 1.0;
let shakeFrames = 0;
let timeFreeze = 0; 

let lastBeatTime = 0;
const baseBeatInterval = (60 / CONFIG.audio.bpm) * 1000; 
let currentRank = "ROOKIE";

let target = { x: 0, y: 0, radius: 0, maxRadius: 42, color: CONFIG.colors.primary, growthRate: 1.2, state: 'growing', type: 'normal' };
let particles = [];
let combo = 1; let lastHitTime = 0;

let audioCtx;
function initAudio() {
    if (!CONFIG.audio.enableSynth) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
}

function playSynth(freq, type, duration, vol) {
    if (!CONFIG.audio.enableSynth) return;
    try {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gainNode); gainNode.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.size = Math.random() * 3 + 1;
        this.speedX = (Math.random() - 0.5) * 12; this.speedY = (Math.random() - 0.5) * 12;
        this.life = 1.0;
    }
    update(dt) { this.x += this.speedX * (dt/(1000/60)); this.y += this.speedY * (dt/(1000/60)); this.life -= 0.05 * (dt/(1000/60)); }
    draw() {
        ctx.globalAlpha = Math.max(this.life, 0); ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}
function spawnParticles(x, y, color) { for (let i = 0; i < 20; i++) particles.push(new Particle(x, y, color)); }

function evaluateRank() {
    let newRank = "ROOKIE";
    if (scoreP1 >= 250) newRank = "QUANTUM MASTER";
    else if (scoreP1 >= 150) newRank = "ELITE OPERATIVE";
    else if (scoreP1 >= 75) newRank = "VECTOR TECH";
    else if (scoreP1 >= 30) newRank = "APPRENTICE";
    
    if (newRank !== currentRank) {
        currentRank = newRank; rankHUDEl.innerText = currentRank;
        flashSystemMessage(`RANK PROMOTED: ${currentRank}`, CONFIG.colors.anomaly);
    }
}

function clearAllProcesses() {
    cancelAnimationFrame(gameLoop);
    clearInterval(opponentInterval);
    clearInterval(countdownInterval);
}

function prepareMatch(selectedMode) {
    initAudio(); mode = selectedMode; clearAllProcesses();
    mainMenu.style.display = 'none'; gameContainer.style.display = 'flex'; endGameModal.style.display = 'none';
    
    if (mode === 'vs') { hudP2.style.display = 'block'; canvas.style.borderColor = CONFIG.colors.danger; } 
    else { hudP2.style.display = 'none'; canvas.style.borderColor = '#45a29e'; }
    
    startCountdown();
}

function returnToMenu() {
    isPlaying = false; isCountingDown = false; clearAllProcesses();
    gameContainer.style.display = 'none'; endGameModal.style.display = 'none'; mainMenu.style.display = 'flex';
}

function startCountdown() {
    clearAllProcesses(); endGameModal.style.display = 'none'; isCountingDown = true;
    scoreP1 = 0; scoreP2 = 0; currentRank = "ROOKIE"; rankHUDEl.innerText = currentRank;
    scoreP1El.innerText = '0'; scoreP2El.innerText = '0'; hudTime.innerText = '00:00';
    
    ctx.fillStyle = '#12141a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let count = 5; countdownDisplay.innerText = count; countdownDisplay.style.display = 'block';
    playSynth(300, 'square', 0.1, 0.1);

    countdownInterval = setInterval(() => {
        try {
            count--;
            if (count > 0) { countdownDisplay.innerText = count; playSynth(300 + ((5-count) * 100), 'square', 0.1, 0.1); } 
            else { clearInterval(countdownInterval); countdownDisplay.style.display = 'none'; isCountingDown = false; playSynth(1000, 'square', 0.4, 0.2); resetMatch(); }
        } catch (e) { clearInterval(countdownInterval); countdownDisplay.style.display = 'none'; isCountingDown = false; resetMatch(); }
    }, 1000);
}

function searchNewMatch() {
    endGameModal.style.display = 'none';
    flashSystemMessage("SEARCHING NETWORK...", CONFIG.colors.primary);
    setTimeout(() => { prepareMatch('vs'); }, 1500);
}

function resetMatch() {
    clearAllProcesses(); combo = 1; particles = []; hudCombo.style.opacity = 0;
    baseSpeed = 1.0; elapsedSeconds = 0; accumulatorSeconds = 0; lastDifficultyBump = 0; 
    shakeFrames = 0; timeFreeze = 0; lastBeatTime = performance.now();
    
    if(mode === 'vs') startOpponentMock();
    
    isPlaying = true; spawnTarget(); lastFrameTime = performance.now();
    gameLoop = requestAnimationFrame(updateCanvas);
}

function flashSystemMessage(msg, color = '#c5c6c7') {
    sysMsg.innerText = msg; sysMsg.style.color = color; sysMsg.style.textShadow = `0 0 10px ${color}`;
    sysMsg.style.opacity = 1; setTimeout(() => { sysMsg.style.opacity = 0; }, 1200);
}

function spawnTarget() {
    const isAnomaly = Math.random() < CONFIG.gameplay.anomalyProbability;
    target.type = isAnomaly ? 'anomaly' : 'normal';
    target.maxRadius = isAnomaly ? 33 : 42; 
    target.color = isAnomaly ? CONFIG.colors.anomaly : CONFIG.colors.primary; 
    target.growthRate = isAnomaly ? 1.5 : 1.2;

    const margin = target.maxRadius;
    target.x = Math.random() * (canvas.width - margin * 2) + margin;
    target.y = Math.random() * (canvas.height - margin * 2) + margin;
    target.radius = 0; target.state = 'growing';
}

function drawBlueprintGrid() {
    ctx.strokeStyle = CONFIG.colors.grid;
    ctx.lineWidth = 1;
    const gridSize = 40;
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
    for (let y = 0; y <= canvas.height; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
    ctx.stroke();
}

function applyShake() {
    if (shakeFrames > 0) {
        const dx = (Math.random() - 0.5) * 12; const dy = (Math.random() - 0.5) * 12;
        ctx.translate(dx, dy); shakeFrames--; return {dx, dy};
    }
    return {dx: 0, dy: 0};
}

function updateCanvas(timestamp) {
    if (!isPlaying) return;
    let dt = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    if (dt < 0) dt = 0; if (dt > 32) dt = 32;

    const currentBeatInterval = baseBeatInterval / (baseSpeed * 0.8);
    if (timestamp - lastBeatTime >= currentBeatInterval) {
        playSynth(45, 'sine', 0.15, 0.4); lastBeatTime = timestamp;
    }

    if (timeFreeze > 0) {
        timeFreeze -= dt;
    } else {
        accumulatorSeconds += dt;
        if (accumulatorSeconds >= 1000) {
            accumulatorSeconds -= 1000; elapsedSeconds++;
            let m = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
            let s = String(elapsedSeconds % 60).padStart(2, '0');
            hudTime.innerText = `${m}:${s}`;

            if (elapsedSeconds > 0 && elapsedSeconds % 15 === 0 && elapsedSeconds !== lastDifficultyBump) {
                baseSpeed += CONFIG.gameplay.difficultyScaling; lastDifficultyBump = elapsedSeconds;
                playSynth(600, 'square', 0.5, 0.2); flashSystemMessage("SPEED UP X" + baseSpeed.toFixed(1), CONFIG.colors.danger);
            }
        }
    }

    ctx.fillStyle = 'rgba(18, 20, 26, 0.6)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawBlueprintGrid();

    const offset = applyShake();
    const timeScale = dt / (1000/60); 
    const activeSpeed = timeFreeze > 0 ? (baseSpeed * 0.2) : baseSpeed;

    if (target.state === 'growing') {
        target.radius += target.growthRate * activeSpeed * timeScale;
        if (target.radius >= target.maxRadius) { target.state = 'shrinking'; target.color = CONFIG.colors.danger; }
    } else if (target.state === 'shrinking') {
        target.radius -= target.growthRate * activeSpeed * 1.8 * timeScale;
        if (target.radius <= 0) { ctx.translate(-offset.dx, -offset.dy); handleFailure(); return; }
    }

    if (target.state === 'growing' && target.radius > target.maxRadius * 0.85) {
        ctx.beginPath(); ctx.arc(target.x, target.y, target.maxRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = target.type === 'anomaly' ? 4 : 2; 
        if(target.type === 'anomaly') ctx.setLineDash([5, 5]);
        ctx.stroke(); ctx.setLineDash([]);
    }

    ctx.beginPath(); ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
    ctx.fillStyle = target.color; ctx.shadowBlur = 15; ctx.shadowColor = target.color;
    ctx.fill(); ctx.shadowBlur = 0;

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(dt); particles[i].draw();
        if (particles[i].life <= 0) particles.splice(i, 1);
    }

    if (timeFreeze > 0) { ctx.fillStyle = 'rgba(102, 252, 241, 0.1)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.translate(-offset.dx, -offset.dy); gameLoop = requestAnimationFrame(updateCanvas);
}

function handleFailure() {
    if (!isPlaying) return; isPlaying = false; shakeFrames = 10; clearAllProcesses(); 
    
    try {
        if (scoreP1 > storedHighScore) {
            storedHighScore = scoreP1; localStorage.setItem(CONFIG.storageKey, storedHighScore); highScoreHUDEl.innerText = storedHighScore;
        }
    } catch (e) {}
    
    playSynth(100, 'sawtooth', 0.5, 0.3); spawnParticles(target.x, target.y, CONFIG.colors.danger); 
    
    const offset = applyShake();
    ctx.fillStyle = 'rgba(255, 0, 51, 0.8)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for(let p of particles) p.draw();
    ctx.translate(-offset.dx, -offset.dy);
    
    hudCombo.style.opacity = 0; setTimeout(renderGameOverUI, 600); 
}

function renderGameOverUI() {
    modalTimeEl.innerText = hudTime.innerText; modalScoreEl.innerText = scoreP1;
    modalHighScoreEl.innerText = storedHighScore; modalRankEl.innerText = currentRank;

    modalButtons.innerHTML = mode === 'solo' 
        ? `<button class="modal-btn btn-action" onclick="prepareMatch('solo')">Play Again</button>
           <button class="modal-btn btn-exit" onclick="returnToMenu()">Main Menu</button>`
        : `<button class="modal-btn btn-action" onclick="searchNewMatch()">Find Match</button>
           <button class="modal-btn btn-exit" onclick="returnToMenu()">Main Menu</button>`;
    endGameModal.style.display = 'flex';
}

function handleClick(e) {
    if (!isPlaying || isCountingDown) return;
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const clickX = (clientX - rect.left) * (canvas.width / rect.width);
    const clickY = (clientY - rect.top) * (canvas.height / rect.height);
    
    const dist = Math.hypot(clickX - target.x, clickY - target.y);
    const tolerance = target.type === 'anomaly' ? 5 : 15;

    if (dist <= Math.max(target.radius, tolerance)) {
        let now = performance.now();
        let isCritical = (target.radius >= target.maxRadius * 0.85 && target.state === 'growing');

        if (now - lastHitTime < CONFIG.gameplay.comboTimeoutMs) { combo++; hudCombo.style.opacity = 1; comboValEl.innerText = combo; } 
        else { combo = 1; hudCombo.style.opacity = 0; }
        lastHitTime = now;

        if (target.type === 'anomaly') {
            timeFreeze = 3000; flashSystemMessage("TIME BREACHED", CONFIG.colors.anomaly);
            playSynth(1500, 'sine', 0.2, 0.2); shakeFrames = 6;
            spawnParticles(target.x, target.y, CONFIG.colors.anomaly); scoreP1 += (combo * 5); 
        } else if (isCritical) {
            scoreP1 += (combo * 3); flashSystemMessage("CRITICAL", '#fff');
            playSynth(1200, 'sine', 0.1, 0.2); shakeFrames = 4;
            spawnParticles(target.x, target.y, '#fff');
        } else {
            scoreP1 += combo; playSynth(800 + (combo * 100), 'sine', 0.1, 0.1); 
            spawnParticles(target.x, target.y, CONFIG.colors.primary);
        }
        
        scoreP1El.innerText = scoreP1; evaluateRank(); spawnTarget();
    } else { handleFailure(); }
}

function startOpponentMock() {
    clearInterval(opponentInterval);
    opponentInterval = setInterval(() => {
        if(isPlaying && Math.random() > 0.6) {
            if(Math.random() > 0.90) {
                scoreP2 += Math.floor(Math.random() * 3) + 1; scoreP2El.innerText = scoreP2; 
                flashSystemMessage("NETWORK SCORED", CONFIG.colors.danger);
            }
        }
    }, 1500);
}

canvas.addEventListener('mousedown', handleClick);
canvas.addEventListener('touchstart', handleClick, {passive: false});
document.body.addEventListener('touchstart', e => { if (e.target === canvas) e.preventDefault(); }, { passive: false });
