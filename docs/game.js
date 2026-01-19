/**
 * Neon Cyberpunk Pinball - JavaScript/Matter.js Version
 * Ported from Python/Pymunk implementation
 */

const { Engine, Render, Runner, Bodies, Body, Composite, Events, Constraint, Vector } = Matter;

// =============================================================================
// CONSTANTS
// =============================================================================
const SCREEN_WIDTH = 600;
const SCREEN_HEIGHT = 800;
const BALL_RADIUS = 12;
const BUMPER_RADIUS = 25;

// Colors (Neon Cyberpunk)
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

// =============================================================================
// DIFFICULTY SETTINGS
// =============================================================================
const DIFFICULTY_PRESETS = {
    EASY: {
        name: 'EASY',
        gravity: 0.8,
        ballRestitution: 0.8,
        flipperRestitution: 0.95,
        flipperForce: 0.45,
        bumperRestitution: 1.8,
        bumperForce: 0.025,
        plungerMaxPower: 35,
        startingBalls: 5,
        ballSaverDuration: 8000,
        scoreMultiplier: 0.8
    },
    NORMAL: {
        name: 'NORMAL',
        gravity: 1.0,
        ballRestitution: 0.7,
        flipperRestitution: 0.85,
        flipperForce: 0.38,
        bumperRestitution: 1.5,
        bumperForce: 0.02,
        plungerMaxPower: 30,
        startingBalls: 3,
        ballSaverDuration: 5000,
        scoreMultiplier: 1.0
    },
    HARD: {
        name: 'HARD',
        gravity: 1.4,
        ballRestitution: 0.6,
        flipperRestitution: 0.75,
        flipperForce: 0.32,
        bumperRestitution: 1.3,
        bumperForce: 0.015,
        plungerMaxPower: 25,
        startingBalls: 3,
        ballSaverDuration: 3000,
        scoreMultiplier: 1.5
    }
};

// =============================================================================
// SOUND MANAGER (Web Audio API)
// =============================================================================
class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = false;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.enabled = true;
        } catch (e) {
            console.log('Web Audio not supported');
        }
    }

    play(type) {
        if (!this.enabled || !this.ctx) return;
        
        // Resume context if suspended (browser autoplay policy)
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        const now = this.ctx.currentTime;
        
        switch(type) {
            case 'bumper':
                osc.frequency.value = 880;
                osc.type = 'square';
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialDecayTo && gain.gain.exponentialDecayTo(0.01, now + 0.08);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
                osc.start(now);
                osc.stop(now + 0.08);
                break;
            case 'flipper':
                osc.frequency.value = 220;
                osc.type = 'sawtooth';
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
                break;
            case 'wall':
                osc.frequency.value = 440;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
                break;
            case 'target':
                osc.frequency.value = 1200;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
                osc.start(now);
                osc.stop(now + 0.15);
                break;
            case 'spinner':
                osc.frequency.value = 330;
                osc.type = 'triangle';
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.06);
                osc.start(now);
                osc.stop(now + 0.06);
                break;
            case 'launch':
                osc.frequency.value = 150;
                osc.type = 'sawtooth';
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
                break;
        }
    }
}

