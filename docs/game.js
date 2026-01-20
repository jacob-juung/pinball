/**
 * Neon Cyberpunk Pinball - JavaScript/Matter.js Version
 */

const { Engine, Bodies, Body, Composite, Events, Vector } = Matter;

const SCREEN_WIDTH = 600;
const SCREEN_HEIGHT = 800;
const BALL_RADIUS = 12;
const BUMPER_RADIUS = 25;

const COLORS = {
    bg: '#0a0a14',
    ball: '#ff3296',
    flipper: '#00ffff',
    wall: '#646496',
    bumper: '#ff0064',
    bumperGlow: '#00ff64',
    target: '#00ff64',
    plunger: '#ffc800',
    neonPink: '#ff3296',
    neonCyan: '#00ffff',
    neonGreen: '#00ff64',
    neonPurple: '#a855f7',
    neonBlue: '#3b82f6',
    spinner: '#ff6432'
};

const DIFFICULTY_PRESETS = {
    EASY: {
        name: 'EASY',
        gravity: 0.4,
        ballRestitution: 0.8,
        flipperPower: 18,
        bumperRestitution: 1.8,
        bumperForce: 0.025,
        plungerMaxPower: 35,
        startingBalls: 5,
        ballSaverDuration: 8000,
        scoreMultiplier: 0.8
    },
    NORMAL: {
        name: 'NORMAL',
        gravity: 0.5,
        ballRestitution: 0.7,
        flipperPower: 16,
        bumperRestitution: 1.5,
        bumperForce: 0.02,
        plungerMaxPower: 30,
        startingBalls: 3,
        ballSaverDuration: 5000,
        scoreMultiplier: 1.0
    },
    HARD: {
        name: 'HARD',
        gravity: 0.7,
        ballRestitution: 0.6,
        flipperPower: 14,
        bumperRestitution: 1.3,
        bumperForce: 0.015,
        plungerMaxPower: 25,
        startingBalls: 3,
        ballSaverDuration: 3000,
        scoreMultiplier: 1.5
    }
};

const FLIPPER_CONFIG = {
    left: {
        pivot: { x: 150, y: 700 },
        length: 85,
        width: 14,
        restAngle: 0.5,
        activeAngle: -0.5
    },
    right: {
        pivot: { x: 350, y: 700 },
        length: 85,
        width: 14,
        restAngle: Math.PI - 0.5,
        activeAngle: Math.PI + 0.5
    },
    mini: {
        pivot: { x: 510, y: 650 },
        length: 50,
        width: 10,
        restAngle: Math.PI - 0.5,
        activeAngle: Math.PI + 0.5
    }
};