// =============================================================================
// PARTICLE SYSTEM
// =============================================================================
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
            p.vy += 0.1; // gravity
        }
    }

    draw(ctx) {
        for (const p of this.particles) {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}

// =============================================================================
// MAIN GAME CLASS
// =============================================================================
class PinballGame {
    constructor() {
        this.canvas = document.getElementById('game');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = SCREEN_WIDTH;
        this.canvas.height = SCREEN_HEIGHT;

        // Initialize systems
        this.sound = new SoundManager();
        this.particles = new ParticleSystem();
        
        // Difficulty
        this.difficultyIndex = 1; // NORMAL
        this.difficulty = DIFFICULTY_PRESETS.NORMAL;

        // Game state
        this.score = 0;
        this.ballsRemaining = this.difficulty.startingBalls;
        this.ballInPlay = false;
        this.gameOver = false;
        this.ballSaverActive = false;
        this.ballSaverEndTime = 0;
        this.comboMultiplier = 1;
        this.lastHitTime = 0;

        // Plunger state
        this.plungerPower = 0;
        this.plungerCharging = false;

        // Input state
        this.keys = {};

        // Visual effects
        this.ballTrail = [];
        this.bumperHits = {};
        this.targetHits = {};
        this.flipperHits = {};

        // Initialize physics
        this.initPhysics();
        this.createTable();
        this.setupInput();
        this.setupCollisions();

        // Start game loop
        this.lastTime = performance.now();
        this.gameLoop();
    }

    initPhysics() {
        this.engine = Engine.create();
        this.engine.gravity.y = this.difficulty.gravity;
        this.world = this.engine.world;
    }

    createTable() {
        // Clear existing bodies
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
            label: 'wall',
            render: { fillStyle: COLORS.wall }
        };

        const walls = [];

        // Left outer wall
        walls.push(Bodies.fromVertices(40, 475, [[
            { x: 50, y: 750 }, { x: 30, y: 200 }, { x: 35, y: 200 }, { x: 55, y: 750 }
        ]], wallOptions));
        walls.push(Bodies.fromVertices(55, 125, [[
            { x: 30, y: 200 }, { x: 80, y: 50 }, { x: 85, y: 55 }, { x: 35, y: 200 }
        ]], wallOptions));

        // Top wall
        walls.push(Bodies.rectangle(300, 47, 440, 6, wallOptions));

        // Right plunger lane walls
        walls.push(Bodies.rectangle(510, 425, 6, 650, wallOptions));
        walls.push(Bodies.rectangle(560, 425, 6, 650, wallOptions));

        // Plunger lane top curve
        walls.push(Bodies.fromVertices(540, 70, [[
            { x: 520, y: 50 }, { x: 545, y: 60 }, { x: 555, y: 80 }, { x: 560, y: 100 },
            { x: 555, y: 100 }, { x: 550, y: 80 }, { x: 540, y: 65 }, { x: 520, y: 55 }
        ]], wallOptions));

        // Left slingshot area
        walls.push(Bodies.fromVertices(75, 700, [[
            { x: 50, y: 750 }, { x: 100, y: 650 }, { x: 105, y: 655 }, { x: 55, y: 750 }
        ]], wallOptions));
        walls.push(Bodies.fromVertices(125, 635, [[
            { x: 100, y: 650 }, { x: 150, y: 620 }, { x: 155, y: 625 }, { x: 105, y: 655 }
        ]], wallOptions));

        // Right slingshot area
        walls.push(Bodies.fromVertices(425, 700, [[
            { x: 450, y: 750 }, { x: 400, y: 650 }, { x: 395, y: 655 }, { x: 445, y: 750 }
        ]], wallOptions));
        walls.push(Bodies.fromVertices(375, 635, [[
            { x: 400, y: 650 }, { x: 350, y: 620 }, { x: 345, y: 625 }, { x: 395, y: 655 }
        ]], wallOptions));

        // Left drain barrier (diagonal wall preventing left-side drain)
        walls.push(Bodies.fromVertices(110, 575, [[
            { x: 60, y: 540 }, { x: 160, y: 610 }, { x: 155, y: 618 }, { x: 55, y: 548 }
        ]], wallOptions));

        // Inner lane dividers
        walls.push(Bodies.rectangle(150, 200, 4, 100, wallOptions));
        walls.push(Bodies.rectangle(350, 200, 4, 100, wallOptions));

        // Ramp guides
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
        const flipperWidth = 80;
        const flipperHeight = 16;

        // Left flipper
        this.leftFlipper = Bodies.fromVertices(150, 700, [[
            { x: -15, y: -8 }, { x: 65, y: -4 }, { x: 65, y: 4 }, { x: -15, y: 8 }
        ]], {
            label: 'flipper',
            restitution: this.difficulty.flipperRestitution,
            friction: 0.5,
            render: { fillStyle: COLORS.flipper }
        });
        Body.setPosition(this.leftFlipper, { x: 150, y: 700 });

        this.leftFlipperConstraint = Constraint.create({
            bodyA: this.leftFlipper,
            pointB: { x: 150, y: 700 },
            stiffness: 1,
            length: 0
        });

        // Right flipper  
        this.rightFlipper = Bodies.fromVertices(350, 700, [[
            { x: 15, y: -8 }, { x: -65, y: -4 }, { x: -65, y: 4 }, { x: 15, y: 8 }
        ]], {
            label: 'flipper',
            restitution: this.difficulty.flipperRestitution,
            friction: 0.5,
            render: { fillStyle: COLORS.flipper }
        });
        Body.setPosition(this.rightFlipper, { x: 350, y: 700 });

        this.rightFlipperConstraint = Constraint.create({
            bodyA: this.rightFlipper,
            pointB: { x: 350, y: 700 },
            stiffness: 1,
            length: 0
        });

        // Mini flipper (right side, upper)
        this.miniFlipper = Bodies.fromVertices(450, 620, [[
            { x: 8, y: -5 }, { x: -35, y: -3 }, { x: -35, y: 3 }, { x: 8, y: 5 }
        ]], {
            label: 'flipper',
            restitution: this.difficulty.flipperRestitution,
            friction: 0.5,
            render: { fillStyle: COLORS.flipper }
        });
        Body.setPosition(this.miniFlipper, { x: 450, y: 620 });

        this.miniFlipperConstraint = Constraint.create({
            bodyA: this.miniFlipper,
            pointB: { x: 450, y: 620 },
            stiffness: 1,
            length: 0
        });

        // Set initial angles
        Body.setAngle(this.leftFlipper, 0.18);
        Body.setAngle(this.rightFlipper, -0.18);
        Body.setAngle(this.miniFlipper, -0.18);

        this.leftFlipperRest = 0.18;
        this.rightFlipperRest = -0.18;
        this.miniFlipperRest = -0.18;

        Composite.add(this.world, [
            this.leftFlipper, this.rightFlipper, this.miniFlipper,
            this.leftFlipperConstraint, this.rightFlipperConstraint, this.miniFlipperConstraint
        ]);
    }

    createPlunger() {
        this.plunger = Bodies.rectangle(535, 730, 40, 10, {
            isStatic: true,
            label: 'plunger',
            restitution: 0.95,
            render: { fillStyle: COLORS.plunger }
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
                restitution: this.difficulty.bumperRestitution,
                render: { fillStyle: COLORS.bumper }
            });
            this.bumpers.push(bumper);
            this.bumperHits[bumper.id] = 0;
        }

        Composite.add(this.world, this.bumpers);
    }

    createSpinners() {
        // Spinners are kinematic rotating bars
        const spinnerSpecs = [
            { x: 200, y: 220, length: 80, angle: 0, speed: 2.6 },
            { x: 400, y: 220, length: 80, angle: Math.PI / 2, speed: -3.2 },
            { x: 300, y: 320, length: 90, angle: 0, speed: 2.0 }
        ];

        for (const spec of spinnerSpecs) {
            const spinner = Bodies.rectangle(spec.x, spec.y, spec.length, 12, {
                isStatic: true, // We'll manually rotate it
                label: 'spinner',
                restitution: 0.9,
                friction: 0.6,
                render: { fillStyle: COLORS.spinner }
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
                restitution: 0.8,
                render: { fillStyle: COLORS.target }
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
            label: 'drain',
            render: { fillStyle: 'transparent' }
        });
        Composite.add(this.world, this.drain);
    }

    createBall(x = 535, y = 710) {
        this.ball = Bodies.circle(x, y, BALL_RADIUS, {
            label: 'ball',
            restitution: this.difficulty.ballRestitution,
            friction: 0.3,
            frictionAir: 0.001,
            render: { fillStyle: COLORS.ball }
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
                    } else if (other.label === 'flipper') {
                        this.onFlipperHit(other);
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

        // Apply extra impulse away from bumper
        if (this.ball) {
            const dir = Vector.normalise(Vector.sub(this.ball.position, bumper.position));
            Body.applyForce(this.ball, this.ball.position, {
                x: dir.x * this.difficulty.bumperForce,
                y: dir.y * this.difficulty.bumperForce
            });
        }

        // Visual effects
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

    onFlipperHit(flipper) {
        this.sound.play('flipper');
        
        const now = performance.now();
        this.flipperHits[flipper.id] = now;

        if (this.ball) {
            // Boost ball when flipper is moving fast
            const angVel = flipper.angularVelocity || 0;
            if (Math.abs(angVel) > 0.1) {
                Body.setVelocity(this.ball, {
                    x: this.ball.velocity.x * 1.2,
                    y: this.ball.velocity.y - 5
                });
            }
            this.particles.spawn(this.ball.position.x, this.ball.position.y, COLORS.neonCyan, 12);
        }
    }

    onSpinnerHit() {
        this.sound.play('spinner');
    }

    onDrain() {
        if (!this.ball) return;

        if (this.ballSaverActive) {
            // Ball saver - return ball to plunger
            Body.setPosition(this.ball, { x: 535, y: 710 });
            Body.setVelocity(this.ball, { x: 0, y: 0 });
        } else {
            // Remove ball
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

    flipLeft() {
        Body.setAngularVelocity(this.leftFlipper, -this.difficulty.flipperForce);
        Body.setAngle(this.leftFlipper, Math.max(this.leftFlipperRest - 0.6, this.leftFlipper.angle - 0.15));
    }

    flipRight() {
        Body.setAngularVelocity(this.rightFlipper, this.difficulty.flipperForce);
        Body.setAngle(this.rightFlipper, Math.min(this.rightFlipperRest + 0.6, this.rightFlipper.angle + 0.15));
        
        Body.setAngularVelocity(this.miniFlipper, this.difficulty.flipperForce);
        Body.setAngle(this.miniFlipper, Math.min(this.miniFlipperRest + 0.6, this.miniFlipper.angle + 0.15));
    }

    releaseLeft() {
        Body.setAngularVelocity(this.leftFlipper, this.difficulty.flipperForce * 0.5);
    }

    releaseRight() {
        Body.setAngularVelocity(this.rightFlipper, -this.difficulty.flipperForce * 0.5);
        Body.setAngularVelocity(this.miniFlipper, -this.difficulty.flipperForce * 0.5);
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
        
        // Update difficulty color
        const diffEl = document.getElementById('difficulty');
        const colors = { EASY: '#00ff64', NORMAL: '#ffc800', HARD: '#ff32a0' };
        diffEl.style.color = colors[this.difficulty.name] || '#ffc800';
    }

    showGameOver() {
        document.getElementById('final-score').textContent = this.score.toLocaleString();
        document.getElementById('game-over').style.display = 'flex';
    }

    reset() {
        // Hide game over
        document.getElementById('game-over').style.display = 'none';

        // Reset state
        this.score = 0;
        this.ballsRemaining = this.difficulty.startingBalls;
        this.ballInPlay = false;
        this.gameOver = false;
        this.comboMultiplier = 1;
        this.plungerPower = 0;
        this.plungerCharging = false;

        // Remove existing ball
        if (this.ball) {
            Composite.remove(this.world, this.ball);
            this.ball = null;
        }

        // Reset flippers
        Body.setAngle(this.leftFlipper, this.leftFlipperRest);
        Body.setAngle(this.rightFlipper, this.rightFlipperRest);
        Body.setAngle(this.miniFlipper, this.miniFlipperRest);

        this.updateUI();
    }

    update(dt) {
        if (this.gameOver) return;

        // Handle input
        if (this.keys['ArrowLeft'] || this.keys['KeyZ']) {
            this.flipLeft();
        } else {
            // Return flipper to rest
            if (this.leftFlipper.angle < this.leftFlipperRest) {
                Body.setAngle(this.leftFlipper, Math.min(this.leftFlipperRest, this.leftFlipper.angle + 0.08));
            }
        }

        if (this.keys['ArrowRight'] || this.keys['KeyX']) {
            this.flipRight();
        } else {
            // Return flipper to rest
            if (this.rightFlipper.angle > this.rightFlipperRest) {
                Body.setAngle(this.rightFlipper, Math.max(this.rightFlipperRest, this.rightFlipper.angle - 0.08));
            }
            if (this.miniFlipper.angle > this.miniFlipperRest) {
                Body.setAngle(this.miniFlipper, Math.max(this.miniFlipperRest, this.miniFlipper.angle - 0.08));
            }
        }

        // Charge plunger
        if (this.plungerCharging) {
            this.plungerPower = Math.min(this.plungerPower + dt * 50, this.difficulty.plungerMaxPower);
        }

        // Spawn ball if needed
        if (!this.ball && this.ballsRemaining > 0 && !this.gameOver) {
            this.createBall();
        }

        // Update ball saver
        if (this.ballSaverActive && performance.now() > this.ballSaverEndTime) {
            this.ballSaverActive = false;
        }

        // Update spinners (rotate them)
        for (const spinner of this.spinners) {
            spinner.spinnerAngle += spinner.spinnerSpeed * dt * 0.001;
            Body.setAngle(spinner, spinner.spinnerAngle);
        }

        // Update ball trail
        if (this.ball) {
            this.ballTrail.push({ x: this.ball.position.x, y: this.ball.position.y });
            if (this.ballTrail.length > 15) {
                this.ballTrail.shift();
            }

            // Check if ball fell off screen
            if (this.ball.position.y > SCREEN_HEIGHT + 50) {
                this.onDrain();
            }
        }

        // Update physics
        Engine.update(this.engine, dt);

        // Update particles
        this.particles.update();
    }

    draw() {
        const ctx = this.ctx;
        
        // Clear with background
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

        // Draw grid
        this.drawGrid(ctx);

        // Draw walls with glow
        this.drawWalls(ctx);

        // Draw bumpers
        this.drawBumpers(ctx);

        // Draw spinners
        this.drawSpinners(ctx);

        // Draw targets
        this.drawTargets(ctx);

        // Draw plunger
        this.drawPlunger(ctx);

        // Draw flippers
        this.drawFlippers(ctx);

        // Draw ball
        this.drawBall(ctx);

        // Draw particles
        this.particles.draw(ctx);

        // Draw ball saver indicator
        if (this.ballSaverActive) {
            this.drawBallSaver(ctx);
        }

        // Draw combo
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
            const timeSinceHit = now - hitTime;
            const isHit = timeSinceHit < 200;

            // Glow
            const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, BUMPER_RADIUS + 20);
            gradient.addColorStop(0, isHit ? 'rgba(255,255,255,0.8)' : 'rgba(0,255,100,0.4)');
            gradient.addColorStop(1, 'rgba(0,255,100,0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, BUMPER_RADIUS + 20, 0, Math.PI * 2);
            ctx.fill();

            // Core
            ctx.fillStyle = isHit ? '#ffffff' : COLORS.neonGreen;
            ctx.shadowColor = COLORS.neonGreen;
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, BUMPER_RADIUS - 5, 0, Math.PI * 2);
            ctx.fill();

            // Ring
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
            const halfLen = spinner.vertices ? 
                Math.sqrt(Math.pow(spinner.vertices[0].x - spinner.vertices[2].x, 2) + 
                         Math.pow(spinner.vertices[0].y - spinner.vertices[2].y, 2)) / 2 : 40;

            ctx.save();
            ctx.translate(pos.x, pos.y);
            ctx.rotate(angle);

            // Bar
            ctx.fillStyle = COLORS.spinner;
            ctx.fillRect(-halfLen, -6, halfLen * 2, 12);

            // Center pivot
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
            const timeSinceHit = now - hitTime;
            const isHit = timeSinceHit < 300;

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

        // Plunger body
        ctx.fillStyle = COLORS.plunger;
        ctx.shadowColor = COLORS.plunger;
        ctx.shadowBlur = 15;
        ctx.fillRect(515, plungerY - 5, 40, 10);
        ctx.shadowBlur = 0;

        // Power bar background
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        ctx.strokeRect(570, 650, 20, 100);

        // Power bar fill
        if (this.plungerPower > 0) {
            const barHeight = (this.plungerPower / this.difficulty.plungerMaxPower) * 100;
            ctx.fillStyle = COLORS.plunger;
            ctx.shadowColor = COLORS.plunger;
            ctx.shadowBlur = 10;
            ctx.fillRect(570, 750 - barHeight, 20, barHeight);
            ctx.shadowBlur = 0;
        }
    }

    drawFlippers(ctx) {
        const now = performance.now();
        const flippers = [
            { body: this.leftFlipper, vertices: [{ x: -15, y: -8 }, { x: 65, y: -4 }, { x: 65, y: 4 }, { x: -15, y: 8 }] },
            { body: this.rightFlipper, vertices: [{ x: 15, y: -8 }, { x: -65, y: -4 }, { x: -65, y: 4 }, { x: 15, y: 8 }] },
            { body: this.miniFlipper, vertices: [{ x: 8, y: -5 }, { x: -35, y: -3 }, { x: -35, y: 3 }, { x: 8, y: 5 }] }
        ];

        for (const flipper of flippers) {
            const body = flipper.body;
            const hitTime = this.flipperHits[body.id] || 0;
            const isHit = (now - hitTime) < 150;

            ctx.save();
            ctx.translate(body.position.x, body.position.y);
            ctx.rotate(body.angle);

            // Glow
            ctx.fillStyle = isHit ? '#ffffff' : COLORS.flipper;
            ctx.shadowColor = isHit ? '#ffffff' : COLORS.flipper;
            ctx.shadowBlur = isHit ? 25 : 15;

            ctx.beginPath();
            ctx.moveTo(flipper.vertices[0].x, flipper.vertices[0].y);
            for (let i = 1; i < flipper.vertices.length; i++) {
                ctx.lineTo(flipper.vertices[i].x, flipper.vertices[i].y);
            }
            ctx.closePath();
            ctx.fill();

            // Outline
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.restore();
        }
        ctx.shadowBlur = 0;
    }

    drawBall(ctx) {
        if (!this.ball) return;

        const pos = this.ball.position;

        // Trail
        if (this.ballTrail.length > 1) {
            ctx.strokeStyle = COLORS.neonPink;
            ctx.lineCap = 'round';
            for (let i = 1; i < this.ballTrail.length; i++) {
                const alpha = i / this.ballTrail.length * 0.5;
                ctx.globalAlpha = alpha;
                ctx.lineWidth = (i / this.ballTrail.length) * 8;
                ctx.beginPath();
                ctx.moveTo(this.ballTrail[i-1].x, this.ballTrail[i-1].y);
                ctx.lineTo(this.ballTrail[i].x, this.ballTrail[i].y);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        // Glow
        const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, BALL_RADIUS + 15);
        gradient.addColorStop(0, 'rgba(255,50,150,0.6)');
        gradient.addColorStop(1, 'rgba(255,50,150,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, BALL_RADIUS + 15, 0, Math.PI * 2);
        ctx.fill();

        // Ball body
        ctx.fillStyle = COLORS.neonPink;
        ctx.shadowColor = COLORS.neonPink;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        // Highlight
        ctx.fillStyle = 'rgba(255,200,220,0.8)';
        ctx.beginPath();
        ctx.arc(pos.x - 3, pos.y - 3, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    drawBallSaver(ctx) {
        const timeLeft = Math.max(0, (this.ballSaverEndTime - performance.now()) / 1000);
        const pulse = (Math.sin(performance.now() * 0.01) + 1) * 0.5;

        // Arc at bottom
        ctx.strokeStyle = `rgba(0,255,100,${0.3 + pulse * 0.3})`;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(275, 850, 200, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();

        // Text
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
        const dt = Math.min(now - this.lastTime, 32); // Cap at ~30fps minimum
        this.lastTime = now;

        this.update(dt);
        this.draw();

        requestAnimationFrame(() => this.gameLoop());
    }
}

// Start game when page loads
let game;
window.addEventListener('load', () => {
    game = new PinballGame();
});