class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = false;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.enabled = true;
        } catch (e) {}
    }

    play(type) {
        if (!this.enabled || !this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        const now = this.ctx.currentTime;
        
        const sounds = {
            bumper: [880, 'square', 0.2, 0.08],
            flipper: [220, 'sawtooth', 0.25, 0.1],
            wall: [440, 'sine', 0.15, 0.05],
            target: [1200, 'sine', 0.2, 0.15],
            spinner: [330, 'triangle', 0.15, 0.06],
            launch: [150, 'sawtooth', 0.3, 0.2]
        };
        
        const [freq, wave, vol, dur] = sounds[type] || [440, 'sine', 0.1, 0.1];
        osc.frequency.value = freq;
        osc.type = wave;
        gain.gain.setValueAtTime(vol, now);
        gain.gain.linearRampToValueAtTime(0.01, now + dur);
        osc.start(now);
        osc.stop(now + dur);
    }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    spawn(x, y, color, count = 10) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 2;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: Math.random() * 20 + 20,
                maxLife: 40,
                size: Math.random() * 3 + 2,
                color
            });
        }
    }

    update() {
        this.particles = this.particles.filter(p => p.life > 0);
        for (const p of this.particles) {
            p.life--;
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1;
        }
    }

    draw(ctx) {
        for (const p of this.particles) {
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}

class Flipper {
    constructor(config, world) {
        this.config = config;
        this.world = world;
        this.angle = config.restAngle;
        this.targetAngle = config.restAngle;
        this.angularVelocity = 0;
        this.isActive = false;
        this.hitTime = 0;
        
        this.body = Bodies.rectangle(
            config.pivot.x + Math.cos(config.restAngle) * config.length / 2,
            config.pivot.y + Math.sin(config.restAngle) * config.length / 2,
            config.length,
            config.width,
            {
                label: 'flipper',
                restitution: 0.9,
                friction: 0.5,
                isStatic: true
            }
        );
        Body.setAngle(this.body, config.restAngle);
        Composite.add(world, this.body);
    }

    activate() {
        if (!this.isActive) {
            this.isActive = true;
            this.targetAngle = this.config.activeAngle;
        }
    }

    deactivate() {
        this.isActive = false;
        this.targetAngle = this.config.restAngle;
    }

    update(dt) {
        const speed = 0.35;
        const diff = this.targetAngle - this.angle;
        
        if (Math.abs(diff) > 0.01) {
            const prevAngle = this.angle;
            this.angle += diff * speed;
            this.angularVelocity = (this.angle - prevAngle) / (dt / 1000);
        } else {
            this.angle = this.targetAngle;
            this.angularVelocity = 0;
        }

        const cx = this.config.pivot.x + Math.cos(this.angle) * this.config.length / 2;
        const cy = this.config.pivot.y + Math.sin(this.angle) * this.config.length / 2;
        Body.setPosition(this.body, { x: cx, y: cy });
        Body.setAngle(this.body, this.angle);
    }

    getEndPoint() {
        return {
            x: this.config.pivot.x + Math.cos(this.angle) * this.config.length,
            y: this.config.pivot.y + Math.sin(this.angle) * this.config.length
        };
    }

    checkBallCollision(ball, difficulty) {
        if (!ball) return;
        
        const ballPos = ball.position;
        const pivot = this.config.pivot;
        const end = this.getEndPoint();
        
        const dx = end.x - pivot.x;
        const dy = end.y - pivot.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = dx / len;
        const ny = dy / len;
        
        const px = ballPos.x - pivot.x;
        const py = ballPos.y - pivot.y;
        const proj = px * nx + py * ny;
        
        if (proj < 0 || proj > len) return;
        
        const closestX = pivot.x + nx * proj;
        const closestY = pivot.y + ny * proj;
        const distX = ballPos.x - closestX;
        const distY = ballPos.y - closestY;
        const dist = Math.sqrt(distX * distX + distY * distY);
        
        const hitRadius = BALL_RADIUS + this.config.width / 2;
        
        if (dist < hitRadius && this.isActive && Math.abs(this.angularVelocity) > 1) {
            const normalX = distX / dist;
            const normalY = distY / dist;
            
            const power = difficulty.flipperPower;
            const armRatio = proj / len;
            const force = power * (0.5 + armRatio * 0.5);
            
            const upwardBias = -0.7;
            const vx = normalX * force * 0.5;
            const vy = (normalY + upwardBias) * force;
            
            Body.setVelocity(ball, { x: vx, y: vy });
            this.hitTime = performance.now();
            return true;
        }
        return false;
    }

    draw(ctx) {
        const pivot = this.config.pivot;
        const end = this.getEndPoint();
        const w = this.config.width;
        
        const dx = end.x - pivot.x;
        const dy = end.y - pivot.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const perpX = -dy / len * w / 2;
        const perpY = dx / len * w / 2;

        const isHit = (performance.now() - this.hitTime) < 150;
        
        ctx.fillStyle = isHit ? '#ffffff' : COLORS.flipper;
        ctx.shadowColor = isHit ? '#ffffff' : COLORS.flipper;
        ctx.shadowBlur = isHit ? 25 : 15;
        
        ctx.beginPath();
        ctx.moveTo(pivot.x + perpX, pivot.y + perpY);
        ctx.lineTo(end.x + perpX * 0.5, end.y + perpY * 0.5);
        ctx.lineTo(end.x - perpX * 0.5, end.y - perpY * 0.5);
        ctx.lineTo(pivot.x - perpX, pivot.y - perpY);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(pivot.x, pivot.y, 6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
    }
}

class PinballGame {
    constructor() {
        this.canvas = document.getElementById('game');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = SCREEN_WIDTH;
        this.canvas.height = SCREEN_HEIGHT;

        this.sound = new SoundManager();
        this.particles = new ParticleSystem();
        
        this.difficultyIndex = 1;
        this.difficulty = DIFFICULTY_PRESETS.NORMAL;

        this.score = 0;
        this.ballsRemaining = this.difficulty.startingBalls;
        this.ballInPlay = false;
        this.gameOver = false;
        this.ballSaverActive = false;
        this.ballSaverEndTime = 0;
        this.comboMultiplier = 1;
        this.lastHitTime = 0;

        this.plungerPower = 0;
        this.plungerCharging = false;
        this.plungerDragStartY = 0;
        this.plungerTouchId = null;

        this.keys = {};
        this.touchLeft = false;
        this.touchRight = false;

        this.ballTrail = [];
        this.bumperHits = {};
        this.targetHits = {};

        this.scale = 1;
        this.bestScore = parseInt(localStorage.getItem('pinballBestScore') || '0');

        this.initPhysics();
        this.createTable();
        this.setupInput();
        this.setupTouchControls();
        this.setupCollisions();
        this.setupLeaderboardUI();
        this.handleResize();
        window.addEventListener('resize', () => this.handleResize());

        this.lastTime = performance.now();
        this.gameLoop();
    }

    handleResize() {
        const container = document.getElementById('game-container');
        const wrapper = document.getElementById('game-wrapper');
        
        const availableWidth = window.innerWidth - 20;
        const availableHeight = window.innerHeight - 110;
        
        const scaleX = availableWidth / SCREEN_WIDTH;
        const scaleY = availableHeight / SCREEN_HEIGHT;
        this.scale = Math.min(scaleX, scaleY, 1);
        
        container.style.transform = `scale(${this.scale})`;
        container.style.width = `${SCREEN_WIDTH}px`;
        container.style.height = `${SCREEN_HEIGHT}px`;
        
        wrapper.style.width = `${SCREEN_WIDTH * this.scale}px`;
        container.style.marginBottom = `${(SCREEN_HEIGHT - SCREEN_HEIGHT * this.scale) * -1}px`;
    }

    initPhysics() {
        this.engine = Engine.create();
        this.engine.gravity.y = this.difficulty.gravity;
        this.world = this.engine.world;
    }

    createTable() {
        Composite.clear(this.world);
        
        this.ball = null;
        this.bumpers = [];
        this.targets = [];
        this.spinners = [];

        this.createWalls();
        this.createFlippers();
        this.createPlunger();
        this.createBumpers();
        this.createSpinners();
        this.createTargets();
        this.createDrain();
    }

    createWalls() {
        const wallOptions = {
            isStatic: true,
            restitution: 0.6,
            friction: 0.5,
            label: 'wall'
        };

        const boundaryOptions = {
            isStatic: true,
            restitution: 0.5,
            friction: 0.3,
            label: 'boundary'
        };

        const walls = [];

        walls.push(Bodies.rectangle(-15, 400, 30, 800, boundaryOptions));
        walls.push(Bodies.rectangle(300, -15, 600, 30, boundaryOptions));
        walls.push(Bodies.rectangle(507, 350, 10, 700, boundaryOptions));

        walls.push(Bodies.fromVertices(40, 475, [[
            { x: 50, y: 750 }, { x: 30, y: 200 }, { x: 35, y: 200 }, { x: 55, y: 750 }
        ]], wallOptions));
        walls.push(Bodies.fromVertices(55, 125, [[
            { x: 30, y: 200 }, { x: 80, y: 50 }, { x: 85, y: 55 }, { x: 35, y: 200 }
        ]], wallOptions));

        walls.push(Bodies.rectangle(300, 47, 440, 6, { ...wallOptions, angle: 0.05 }));

        walls.push(Bodies.rectangle(510, 425, 6, 650, wallOptions));
        walls.push(Bodies.rectangle(560, 425, 6, 650, wallOptions));

        walls.push(Bodies.fromVertices(540, 70, [[
            { x: 520, y: 50 }, { x: 545, y: 60 }, { x: 555, y: 80 }, { x: 560, y: 100 },
            { x: 555, y: 100 }, { x: 550, y: 80 }, { x: 540, y: 65 }, { x: 520, y: 55 }
        ]], wallOptions));

        walls.push(Bodies.fromVertices(75, 700, [[
            { x: 50, y: 750 }, { x: 100, y: 650 }, { x: 105, y: 655 }, { x: 55, y: 750 }
        ]], wallOptions));
        walls.push(Bodies.fromVertices(125, 635, [[
            { x: 100, y: 650 }, { x: 150, y: 620 }, { x: 155, y: 625 }, { x: 105, y: 655 }
        ]], wallOptions));

        walls.push(Bodies.fromVertices(425, 700, [[
            { x: 450, y: 750 }, { x: 400, y: 650 }, { x: 395, y: 655 }, { x: 445, y: 750 }
        ]], wallOptions));
        walls.push(Bodies.fromVertices(375, 635, [[
            { x: 400, y: 650 }, { x: 350, y: 620 }, { x: 345, y: 625 }, { x: 395, y: 655 }
        ]], wallOptions));

        walls.push(Bodies.fromVertices(90, 575, [[
            { x: 40, y: 540 }, { x: 140, y: 610 }, { x: 135, y: 618 }, { x: 35, y: 548 }
        ]], wallOptions));

        walls.push(Bodies.rectangle(150, 200, 4, 100, wallOptions));
        walls.push(Bodies.rectangle(350, 200, 4, 100, wallOptions));

        walls.push(Bodies.fromVertices(190, 350, [[
            { x: 200, y: 300 }, { x: 180, y: 400 }, { x: 175, y: 398 }, { x: 195, y: 300 }
        ]], wallOptions));
        walls.push(Bodies.fromVertices(310, 350, [[
            { x: 300, y: 300 }, { x: 320, y: 400 }, { x: 325, y: 398 }, { x: 305, y: 300 }
        ]], wallOptions));

        this.walls = walls;
        Composite.add(this.world, walls);
    }

    createFlippers() {
        this.leftFlipper = new Flipper(FLIPPER_CONFIG.left, this.world);
        this.rightFlipper = new Flipper(FLIPPER_CONFIG.right, this.world);
        this.miniFlipper = new Flipper(FLIPPER_CONFIG.mini, this.world);
    }

    createPlunger() {
        this.plunger = Bodies.rectangle(535, 730, 40, 10, {
            isStatic: true,
            label: 'plunger',
            restitution: 0.95
        });
        this.plungerRestY = 730;
        Composite.add(this.world, this.plunger);
    }

    createBumpers() {
        const bumperPositions = [
            { x: 120, y: 140 }, { x: 300, y: 120 }, { x: 480, y: 140 },
            { x: 180, y: 300 }, { x: 420, y: 300 },
            { x: 300, y: 420 },
            { x: 150, y: 520 }, { x: 380, y: 540 }
        ];

        for (const pos of bumperPositions) {
            const bumper = Bodies.circle(pos.x, pos.y, BUMPER_RADIUS, {
                isStatic: true,
                label: 'bumper',
                restitution: this.difficulty.bumperRestitution
            });
            this.bumpers.push(bumper);
            this.bumperHits[bumper.id] = 0;
        }

        Composite.add(this.world, this.bumpers);
    }

    createSpinners() {
        const spinnerSpecs = [
            { x: 240, y: 220, length: 80, angle: 0, speed: 2.6 },
            { x: 400, y: 220, length: 80, angle: Math.PI / 2, speed: -3.2 },
            { x: 300, y: 320, length: 90, angle: 0, speed: 2.0 }
        ];

        for (const spec of spinnerSpecs) {
            const spinner = Bodies.rectangle(spec.x, spec.y, spec.length, 12, {
                isStatic: true,
                label: 'spinner',
                restitution: 0.9,
                friction: 0.6
            });
            Body.setAngle(spinner, spec.angle);
            spinner.spinnerSpeed = spec.speed;
            spinner.spinnerAngle = spec.angle;
            this.spinners.push(spinner);
        }

        Composite.add(this.world, this.spinners);
    }

    createTargets() {
        const targetSpecs = [
            { x1: 120, y1: 350, x2: 120, y2: 400 },
            { x1: 380, y1: 350, x2: 380, y2: 400 },
            { x1: 250, y1: 120, x2: 350, y2: 120 }
        ];

        for (const spec of targetSpecs) {
            const dx = spec.x2 - spec.x1;
            const dy = spec.y2 - spec.y1;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            const cx = (spec.x1 + spec.x2) / 2;
            const cy = (spec.y1 + spec.y2) / 2;

            const target = Bodies.rectangle(cx, cy, length, 10, {
                isStatic: true,
                label: 'target',
                restitution: 0.8
            });
            Body.setAngle(target, angle);
            this.targets.push(target);
            this.targetHits[target.id] = 0;
        }

        Composite.add(this.world, this.targets);
    }

    createDrain() {
        this.drain = Bodies.rectangle(275, 785, 450, 10, {
            isStatic: true,
            isSensor: true,
            label: 'drain'
        });
        Composite.add(this.world, this.drain);
    }

    createBall(x = 535, y = 710) {
        this.ball = Bodies.circle(x, y, BALL_RADIUS, {
            label: 'ball',
            restitution: this.difficulty.ballRestitution,
            friction: 0.3,
            frictionAir: 0.001
        });
        Composite.add(this.world, this.ball);
        
        this.ballInPlay = true;
        this.ballSaverActive = true;
        this.ballSaverEndTime = performance.now() + this.difficulty.ballSaverDuration;
        this.ballTrail = [];
    }

    setupInput() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;

            if (e.code === 'Space' && !this.plungerCharging && this.ballInPlay && this.isBallInPlungerLane()) {
                this.plungerCharging = true;
                this.plungerPower = 0;
            }

            if (e.code === 'KeyD' && !this.ballInPlay && !this.gameOver) {
                this.cycleDifficulty();
            }

            if (e.code === 'KeyR') {
                this.reset();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;

            if (e.code === 'Space' && this.plungerCharging) {
                this.launchBall();
                this.plungerCharging = false;
            }
        });
    }

    setupTouchControls() {
        const btnLeft = document.getElementById('btn-left');
        const btnRight = document.getElementById('btn-right');
        const btnMenu = document.getElementById('btn-menu');
        const btnRestart = document.getElementById('btn-restart');
        const canvas = this.canvas;

        const addTouchHandlers = (el, onStart, onEnd) => {
            el.addEventListener('touchstart', (e) => { e.preventDefault(); onStart(); }, { passive: false });
            el.addEventListener('touchend', (e) => { e.preventDefault(); onEnd(); }, { passive: false });
            el.addEventListener('touchcancel', (e) => { e.preventDefault(); onEnd(); }, { passive: false });
            el.addEventListener('mousedown', (e) => { e.preventDefault(); onStart(); });
            el.addEventListener('mouseup', (e) => { e.preventDefault(); onEnd(); });
            el.addEventListener('mouseleave', () => { onEnd(); });
        };

        addTouchHandlers(btnLeft, 
            () => { this.touchLeft = true; btnLeft.classList.add('active'); },
            () => { this.touchLeft = false; btnLeft.classList.remove('active'); }
        );

        addTouchHandlers(btnRight,
            () => { this.touchRight = true; btnRight.classList.add('active'); },
            () => { this.touchRight = false; btnRight.classList.remove('active'); }
        );

        let menuTapCount = 0;
        let menuTapTimer = null;
        addTouchHandlers(btnMenu,
            () => {
                menuTapCount++;
                if (menuTapTimer) clearTimeout(menuTapTimer);
                menuTapTimer = setTimeout(() => { menuTapCount = 0; }, 400);
                
                if (menuTapCount === 1 && !this.ballInPlay && !this.gameOver) {
                    this.cycleDifficulty();
                } else if (menuTapCount >= 2) {
                    this.reset();
                    menuTapCount = 0;
                }
            },
            () => {}
        );

        btnRestart.addEventListener('touchstart', (e) => { e.preventDefault(); this.reset(); }, { passive: false });
        btnRestart.addEventListener('click', () => this.reset());

        canvas.addEventListener('touchstart', (e) => this.handlePlungerTouchStart(e), { passive: false });
        canvas.addEventListener('touchmove', (e) => this.handlePlungerTouchMove(e), { passive: false });
        canvas.addEventListener('touchend', (e) => this.handlePlungerTouchEnd(e), { passive: false });
        canvas.addEventListener('touchcancel', (e) => this.handlePlungerTouchEnd(e), { passive: false });
    }

    getCanvasCoords(touch) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (touch.clientX - rect.left) / this.scale,
            y: (touch.clientY - rect.top) / this.scale
        };
    }

    isInPlungerZone(x, y) {
        return x > 500 && x < 600 && y > 600 && y < 800;
    }

    handlePlungerTouchStart(e) {
        if (this.plungerTouchId !== null) return;
        
        for (const touch of e.changedTouches) {
            const coords = this.getCanvasCoords(touch);
            if (this.isInPlungerZone(coords.x, coords.y) && this.ballInPlay && this.isBallInPlungerLane()) {
                e.preventDefault();
                this.plungerTouchId = touch.identifier;
                this.plungerDragStartY = coords.y;
                this.plungerCharging = true;
                this.plungerPower = 0;
                break;
            }
        }
    }

    handlePlungerTouchMove(e) {
        if (this.plungerTouchId === null) return;
        
        for (const touch of e.changedTouches) {
            if (touch.identifier === this.plungerTouchId) {
                e.preventDefault();
                const coords = this.getCanvasCoords(touch);
                const dragDistance = coords.y - this.plungerDragStartY;
                if (dragDistance > 0) {
                    this.plungerPower = Math.min(dragDistance * 0.5, this.difficulty.plungerMaxPower);
                }
                break;
            }
        }
    }

    handlePlungerTouchEnd(e) {
        for (const touch of e.changedTouches) {
            if (touch.identifier === this.plungerTouchId) {
                e.preventDefault();
                if (this.plungerCharging && this.plungerPower > 0) {
                    this.launchBall();
                }
                this.plungerTouchId = null;
                this.plungerCharging = false;
                this.plungerPower = 0;
                break;
            }
        }
    }

    setupCollisions() {
        Events.on(this.engine, 'collisionStart', (event) => {
            for (const pair of event.pairs) {
                const { bodyA, bodyB } = pair;
                const labels = [bodyA.label, bodyB.label];
                
                if (labels.includes('ball')) {
                    const other = bodyA.label === 'ball' ? bodyB : bodyA;

                    if (other.label === 'bumper') {
                        this.onBumperHit(other);
                    } else if (other.label === 'target') {
                        this.onTargetHit(other);
                    } else if (other.label === 'spinner') {
                        this.onSpinnerHit();
                    } else if (other.label === 'wall') {
                        this.sound.play('wall');
                    } else if (other.label === 'drain') {
                        this.onDrain();
                    }
                }
            }
        });
    }

    onBumperHit(bumper) {
        this.sound.play('bumper');
        
        const now = performance.now();
        if (now - this.lastHitTime < 2000) {
            this.comboMultiplier = Math.min(this.comboMultiplier + 1, 5);
        } else {
            this.comboMultiplier = 1;
        }
        this.lastHitTime = now;

        const baseScore = Math.floor(100 * this.difficulty.scoreMultiplier);
        this.score += baseScore * this.comboMultiplier;
        this.updateUI();

        if (this.ball) {
            const dir = Vector.normalise(Vector.sub(this.ball.position, bumper.position));
            Body.applyForce(this.ball, this.ball.position, {
                x: dir.x * this.difficulty.bumperForce,
                y: dir.y * this.difficulty.bumperForce
            });
        }

        this.bumperHits[bumper.id] = now;
        this.particles.spawn(bumper.position.x, bumper.position.y, COLORS.neonGreen, 15);
    }

    onTargetHit(target) {
        this.sound.play('target');
        
        const baseScore = Math.floor(500 * this.difficulty.scoreMultiplier);
        this.score += baseScore * this.comboMultiplier;
        this.updateUI();

        const now = performance.now();
        this.targetHits[target.id] = now;
        this.particles.spawn(target.position.x, target.position.y, COLORS.neonBlue, 10);
    }

    onSpinnerHit() {
        this.sound.play('spinner');
    }

    onDrain() {
        if (!this.ball) return;

        if (this.ballSaverActive) {
            Body.setPosition(this.ball, { x: 535, y: 710 });
            Body.setVelocity(this.ball, { x: 0, y: 0 });
        } else {
            Composite.remove(this.world, this.ball);
            this.ball = null;
            this.ballInPlay = false;
            this.ballsRemaining--;
            this.updateUI();

            if (this.ballsRemaining <= 0) {
                this.gameOver = true;
                this.showGameOver();
            }
        }
    }

    isBallInPlungerLane() {
        if (!this.ball) return false;
        const pos = this.ball.position;
        return pos.x > 505 && pos.x < 565 && pos.y > 600;
    }

    launchBall() {
        if (!this.ball || this.plungerPower <= 0) return;
        if (!this.isBallInPlungerLane()) return;

        this.sound.play('launch');
        
        const launchVelocity = -(this.plungerPower / this.difficulty.plungerMaxPower) * 25;
        Body.setVelocity(this.ball, { x: 0, y: launchVelocity });
        this.plungerPower = 0;
    }

    cycleDifficulty() {
        const names = Object.keys(DIFFICULTY_PRESETS);
        this.difficultyIndex = (this.difficultyIndex + 1) % names.length;
        this.difficulty = DIFFICULTY_PRESETS[names[this.difficultyIndex]];
        this.engine.gravity.y = this.difficulty.gravity;
        this.ballsRemaining = this.difficulty.startingBalls;
        this.updateUI();
    }

    updateUI() {
        document.getElementById('score').textContent = `SCORE: ${this.score.toLocaleString()}`;
        document.getElementById('balls').textContent = `BALLS: ${this.ballsRemaining}`;
        document.getElementById('difficulty').textContent = `[${this.difficulty.name}]`;
        
        const diffEl = document.getElementById('difficulty');
        const colors = { EASY: '#00ff64', NORMAL: '#ffc800', HARD: '#ff32a0' };
        diffEl.style.color = colors[this.difficulty.name] || '#ffc800';
    }

    showGameOver() {
        document.getElementById('final-score').textContent = this.score.toLocaleString();
        
        const newBestEl = document.getElementById('new-best');
        const bestScoreEl = document.getElementById('best-score');
        
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('pinballBestScore', this.bestScore.toString());
            newBestEl.style.display = 'block';
        } else {
            newBestEl.style.display = 'none';
        }
        
        bestScoreEl.textContent = this.bestScore.toLocaleString();
        
        this.checkLeaderboardEligibility();
    }
    
    async checkLeaderboardEligibility() {
        if (typeof database === 'undefined') {
            document.getElementById('game-over').style.display = 'flex';
            return;
        }
        
        try {
            const snapshot = await database.ref('leaderboard').orderByChild('score').limitToLast(10).once('value');
            const scores = [];
            snapshot.forEach(child => {
                scores.push({ key: child.key, ...child.val() });
            });
            scores.sort((a, b) => b.score - a.score);
            
            const qualifiesForTop10 = scores.length < 10 || this.score > scores[scores.length - 1].score;
            
            if (qualifiesForTop10 && this.score > 0) {
                document.getElementById('modal-score').textContent = this.score.toLocaleString();
                document.getElementById('player-name').value = '';
                document.getElementById('name-input-modal').style.display = 'flex';
            } else {
                document.getElementById('game-over').style.display = 'flex';
            }
        } catch (error) {
            console.error('Leaderboard check failed:', error);
            document.getElementById('game-over').style.display = 'flex';
        }
    }
    
    async submitScore(name) {
        if (typeof database === 'undefined') return;
        
        const playerName = name.trim().toUpperCase() || 'ANON';
        
        try {
            await database.ref('leaderboard').push({
                name: playerName.substring(0, 10),
                score: this.score,
                difficulty: this.difficulty.name,
                timestamp: Date.now()
            });
            
            await this.cleanupLeaderboard();
            
            document.getElementById('name-input-modal').style.display = 'none';
            document.getElementById('game-over').style.display = 'flex';
        } catch (error) {
            console.error('Score submit failed:', error);
            document.getElementById('name-input-modal').style.display = 'none';
            document.getElementById('game-over').style.display = 'flex';
        }
    }
    
    async cleanupLeaderboard() {
        try {
            const snapshot = await database.ref('leaderboard').once('value');
            const scores = [];
            snapshot.forEach(child => {
                const val = child.val();
                if (val && typeof val.score === 'number') {
                    scores.push({ key: child.key, score: val.score });
                }
            });
            scores.sort((a, b) => b.score - a.score);
            
            if (scores.length > 10) {
                const toDelete = scores.slice(10);
                if (toDelete.length > 0 && toDelete.length < scores.length) {
                    const updates = {};
                    toDelete.forEach(item => {
                        updates[item.key] = null;
                    });
                    await database.ref('leaderboard').update(updates);
                }
            }
        } catch (error) {
            console.error('Cleanup failed:', error);
        }
    }
    
    async showLeaderboard() {
        const listEl = document.getElementById('leaderboard-list');
        listEl.innerHTML = '<div class="leaderboard-empty">Loading...</div>';
        document.getElementById('leaderboard-modal').style.display = 'flex';
        
        if (typeof database === 'undefined') {
            listEl.innerHTML = '<div class="leaderboard-empty">Leaderboard unavailable</div>';
            return;
        }
        
        try {
            const snapshot = await database.ref('leaderboard').orderByChild('score').limitToLast(10).once('value');
            const scores = [];
            snapshot.forEach(child => {
                scores.push(child.val());
            });
            scores.sort((a, b) => b.score - a.score);
            
            if (scores.length === 0) {
                listEl.innerHTML = '<div class="leaderboard-empty">No scores yet. Be the first!</div>';
                return;
            }
            
            listEl.innerHTML = scores.map((entry, i) => `
                <div class="leaderboard-entry">
                    <span class="leaderboard-rank">#${i + 1}</span>
                    <span class="leaderboard-name">${this.escapeHtml(entry.name)}</span>
                    <span class="leaderboard-score">${entry.score.toLocaleString()}</span>
                </div>
            `).join('');
        } catch (error) {
            console.error('Leaderboard load failed:', error);
            listEl.innerHTML = '<div class="leaderboard-empty">Failed to load leaderboard</div>';
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    setupLeaderboardUI() {
        document.getElementById('btn-submit-score')?.addEventListener('click', () => {
            const name = document.getElementById('player-name').value;
            this.submitScore(name);
        });
        
        document.getElementById('player-name')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const name = document.getElementById('player-name').value;
                this.submitScore(name);
            }
        });
        
        document.getElementById('btn-view-leaderboard')?.addEventListener('click', () => {
            document.getElementById('game-over').style.display = 'none';
            this.showLeaderboard();
        });
        
        document.getElementById('btn-close-leaderboard')?.addEventListener('click', () => {
            document.getElementById('leaderboard-modal').style.display = 'none';
            document.getElementById('game-over').style.display = 'flex';
        });
    }

    reset() {
        document.getElementById('game-over').style.display = 'none';

        this.score = 0;
        this.ballsRemaining = this.difficulty.startingBalls;
        this.ballInPlay = false;
        this.gameOver = false;
        this.comboMultiplier = 1;
        this.plungerPower = 0;
        this.plungerCharging = false;
        this.plungerTouchId = null;

        if (this.ball) {
            Composite.remove(this.world, this.ball);
            this.ball = null;
        }

        this.leftFlipper.deactivate();
        this.rightFlipper.deactivate();
        this.miniFlipper.deactivate();

        this.updateUI();
    }

    update(dt) {
        if (this.gameOver) return;

        if (this.keys['ArrowLeft'] || this.keys['KeyZ'] || this.touchLeft) {
            this.leftFlipper.activate();
        } else {
            this.leftFlipper.deactivate();
        }

        if (this.keys['ArrowRight'] || this.keys['KeyX'] || this.touchRight) {
            this.rightFlipper.activate();
            this.miniFlipper.activate();
        } else {
            this.rightFlipper.deactivate();
            this.miniFlipper.deactivate();
        }

        this.leftFlipper.update(dt);
        this.rightFlipper.update(dt);
        this.miniFlipper.update(dt);

        if (this.leftFlipper.checkBallCollision(this.ball, this.difficulty)) {
            this.sound.play('flipper');
            this.particles.spawn(this.ball.position.x, this.ball.position.y, COLORS.neonCyan, 12);
        }
        if (this.rightFlipper.checkBallCollision(this.ball, this.difficulty)) {
            this.sound.play('flipper');
            this.particles.spawn(this.ball.position.x, this.ball.position.y, COLORS.neonCyan, 12);
        }
        if (this.miniFlipper.checkBallCollision(this.ball, this.difficulty)) {
            this.sound.play('flipper');
            this.particles.spawn(this.ball.position.x, this.ball.position.y, COLORS.neonCyan, 12);
        }

        if (this.plungerCharging && this.keys['Space']) {
            this.plungerPower = Math.min(this.plungerPower + dt * 50, this.difficulty.plungerMaxPower);
        }

        if (!this.ball && this.ballsRemaining > 0 && !this.gameOver) {
            this.createBall();
        }

        if (this.ballSaverActive && performance.now() > this.ballSaverEndTime) {
            this.ballSaverActive = false;
        }

        for (const spinner of this.spinners) {
            spinner.spinnerAngle += spinner.spinnerSpeed * dt * 0.001;
            Body.setAngle(spinner, spinner.spinnerAngle);
        }

        if (this.ball) {
            this.ballTrail.push({ x: this.ball.position.x, y: this.ball.position.y });
            if (this.ballTrail.length > 15) {
                this.ballTrail.shift();
            }

            if (this.ball.position.y > SCREEN_HEIGHT + 50) {
                this.onDrain();
            }
        }

        Engine.update(this.engine, dt);
        this.particles.update();
    }

    draw() {
        const ctx = this.ctx;
        
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

        this.drawGrid(ctx);
        this.drawWalls(ctx);
        this.drawBumpers(ctx);
        this.drawSpinners(ctx);
        this.drawTargets(ctx);
        this.drawPlunger(ctx);
        
        this.leftFlipper.draw(ctx);
        this.rightFlipper.draw(ctx);
        this.miniFlipper.draw(ctx);
        
        this.drawBall(ctx);
        this.particles.draw(ctx);

        if (this.ballSaverActive) {
            this.drawBallSaver(ctx);
        }

        if (this.comboMultiplier > 1) {
            this.drawCombo(ctx);
        }
    }

    drawGrid(ctx) {
        ctx.strokeStyle = 'rgba(30, 30, 60, 0.5)';
        ctx.lineWidth = 1;
        for (let x = 0; x < SCREEN_WIDTH; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, SCREEN_HEIGHT);
            ctx.stroke();
        }
        for (let y = 0; y < SCREEN_HEIGHT; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(SCREEN_WIDTH, y);
            ctx.stroke();
        }
    }

    drawWalls(ctx) {
        ctx.strokeStyle = COLORS.neonPurple;
        ctx.lineWidth = 4;
        ctx.shadowColor = COLORS.neonPurple;
        ctx.shadowBlur = 15;

        for (const wall of this.walls) {
            if (!wall.vertices) continue;
            ctx.beginPath();
            ctx.moveTo(wall.vertices[0].x, wall.vertices[0].y);
            for (let i = 1; i < wall.vertices.length; i++) {
                ctx.lineTo(wall.vertices[i].x, wall.vertices[i].y);
            }
            ctx.closePath();
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
    }

    drawBumpers(ctx) {
        const now = performance.now();

        for (const bumper of this.bumpers) {
            const pos = bumper.position;
            const hitTime = this.bumperHits[bumper.id] || 0;
            const isHit = (now - hitTime) < 200;

            const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, BUMPER_RADIUS + 20);
            gradient.addColorStop(0, isHit ? 'rgba(255,255,255,0.8)' : 'rgba(0,255,100,0.4)');
            gradient.addColorStop(1, 'rgba(0,255,100,0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, BUMPER_RADIUS + 20, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = isHit ? '#ffffff' : COLORS.neonGreen;
            ctx.shadowColor = COLORS.neonGreen;
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, BUMPER_RADIUS - 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = COLORS.neonGreen;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, BUMPER_RADIUS, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    drawSpinners(ctx) {
        ctx.shadowColor = COLORS.spinner;
        ctx.shadowBlur = 10;

        for (const spinner of this.spinners) {
            const pos = spinner.position;
            const angle = spinner.angle;
            const halfLen = 40;

            ctx.save();
            ctx.translate(pos.x, pos.y);
            ctx.rotate(angle);

            ctx.fillStyle = COLORS.spinner;
            ctx.fillRect(-halfLen, -6, halfLen * 2, 12);

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
        ctx.shadowBlur = 0;
    }

    drawTargets(ctx) {
        const now = performance.now();

        for (const target of this.targets) {
            const hitTime = this.targetHits[target.id] || 0;
            const isHit = (now - hitTime) < 300;

            const vertices = target.vertices;
            if (!vertices || vertices.length < 2) continue;

            ctx.strokeStyle = isHit ? '#ffffff' : COLORS.neonBlue;
            ctx.lineWidth = 10;
            ctx.shadowColor = COLORS.neonBlue;
            ctx.shadowBlur = isHit ? 30 : 15;
            ctx.lineCap = 'round';

            ctx.beginPath();
            ctx.moveTo(vertices[0].x, vertices[0].y);
            for (let i = 1; i < vertices.length; i++) {
                ctx.lineTo(vertices[i].x, vertices[i].y);
            }
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
    }

    drawPlunger(ctx) {
        const plungerY = this.plungerRestY + (this.plungerPower / this.difficulty.plungerMaxPower) * 15;

        ctx.fillStyle = COLORS.plunger;
        ctx.shadowColor = COLORS.plunger;
        ctx.shadowBlur = 15;
        ctx.fillRect(515, plungerY - 5, 40, 10);
        ctx.shadowBlur = 0;

        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        ctx.strokeRect(570, 650, 20, 100);

        if (this.plungerPower > 0) {
            const barHeight = (this.plungerPower / this.difficulty.plungerMaxPower) * 100;
            ctx.fillStyle = COLORS.plunger;
            ctx.shadowColor = COLORS.plunger;
            ctx.shadowBlur = 10;
            ctx.fillRect(570, 750 - barHeight, 20, barHeight);
            ctx.shadowBlur = 0;
        }

        if (this.isBallInPlungerLane() && !this.plungerCharging) {
            ctx.fillStyle = 'rgba(255, 200, 0, 0.2)';
            ctx.fillRect(505, 600, 90, 195);
        }
    }

    drawBall(ctx) {
        if (!this.ball) return;

        const pos = this.ball.position;

        if (this.ballTrail.length > 1) {
            ctx.strokeStyle = COLORS.neonPink;
            ctx.lineCap = 'round';
            for (let i = 1; i < this.ballTrail.length; i++) {
                ctx.globalAlpha = i / this.ballTrail.length * 0.5;
                ctx.lineWidth = (i / this.ballTrail.length) * 8;
                ctx.beginPath();
                ctx.moveTo(this.ballTrail[i-1].x, this.ballTrail[i-1].y);
                ctx.lineTo(this.ballTrail[i].x, this.ballTrail[i].y);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, BALL_RADIUS + 15);
        gradient.addColorStop(0, 'rgba(255,50,150,0.6)');
        gradient.addColorStop(1, 'rgba(255,50,150,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, BALL_RADIUS + 15, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = COLORS.neonPink;
        ctx.shadowColor = COLORS.neonPink;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,200,220,0.8)';
        ctx.beginPath();
        ctx.arc(pos.x - 3, pos.y - 3, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    drawBallSaver(ctx) {
        const timeLeft = Math.max(0, (this.ballSaverEndTime - performance.now()) / 1000);
        const pulse = (Math.sin(performance.now() * 0.01) + 1) * 0.5;

        ctx.strokeStyle = `rgba(0,255,100,${0.3 + pulse * 0.3})`;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(275, 850, 200, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();

        ctx.fillStyle = COLORS.neonGreen;
        ctx.font = 'bold 18px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = COLORS.neonGreen;
        ctx.shadowBlur = 10;
        ctx.fillText(`BALL SAVER: ${timeLeft.toFixed(1)}s`, SCREEN_WIDTH / 2, 770);
        ctx.shadowBlur = 0;
    }

    drawCombo(ctx) {
        ctx.fillStyle = COLORS.neonGreen;
        ctx.font = 'bold 36px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = COLORS.neonGreen;
        ctx.shadowBlur = 20;
        ctx.fillText(`x${this.comboMultiplier} COMBO!`, SCREEN_WIDTH / 2, 80);
        ctx.shadowBlur = 0;
    }

    gameLoop() {
        const now = performance.now();
        const dt = Math.min(now - this.lastTime, 32);
        this.lastTime = now;

        this.update(dt);
        this.draw();

        requestAnimationFrame(() => this.gameLoop());
    }
}

let game;
window.addEventListener('load', () => {
    game = new PinballGame();
});
