"""
Cyberpunk Neon Pinball Game
===========================
A fast-paced arcade pinball with neon cyberpunk aesthetics.

Controls:
- Left Arrow / Z: Left flipper
- Right Arrow / X: Right flipper + Mini flipper
- Space: Launch ball (hold to charge)
- D: Cycle difficulty (EASY/NORMAL/HARD) - only when ball not in play
- R: Reset game
- ESC: Quit
"""
import sys
import math
import random
import asyncio
import numpy as np
import pygame
import pymunk
import pymunk.pygame_util
from pymunk import Vec2d


class SoundManager:
    def __init__(self):
        self.sounds = {}
        self.enabled = False
        try:
            pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=512)
            self._generate_sounds()
            self.enabled = True
        except Exception:
            pass
    
    def _generate_sounds(self):
        try:
            self.sounds['bumper'] = self._make_sound(880, 0.08, 0.3, 0.01, 0.07, 'square')
            self.sounds['flipper'] = self._make_sound(220, 0.1, 0.4, 0.005, 0.095, 'saw')
            self.sounds['wall'] = self._make_sound(440, 0.05, 0.2, 0.005, 0.045, 'sine')
            self.sounds['target'] = self._make_sound(1200, 0.15, 0.3, 0.01, 0.14, 'sine')
            self.sounds['spinner'] = self._make_sound(330, 0.06, 0.25, 0.01, 0.05, 'triangle')
            self.sounds['launch'] = self._make_sound(150, 0.2, 0.4, 0.02, 0.18, 'saw')
        except Exception:
            self.enabled = False
    
    def _make_sound(self, frequency, duration, volume, attack, decay, wave='sine'):
        sample_rate = 44100
        n_samples = int(sample_rate * duration)
        t = np.linspace(0, duration, n_samples, dtype=np.float32)
        
        if wave == 'sine':
            waveform = np.sin(2 * np.pi * frequency * t)
        elif wave == 'square':
            waveform = np.sign(np.sin(2 * np.pi * frequency * t))
        elif wave == 'saw':
            waveform = 2 * (t * frequency % 1) - 1
        elif wave == 'triangle':
            waveform = 2 * np.abs(2 * (t * frequency % 1) - 1) - 1
        else:
            waveform = np.sin(2 * np.pi * frequency * t)
        
        envelope = np.ones(n_samples, dtype=np.float32)
        attack_samples = int(attack * sample_rate)
        decay_samples = int(decay * sample_rate)
        
        if attack_samples > 0:
            envelope[:attack_samples] = np.linspace(0, 1, attack_samples)
        if decay_samples > 0:
            envelope[-decay_samples:] = np.linspace(1, 0, decay_samples)
        
        audio = (waveform * envelope * volume * 32767).astype(np.int16)
        stereo = np.column_stack((audio, audio))
        
        return pygame.sndarray.make_sound(stereo)
    
    def play(self, sound_name):
        if self.enabled and sound_name in self.sounds:
            try:
                self.sounds[sound_name].play()
            except Exception:
                pass


# =============================================================================
# CONSTANTS
# =============================================================================
SCREEN_WIDTH = 600
SCREEN_HEIGHT = 800
FPS = 60
PHYSICS_SUBSTEPS = 5

# Collision types
COLLISION_BALL = 1
COLLISION_BUMPER = 2
COLLISION_TARGET = 3
COLLISION_DRAIN = 4
COLLISION_FLIPPER = 5
COLLISION_SPINNER = 6
COLLISION_WALL = 7

# Fixed physics constants
BALL_MASS = 1
BALL_RADIUS = 12
FLIPPER_MASS = 100
BUMPER_RADIUS = 25


# =============================================================================
# DIFFICULTY SETTINGS
# =============================================================================
class DifficultyPreset:
    """Difficulty preset with all tunable physics parameters."""
    
    def __init__(self, name: str, **kwargs):
        self.name = name
        # Gravity
        self.gravity = kwargs.get('gravity', (0, 1000))
        # Ball physics
        self.ball_elasticity = kwargs.get('ball_elasticity', 0.7)
        self.ball_friction = kwargs.get('ball_friction', 0.3)
        # Flipper physics
        self.flipper_elasticity = kwargs.get('flipper_elasticity', 0.4)
        self.flipper_impulse = kwargs.get('flipper_impulse', 50000)
        self.flipper_spring_stiffness = kwargs.get('flipper_spring_stiffness', 25000000)
        self.flipper_spring_damping = kwargs.get('flipper_spring_damping', 1000000)
        self.flipper_rest_angle = kwargs.get('flipper_rest_angle', 0.18)
        # Bumper physics
        self.bumper_elasticity = kwargs.get('bumper_elasticity', 1.5)
        self.bumper_impulse = kwargs.get('bumper_impulse', 500)
        # Plunger
        self.plunger_max_power = kwargs.get('plunger_max_power', 2500)
        self.plunger_charge_rate = kwargs.get('plunger_charge_rate', 5000)
        # Game settings
        self.starting_balls = kwargs.get('starting_balls', 3)
        self.ball_saver_duration = kwargs.get('ball_saver_duration', 5.0)
        # Scoring
        self.score_multiplier = kwargs.get('score_multiplier', 1.0)


# Difficulty presets
DIFFICULTY_EASY = DifficultyPreset(
    "EASY",
    gravity=(0, 3200),
    ball_elasticity=0.8,
    ball_friction=0.2,
    flipper_elasticity=0.95,
    flipper_impulse=100000,
    flipper_spring_stiffness=20000000,  # Slightly softer return
    flipper_spring_damping=800000,
    flipper_rest_angle=0.22,       # Wider flipper angle
    bumper_elasticity=1.8,         # More bumper bounce
    bumper_impulse=600,            # Stronger bumper kick
    plunger_max_power=2800,        # More plunger power
    plunger_charge_rate=4000,      # Slower charge (more control)
    starting_balls=5,              # More balls
    ball_saver_duration=8.0,       # Longer ball saver
    score_multiplier=0.8,          # Slightly lower score
)

DIFFICULTY_NORMAL = DifficultyPreset(
    "NORMAL",
    gravity=(0, 4000),
    ball_elasticity=0.7,
    ball_friction=0.3,
    flipper_elasticity=0.85,
    flipper_impulse=90000,
    flipper_spring_stiffness=25000000,
    flipper_spring_damping=1000000,
    flipper_rest_angle=0.18,
    bumper_elasticity=1.5,
    bumper_impulse=500,
    plunger_max_power=2500,
    plunger_charge_rate=5000,
    starting_balls=3,
    ball_saver_duration=5.0,
    score_multiplier=1.0,
)

DIFFICULTY_HARD = DifficultyPreset(
    "HARD",
    gravity=(0, 5600),
    ball_elasticity=0.6,
    ball_friction=0.4,
    flipper_elasticity=0.75,
    flipper_impulse=80000,
    flipper_spring_stiffness=30000000,
    flipper_spring_damping=1200000,
    flipper_rest_angle=0.15,
    bumper_elasticity=1.3,
    bumper_impulse=400,
    plunger_max_power=2200,
    plunger_charge_rate=6000,
    starting_balls=3,
    ball_saver_duration=3.0,
    score_multiplier=1.5,
)

DIFFICULTY_PRESETS = [DIFFICULTY_EASY, DIFFICULTY_NORMAL, DIFFICULTY_HARD]


class DifficultyManager:
    """Manages current difficulty settings."""
    
    def __init__(self):
        self.presets = DIFFICULTY_PRESETS
        self.current_index = 1  # Start at NORMAL
        
    @property
    def current(self) -> DifficultyPreset:
        return self.presets[self.current_index]
    
    def cycle_difficulty(self) -> DifficultyPreset:
        """Cycle to next difficulty and return new preset."""
        self.current_index = (self.current_index + 1) % len(self.presets)
        return self.current
    
    def set_difficulty(self, index: int):
        """Set difficulty by index."""
        self.current_index = max(0, min(index, len(self.presets) - 1))

# =============================================================================
# COLORS (Neon Cyberpunk - will be enhanced by frontend agent)
# =============================================================================
COLOR_BG = (10, 10, 20)
COLOR_BALL = (255, 50, 150)
COLOR_FLIPPER = (0, 255, 255)
COLOR_WALL = (100, 100, 150)
COLOR_BUMPER = (255, 0, 100)
COLOR_TARGET = (0, 255, 100)
COLOR_PLUNGER = (255, 200, 0)
COLOR_TEXT = (255, 255, 255)
COLOR_NEON_PINK = (255, 50, 150)
COLOR_NEON_CYAN = (0, 255, 255)
COLOR_NEON_GREEN = (0, 255, 100)


# =============================================================================
# GAME STATE
# =============================================================================
class GameState:
    def __init__(self, difficulty: DifficultyPreset = None):
        if difficulty is None:
            difficulty = DIFFICULTY_NORMAL
        self.difficulty = difficulty
        self.score: int = 0
        self.balls_remaining: int = difficulty.starting_balls
        self.ball_in_play: bool = False
        self.game_over: bool = False
        self.ball_saver_active: bool = False
        self.ball_saver_timer: float = 0.0
        self.plunger_power: float = 0.0
        self.plunger_charging: bool = False
        self.plunger_direction: int = 1
        self.combo_multiplier: int = 1
        self.last_hit_time: float = 0.0
        self.asking_for_name: bool = False
        self.player_name: str = ""
        self.name_submitted: bool = False
        
    def reset(self, difficulty: DifficultyPreset = None):
        if difficulty is None:
            difficulty = self.difficulty
        self.__init__(difficulty)


class HighScoreBoard:
    def __init__(self):
        self.scores = []
        self.max_entries = 10
        self._load_scores()
    
    def _load_scores(self):
        try:
            import json
            import os
            score_file = os.path.join(os.path.dirname(__file__), "highscores.json")
            if os.path.exists(score_file):
                with open(score_file, "r") as f:
                    self.scores = json.load(f)
        except:
            self.scores = []
    
    def _save_scores(self):
        try:
            import json
            import os
            score_file = os.path.join(os.path.dirname(__file__), "highscores.json")
            with open(score_file, "w") as f:
                json.dump(self.scores, f)
        except:
            pass
    
    def add_score(self, name: str, score: int):
        self.scores.append({"name": name, "score": score})
        self.scores.sort(key=lambda x: x["score"], reverse=True)
        self.scores = self.scores[:self.max_entries]
        self._save_scores()
    
    def is_high_score(self, score: int) -> bool:
        if len(self.scores) < self.max_entries:
            return True
        return score > self.scores[-1]["score"]


# =============================================================================
# PINBALL TABLE CREATION
# =============================================================================
class PinballTable:
    def __init__(self, space: pymunk.Space, game_state: GameState, difficulty: DifficultyPreset, renderer=None, sound_manager=None):
        self.space = space
        self.game_state = game_state
        self.difficulty = difficulty
        self.renderer = renderer
        self.sound_manager = sound_manager
        self.balls = []
        self.bumpers = []
        self.targets = []
        self.spinners = []
        self.ball_saver_segment = None
        
        self.left_flipper_body = None
        self.right_flipper_body = None
        
        self._create_walls()
        self._create_flippers()
        self._create_plunger_lane()
        self._create_bumpers()
        self._create_spinners()
        self._create_targets()
        self._create_drain()
        self._setup_collision_handlers()
    
    def _create_walls(self):
        """Create outer walls and playfield boundaries."""
        static_body = self.space.static_body
        walls = []
        
        walls.append(pymunk.Segment(static_body, (50, 750), (30, 200), 3))
        walls.append(pymunk.Segment(static_body, (30, 200), (80, 50), 3))
        
        walls.append(pymunk.Segment(static_body, (80, 50), (520, 50), 3))
        
        walls.append(pymunk.Segment(static_body, (510, 100), (510, 750), 3))
        walls.append(pymunk.Segment(static_body, (560, 750), (560, 100), 3))
        
        walls.append(pymunk.Segment(static_body, (560, 100), (555, 80), 3))
        walls.append(pymunk.Segment(static_body, (555, 80), (545, 60), 3))
        walls.append(pymunk.Segment(static_body, (545, 60), (520, 50), 3))
        
        # Curved walls near flippers (slingshots area)
        # Left slingshot
        walls.append(pymunk.Segment(static_body, (50, 750), (100, 650), 3))
        walls.append(pymunk.Segment(static_body, (100, 650), (150, 620), 3))
        
        # Right slingshot  
        walls.append(pymunk.Segment(static_body, (450, 750), (400, 650), 3))
        walls.append(pymunk.Segment(static_body, (400, 650), (350, 620), 3))
        
        walls.append(pymunk.Segment(static_body, (60, 540), (160, 610), 3))
        
        # Inner lane dividers
        walls.append(pymunk.Segment(static_body, (150, 150), (150, 250), 2))
        walls.append(pymunk.Segment(static_body, (350, 150), (350, 250), 2))
        
        # Ramp guides
        walls.append(pymunk.Segment(static_body, (200, 300), (180, 400), 2))
        walls.append(pymunk.Segment(static_body, (300, 300), (320, 400), 2))
        
        for wall in walls:
            wall.elasticity = 0.6
            wall.friction = 0.5
            wall.collision_type = COLLISION_WALL
            wall.filter = pymunk.ShapeFilter(group=1)
        
        self.space.add(*walls)
        self.walls = walls
    
    def _create_flippers(self):
        d = self.difficulty
        flipper_poly = [(15, -10), (-80, 0), (15, 10)]
        
        self.right_flipper_body = pymunk.Body(FLIPPER_MASS, 
            pymunk.moment_for_poly(FLIPPER_MASS, flipper_poly))
        self.right_flipper_body.position = (350, 700)
        right_flipper_shape = pymunk.Poly(self.right_flipper_body, flipper_poly)
        right_flipper_shape.elasticity = d.flipper_elasticity
        right_flipper_shape.collision_type = COLLISION_FLIPPER
        right_flipper_shape.filter = pymunk.ShapeFilter(group=2)
        self.space.add(self.right_flipper_body, right_flipper_shape)
        
        right_joint_body = pymunk.Body(body_type=pymunk.Body.KINEMATIC)
        right_joint_body.position = self.right_flipper_body.position
        right_pin = pymunk.PinJoint(self.right_flipper_body, right_joint_body, (0, 0), (0, 0))
        right_spring = pymunk.DampedRotarySpring(
            self.right_flipper_body, right_joint_body,
            d.flipper_rest_angle,
            d.flipper_spring_stiffness,
            d.flipper_spring_damping
        )
        right_limit = pymunk.RotaryLimitJoint(
            self.right_flipper_body, right_joint_body,
            -0.1, 0.6
        )
        self.space.add(right_pin, right_spring, right_limit)
        
        left_poly = [(-x, y) for x, y in flipper_poly]
        self.left_flipper_body = pymunk.Body(FLIPPER_MASS,
            pymunk.moment_for_poly(FLIPPER_MASS, left_poly))
        self.left_flipper_body.position = (150, 700)
        left_flipper_shape = pymunk.Poly(self.left_flipper_body, left_poly)
        left_flipper_shape.elasticity = d.flipper_elasticity
        left_flipper_shape.collision_type = COLLISION_FLIPPER
        left_flipper_shape.filter = pymunk.ShapeFilter(group=2)
        self.space.add(self.left_flipper_body, left_flipper_shape)
        
        left_joint_body = pymunk.Body(body_type=pymunk.Body.KINEMATIC)
        left_joint_body.position = self.left_flipper_body.position
        left_pin = pymunk.PinJoint(self.left_flipper_body, left_joint_body, (0, 0), (0, 0))
        left_spring = pymunk.DampedRotarySpring(
            self.left_flipper_body, left_joint_body,
            -d.flipper_rest_angle,
            d.flipper_spring_stiffness,
            d.flipper_spring_damping
        )
        left_limit = pymunk.RotaryLimitJoint(
            self.left_flipper_body, left_joint_body,
            -0.6, 0.1
        )
        self.space.add(left_pin, left_spring, left_limit)
        
        self.right_flipper_shape = right_flipper_shape
        self.left_flipper_shape = left_flipper_shape
        
        mini_flipper_poly = [(8, -5), (-40, 0), (8, 5)]
        mini_mass = FLIPPER_MASS * 0.5
        self.mini_flipper_body = pymunk.Body(mini_mass,
            pymunk.moment_for_poly(mini_mass, mini_flipper_poly))
        self.mini_flipper_body.position = (450, 620)
        mini_flipper_shape = pymunk.Poly(self.mini_flipper_body, mini_flipper_poly)
        mini_flipper_shape.elasticity = d.flipper_elasticity
        mini_flipper_shape.collision_type = COLLISION_FLIPPER
        mini_flipper_shape.filter = pymunk.ShapeFilter(group=2)
        self.space.add(self.mini_flipper_body, mini_flipper_shape)
        
        mini_joint_body = pymunk.Body(body_type=pymunk.Body.KINEMATIC)
        mini_joint_body.position = self.mini_flipper_body.position
        mini_pin = pymunk.PinJoint(self.mini_flipper_body, mini_joint_body, (0, 0), (0, 0))
        mini_spring = pymunk.DampedRotarySpring(
            self.mini_flipper_body, mini_joint_body,
            d.flipper_rest_angle,
            d.flipper_spring_stiffness * 0.5,
            d.flipper_spring_damping * 0.5
        )
        mini_limit = pymunk.RotaryLimitJoint(
            self.mini_flipper_body, mini_joint_body,
            -0.1, 0.6
        )
        self.space.add(mini_pin, mini_spring, mini_limit)
        self.mini_flipper_shape = mini_flipper_shape
    
    def _create_plunger_lane(self):
        """Create the ball launch area."""
        self.plunger_rest_y = 730
        self.plunger_min_y = 730
        self.plunger_max_y = 745
        
        plunger_width = 40
        plunger_height = 10
        self.plunger_body = pymunk.Body(body_type=pymunk.Body.KINEMATIC)
        self.plunger_body.position = (535, self.plunger_rest_y)
        
        plunger_shape = pymunk.Poly.create_box(self.plunger_body, (plunger_width, plunger_height))
        plunger_shape.elasticity = 0.95
        plunger_shape.friction = 0.5
        self.space.add(self.plunger_body, plunger_shape)
        self.plunger_shape = plunger_shape
    
    def _create_bumpers(self):
        bumper_positions = [
            (120, 140), (300, 120), (480, 140),
            (180, 300), (420, 300),
            (300, 420),
            (150, 520), (380, 540),
        ]
        
        for pos in bumper_positions:
            body = pymunk.Body(body_type=pymunk.Body.KINEMATIC)
            body.position = pos
            shape = pymunk.Circle(body, BUMPER_RADIUS)
            shape.elasticity = self.difficulty.bumper_elasticity
            shape.collision_type = COLLISION_BUMPER
            self.space.add(body, shape)
            self.bumpers.append((body, shape))
    
    def _create_spinners(self):
        spinner_specs = [
            ((200, 220), 80, 0.0, 2.6),
            ((400, 220), 80, math.pi / 2, -3.2),
            ((300, 320), 90, 0.0, 2.0),
        ]
        self.spinner_positions = []
        
        for pos, length, angle, speed in spinner_specs:
            body = pymunk.Body(body_type=pymunk.Body.KINEMATIC)
            body.position = pos
            body.angle = angle
            body.angular_velocity = speed
            shape = pymunk.Segment(body, (-length / 2, 0), (length / 2, 0), 6)
            shape.elasticity = 0.9
            shape.friction = 0.6
            shape.collision_type = COLLISION_SPINNER
            self.space.add(body, shape)
            self.spinners.append((body, shape))
            self.spinner_positions.append(pos)
    
    def _create_targets(self):
        """Create rectangular targets for scoring."""
        target_positions = [
            ((120, 350), (120, 400)),  # Left lane target
            ((380, 350), (380, 400)),  # Right lane target
            ((250, 120), (350, 120)),  # Top target
        ]
        
        for start, end in target_positions:
            body = self.space.static_body
            shape = pymunk.Segment(body, start, end, 5)
            shape.elasticity = 0.8
            shape.collision_type = COLLISION_TARGET
            shape.sensor = False
            self.space.add(shape)
            self.targets.append(shape)
    
    def _create_drain(self):
        """Create the ball drain sensor at the bottom."""
        drain_body = self.space.static_body
        drain = pymunk.Segment(drain_body, (50, 780), (500, 780), 5)
        drain.sensor = True
        drain.collision_type = COLLISION_DRAIN
        self.space.add(drain)
        self.drain = drain
    
    def _setup_collision_handlers(self):
        """Set up collision callbacks for scoring."""
        # Ball vs Bumper
        self.space.on_collision(
            collision_type_a=COLLISION_BALL,
            collision_type_b=COLLISION_BUMPER,
            begin=self._on_bumper_hit
        )
        
        # Ball vs Target
        self.space.on_collision(
            collision_type_a=COLLISION_BALL,
            collision_type_b=COLLISION_TARGET,
            begin=self._on_target_hit
        )
        
        # Ball vs Drain
        self.space.on_collision(
            collision_type_a=COLLISION_BALL,
            collision_type_b=COLLISION_DRAIN,
            begin=self._on_drain
        )
        
        self.space.on_collision(
            collision_type_a=COLLISION_BALL,
            collision_type_b=COLLISION_FLIPPER,
            begin=self._on_flipper_hit
        )
        
        self.space.on_collision(
            collision_type_a=COLLISION_BALL,
            collision_type_b=COLLISION_SPINNER,
            begin=self._on_spinner_hit
        )
        
        self.space.on_collision(
            collision_type_a=COLLISION_BALL,
            collision_type_b=COLLISION_WALL,
            begin=self._on_wall_hit
        )
    
    def _on_spinner_hit(self, arbiter, space, data):
        if self.sound_manager:
            self.sound_manager.play('spinner')
    
    def _on_wall_hit(self, arbiter, space, data):
        if self.sound_manager:
            self.sound_manager.play('wall')
    
    def _on_flipper_hit(self, arbiter, space, data):
        ball_shape = arbiter.shapes[0]
        flipper_shape = arbiter.shapes[1]
        
        if self.sound_manager:
            self.sound_manager.play('flipper')
        
        flipper_vel = flipper_shape.body.angular_velocity
        if abs(flipper_vel) > 5:
            boost = self.difficulty.flipper_impulse * 0.015
            ball_vel = ball_shape.body.velocity
            ball_shape.body.velocity = (ball_vel.x * 1.3, ball_vel.y - boost)
            
            if self.renderer:
                contact = arbiter.contact_point_set.points[0].point_a
                self.renderer.flipper_hit_times[id(flipper_shape)] = pygame.time.get_ticks() / 1000.0
                self.renderer._spawn_particles(contact.x, contact.y, COLOR_NEON_CYAN, count=12)
    
    def _on_bumper_hit(self, arbiter, space, data):
        if self.sound_manager:
            self.sound_manager.play('bumper')
        
        current_time = pygame.time.get_ticks() / 1000.0
        d = self.difficulty
        
        if current_time - self.game_state.last_hit_time < 2.0:
            self.game_state.combo_multiplier = min(self.game_state.combo_multiplier + 1, 5)
        else:
            self.game_state.combo_multiplier = 1
        
        self.game_state.last_hit_time = current_time
        base_score = int(100 * d.score_multiplier)
        self.game_state.score += base_score * self.game_state.combo_multiplier
        
        ball_shape = arbiter.shapes[0]
        bumper_shape = arbiter.shapes[1]
        direction = (ball_shape.body.position - bumper_shape.body.position).normalized()
        ball_shape.body.apply_impulse_at_local_point(direction * d.bumper_impulse, (0, 0))
        
        if self.renderer:
            self.renderer.bumper_hit_times[id(bumper_shape)] = current_time
            self.renderer._spawn_particles(bumper_shape.body.position.x, 
                                          bumper_shape.body.position.y, 
                                          COLOR_NEON_GREEN, 
                                          count=15)
    
    def _on_target_hit(self, arbiter, space, data):
        if self.sound_manager:
            self.sound_manager.play('target')
        
        base_score = int(500 * self.difficulty.score_multiplier)
        self.game_state.score += base_score * self.game_state.combo_multiplier
        
        if self.renderer:
            target_shape = arbiter.shapes[1]
            current_time = pygame.time.get_ticks() / 1000.0
            self.renderer.target_hit_times[id(target_shape)] = current_time
            contact_point = arbiter.contact_point_set.points[0].point_a
            self.renderer._spawn_particles(contact_point.x, 
                                          contact_point.y, 
                                          self.renderer.color_neon_blue, 
                                          count=10)
    
    def _on_drain(self, arbiter, space, data):
        """Handle ball drain."""
        if self.game_state.ball_saver_active:
            ball_shape = arbiter.shapes[0]
            ball_shape.body.position = Vec2d(535, 710)
            ball_shape.body.velocity = Vec2d(0, 0)
        else:
            ball_shape = arbiter.shapes[0]
            ball_shape.body.position = Vec2d(-100, -100)
    
    def create_ball(self, position=None):
        if position is None:
            position = (535, 710)
        
        d = self.difficulty
        moment = pymunk.moment_for_circle(BALL_MASS, 0, BALL_RADIUS)
        body = pymunk.Body(BALL_MASS, moment)
        body.position = position
        shape = pymunk.Circle(body, BALL_RADIUS)
        shape.elasticity = d.ball_elasticity
        shape.friction = d.ball_friction
        shape.collision_type = COLLISION_BALL
        self.space.add(body, shape)
        self.balls.append(shape)
        
        self.game_state.ball_in_play = True
        self.game_state.ball_saver_active = True
        self.game_state.ball_saver_timer = d.ball_saver_duration
        
        return shape
    
    def launch_ball(self, power):
        if self.balls and power > 0:
            ball = self.balls[-1]
            if self.is_ball_in_plunger_lane(ball):
                if self.sound_manager:
                    self.sound_manager.play('launch')
                launch_velocity = -power * 2
                self.plunger_body.velocity = (0, launch_velocity)
                ball.body.velocity = (0, launch_velocity)
    
    def is_ball_in_plunger_lane(self, ball):
        pos = ball.body.position
        return pos.x > 505 and pos.x < 565 and pos.y > 600
    
    def flip_left(self):
        impulse = self.difficulty.flipper_impulse
        self.left_flipper_body.apply_impulse_at_local_point(
            Vec2d.unit() * impulse, (-60, 0)
        )
    
    def flip_right(self):
        impulse = self.difficulty.flipper_impulse
        self.right_flipper_body.apply_impulse_at_local_point(
            Vec2d.unit() * -impulse, (-60, 0)
        )
        self.mini_flipper_body.apply_impulse_at_local_point(
            Vec2d.unit() * -impulse * 0.5, (-30, 0)
        )
    
    def update(self, dt):
        """Update table state."""
        self.right_flipper_body.position = (350, 700)
        self.left_flipper_body.position = (150, 700)
        self.mini_flipper_body.position = (450, 620)
        self.right_flipper_body.velocity = (0, 0)
        self.left_flipper_body.velocity = (0, 0)
        self.mini_flipper_body.velocity = (0, 0)
        
        for index, (spinner_body, _) in enumerate(self.spinners):
            spinner_body.position = self.spinner_positions[index]
            spinner_body.velocity = (0, 0)
        
        if self.plunger_body.position.y < self.plunger_min_y:
            self.plunger_body.position = (535, self.plunger_rest_y)
            self.plunger_body.velocity = (0, 0)
        
        if self.game_state.ball_saver_active:
            self.game_state.ball_saver_timer -= dt
            if self.game_state.ball_saver_timer <= 0:
                self.game_state.ball_saver_active = False
        
        # Remove balls that went off-screen (drained)
        balls_to_remove = []
        for ball in self.balls:
            if ball.body.position.y > 800 or ball.body.position.x < -50:
                balls_to_remove.append(ball)
        
        for ball in balls_to_remove:
            self.space.remove(ball.body, ball)
            self.balls.remove(ball)
            
            if not self.game_state.ball_saver_active:
                self.game_state.balls_remaining -= 1
                self.game_state.ball_in_play = False
                
                if self.game_state.balls_remaining <= 0:
                    self.game_state.game_over = True


# =============================================================================
# RENDERER (Enhanced Neon Cyberpunk - frontend-ui-ux)
# =============================================================================
class Renderer:
    def __init__(self, screen, difficulty: DifficultyPreset):
        self.screen = screen
        self.difficulty = difficulty
        self.font = pygame.font.Font(None, 36)
        self.big_font = pygame.font.Font(None, 72)
        
        self.ball_trails = {}
        self.particles = []
        self.bumper_hit_times = {}
        self.target_hit_times = {}
        self.flipper_hit_times = {}
        self.combo_animation_scale = 1.0
        self.combo_animation_time = 0
        
        self.color_neon_purple = (168, 85, 247)
        self.color_neon_blue = (59, 130, 246)
    
    def set_difficulty(self, difficulty: DifficultyPreset):
        self.difficulty = difficulty
    
    def draw(self, table: PinballTable, game_state: GameState, high_score_board: 'HighScoreBoard' = None):
        self.screen.fill(COLOR_BG)
        
        self._update_animations(table, game_state)
        
        self._draw_cyberpunk_grid()
        self._draw_walls(table)
        self._draw_bumpers(table)
        self._draw_spinners(table)
        self._draw_targets(table)
        self._draw_plunger(table, game_state)
        self._draw_flippers(table)
        self._draw_balls(table)
        self._draw_particles()
        
        if game_state.ball_saver_active:
            self._draw_ball_saver(game_state.ball_saver_timer)
        
        self._draw_ui(game_state)
        
        if game_state.game_over and high_score_board:
            self._draw_game_over(game_state, high_score_board)
    
    def _update_animations(self, table: PinballTable, game_state: GameState):
        """Update animation states."""
        current_time = pygame.time.get_ticks() / 1000.0
        
        if game_state.combo_multiplier > 1:
            time_since_hit = current_time - game_state.last_hit_time
            if time_since_hit < 0.3:
                self.combo_animation_scale = 1.5
            else:
                self.combo_animation_scale = 1.0
        
        for ball in table.balls:
            ball_id = id(ball.body)
            if ball_id not in self.ball_trails:
                self.ball_trails[ball_id] = []
            self.ball_trails[ball_id].append(ball.body.position)
            if len(self.ball_trails[ball_id]) > 10:
                self.ball_trails[ball_id].pop(0)
        
        self.particles = [p for p in self.particles if p['life'] > 0]
        for particle in self.particles:
            particle['life'] -= 1
            particle['x'] += particle['vx']
            particle['y'] += particle['vy']
            particle['vy'] += 0.1
    
    def _draw_cyberpunk_grid(self):
        """Draw subtle background grid for cyberpunk atmosphere."""
        grid_color = (20, 20, 40)
        for x in range(0, SCREEN_WIDTH, 40):
            pygame.draw.line(self.screen, grid_color, (x, 0), (x, SCREEN_HEIGHT), 1)
        for y in range(0, SCREEN_HEIGHT, 40):
            pygame.draw.line(self.screen, grid_color, (0, y), (SCREEN_WIDTH, y), 1)
    
    def _draw_walls(self, table: PinballTable):
        """Draw walls with neon purple glow."""
        for wall in table.walls:
            start = (int(wall.a.x), int(wall.a.y))
            end = (int(wall.b.x), int(wall.b.y))
            width = int(wall.radius)
            
            for i in range(3, 0, -1):
                alpha = 50 - i * 10
                color = (*self.color_neon_purple, alpha)
                glow_surface = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
                pygame.draw.line(glow_surface, color, start, end, width * 2 + i * 4)
                self.screen.blit(glow_surface, (0, 0))
            
            pygame.draw.line(self.screen, COLOR_WALL, start, end, width)
    
    def _draw_bumpers(self, table: PinballTable):
        current_time = pygame.time.get_ticks() / 1000.0
        
        for body, shape in table.bumpers:
            pos = body.position
            radius = shape.radius
            
            hit_time = self.bumper_hit_times.get(id(shape), 0)
            time_since_hit = current_time - hit_time
            
            if time_since_hit < 0.2:
                core_color = (255, 255, 255)
                glow_color = COLOR_NEON_GREEN
            else:
                core_color = COLOR_NEON_GREEN
                glow_color = COLOR_NEON_GREEN
            
            for i in range(5, 0, -1):
                alpha = 30 - i * 5
                glow_surface = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
                pygame.draw.circle(glow_surface, (*glow_color, alpha), (int(pos.x), int(pos.y)), int(radius + i * 6))
                self.screen.blit(glow_surface, (0, 0))
            
            pygame.draw.circle(self.screen, glow_color, (int(pos.x), int(pos.y)), int(radius - 5), 3)
            pygame.draw.circle(self.screen, core_color, (int(pos.x), int(pos.y)), int(radius - 10))
    
    def _draw_spinners(self, table: PinballTable):
        color_spinner = (255, 100, 50)
        
        for body, shape in table.spinners:
            pos = body.position
            angle = body.angle
            half_len = (shape.b.x - shape.a.x) / 2
            
            cos_a, sin_a = math.cos(angle), math.sin(angle)
            start_x = pos.x - cos_a * half_len
            start_y = pos.y - sin_a * half_len
            end_x = pos.x + cos_a * half_len
            end_y = pos.y + sin_a * half_len
            
            glow_surface = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
            pygame.draw.line(glow_surface, (*color_spinner, 60), 
                           (int(start_x), int(start_y)), (int(end_x), int(end_y)), 18)
            self.screen.blit(glow_surface, (0, 0))
            
            pygame.draw.line(self.screen, color_spinner,
                           (int(start_x), int(start_y)), (int(end_x), int(end_y)), 8)
            pygame.draw.circle(self.screen, (255, 255, 255), (int(pos.x), int(pos.y)), 6)
    
    def _draw_targets(self, table: PinballTable):
        """Draw targets with blue glow effect."""
        current_time = pygame.time.get_ticks() / 1000.0
        
        for target in table.targets:
            start = (int(target.a.x), int(target.a.y))
            end = (int(target.b.x), int(target.b.y))
            
            hit_time = self.target_hit_times.get(id(target), 0)
            time_since_hit = current_time - hit_time
            
            if time_since_hit < 0.3:
                core_color = (255, 255, 255)
                glow_alpha = 100
            else:
                core_color = self.color_neon_blue
                glow_alpha = 50
            
            glow_surface = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
            pygame.draw.line(glow_surface, (*self.color_neon_blue, glow_alpha), 
                           start, end, 15)
            self.screen.blit(glow_surface, (0, 0))
            
            pygame.draw.line(self.screen, core_color, start, end, 5)
    
    def _draw_plunger(self, table: PinballTable, game_state: GameState):
        """Draw plunger with yellow glow and power indicator."""
        plunger_x = int(table.plunger_body.position.x)
        plunger_y = int(table.plunger_body.position.y)
        plunger_width = 40
        plunger_height = 10
        
        glow_surface = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        for i in range(3, 0, -1):
            alpha = 40 - i * 12
            pygame.draw.rect(glow_surface, (*COLOR_PLUNGER, alpha),
                           (plunger_x - plunger_width//2 - i*3, plunger_y - plunger_height//2 - i*2,
                            plunger_width + i*6, plunger_height + i*4))
        self.screen.blit(glow_surface, (0, 0))
        
        pygame.draw.rect(self.screen, COLOR_PLUNGER,
                        (plunger_x - plunger_width//2, plunger_y - plunger_height//2,
                         plunger_width, plunger_height))
        
        power = game_state.plunger_power
        max_power = self.difficulty.plunger_max_power
        power_ratio = power / max_power
        bar_height = int(power_ratio * 100)
        
        if bar_height > 0:
            glow_surface = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
            pygame.draw.rect(glow_surface, (*COLOR_PLUNGER, 80),
                           (568, 750 - bar_height, 24, bar_height + 4))
            self.screen.blit(glow_surface, (0, 0))
            
            pygame.draw.rect(self.screen, COLOR_PLUNGER,
                           (570, 750 - bar_height, 20, bar_height))
        
        pygame.draw.rect(self.screen, COLOR_TEXT, (570, 650, 20, 100), 2)
    
    def _draw_flippers(self, table: PinballTable):
        current_time = pygame.time.get_ticks() / 1000.0
        
        flipper_data = [
            (table.right_flipper_body.position, table.right_flipper_body.angle, 
             [(15, -10), (-80, 0), (15, 10)], table.right_flipper_shape),
            (table.left_flipper_body.position, table.left_flipper_body.angle,
             [(-15, -10), (80, 0), (-15, 10)], table.left_flipper_shape),
            (table.mini_flipper_body.position, table.mini_flipper_body.angle,
             [(8, -5), (-40, 0), (8, 5)], table.mini_flipper_shape),
        ]
        
        for pos, angle, poly, shape in flipper_data:
            cos_a, sin_a = math.cos(angle), math.sin(angle)
            rotated_points = []
            for x, y in poly:
                rx = x * cos_a - y * sin_a + pos.x
                ry = x * sin_a + y * cos_a + pos.y
                rotated_points.append((rx, ry))
            
            hit_time = self.flipper_hit_times.get(id(shape), 0)
            time_since_hit = current_time - hit_time
            
            if time_since_hit < 0.15:
                flipper_color = (255, 255, 255)
                glow_color = (150, 255, 255)
                glow_intensity = 50
            else:
                flipper_color = COLOR_FLIPPER
                glow_color = COLOR_FLIPPER
                glow_intensity = 30
            
            glow_surface = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
            for i in range(3, 0, -1):
                alpha = glow_intensity - i * 10
                pygame.draw.polygon(glow_surface, (*glow_color, alpha), rotated_points, 
                                  width=0 if i == 3 else i * 4)
            self.screen.blit(glow_surface, (0, 0))
            
            pygame.draw.polygon(self.screen, flipper_color, rotated_points)
            pygame.draw.polygon(self.screen, (255, 255, 255), rotated_points, 2)
    
    def _draw_balls(self, table: PinballTable):
        """Draw balls with neon pink glow and trail effect."""
        for ball in table.balls:
            pos = ball.body.position
            ball_id = id(ball.body)
            
            trail = self.ball_trails.get(ball_id, [])
            if len(trail) > 1:
                for i in range(len(trail) - 1):
                    alpha = int(255 * (i / len(trail)) * 0.5)
                    trail_surface = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
                    pygame.draw.line(trail_surface, (*COLOR_NEON_PINK, alpha), 
                                   trail[i], trail[i + 1], 4)
                    self.screen.blit(trail_surface, (0, 0))
            
            for i in range(4, 0, -1):
                alpha = 40 - i * 10
                glow_surface = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
                pygame.draw.circle(glow_surface, (*COLOR_NEON_PINK, alpha), 
                                 (int(pos.x), int(pos.y)), BALL_RADIUS + i * 6)
                self.screen.blit(glow_surface, (0, 0))
            
            pygame.draw.circle(self.screen, COLOR_NEON_PINK, (int(pos.x), int(pos.y)), BALL_RADIUS)
            
            highlight_pos = (int(pos.x - 3), int(pos.y - 3))
            pygame.draw.circle(self.screen, (255, 150, 200), highlight_pos, 4)
    
    def _draw_particles(self):
        """Draw particle effects."""
        for particle in self.particles:
            alpha = int(255 * (particle['life'] / particle['max_life']))
            particle_surface = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
            pygame.draw.circle(particle_surface, (*particle['color'], alpha), 
                             (int(particle['x']), int(particle['y'])), particle['size'])
            self.screen.blit(particle_surface, (0, 0))
    
    def _spawn_particles(self, x, y, color, count=10):
        """Spawn particle explosion at position."""
        for _ in range(count):
            angle = random.random() * math.pi * 2
            speed = random.random() * 5 + 2
            self.particles.append({
                'x': x,
                'y': y,
                'vx': math.cos(angle) * speed,
                'vy': math.sin(angle) * speed,
                'life': random.randint(20, 40),
                'max_life': 40,
                'size': random.randint(2, 5),
                'color': color
            })
    
    def _draw_ball_saver(self, time_left):
        """Draw pulsing ball saver shield at drain."""
        pulse = (math.sin(pygame.time.get_ticks() * 0.01) + 1) * 0.5
        alpha = int(50 + pulse * 50)
        
        rect = pygame.Rect(50, 750, 450, 60)
        glow_surface = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        pygame.draw.arc(glow_surface, (*COLOR_NEON_GREEN, alpha), rect, 0, math.pi, 20)
        self.screen.blit(glow_surface, (0, 0))
        
        saver_text = self.font.render(f"BALL SAVER: {time_left:.1f}s", True, COLOR_NEON_GREEN)
        text_rect = saver_text.get_rect(center=(SCREEN_WIDTH // 2, 770))
        glow_surface2 = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        pygame.draw.rect(glow_surface2, (*COLOR_NEON_GREEN, alpha // 2), 
                        (text_rect.x - 10, text_rect.y - 5, text_rect.width + 20, text_rect.height + 10))
        self.screen.blit(glow_surface2, (0, 0))
        self.screen.blit(saver_text, text_rect)
    
    def _draw_ui(self, game_state: GameState):
        score_text = self.font.render(f"SCORE: {game_state.score:,}", True, COLOR_NEON_CYAN)
        balls_text = self.font.render(f"BALLS: {game_state.balls_remaining}", True, COLOR_NEON_PINK)
        
        score_glow = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        score_rect = score_text.get_rect(topleft=(20, 10))
        pygame.draw.rect(score_glow, (*COLOR_NEON_CYAN, 30), 
                        (score_rect.x - 10, score_rect.y - 5, score_rect.width + 20, score_rect.height + 10))
        self.screen.blit(score_glow, (0, 0))
        self.screen.blit(score_text, score_rect)
        
        balls_glow = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        balls_rect = balls_text.get_rect(topright=(SCREEN_WIDTH - 20, 10))
        pygame.draw.rect(balls_glow, (*COLOR_NEON_PINK, 30), 
                        (balls_rect.x - 10, balls_rect.y - 5, balls_rect.width + 20, balls_rect.height + 10))
        self.screen.blit(balls_glow, (0, 0))
        self.screen.blit(balls_text, balls_rect)
        
        difficulty_colors = {"EASY": COLOR_NEON_GREEN, "NORMAL": COLOR_PLUNGER, "HARD": COLOR_NEON_PINK}
        diff_color = difficulty_colors.get(self.difficulty.name, COLOR_TEXT)
        diff_text = self.font.render(f"[{self.difficulty.name}]", True, diff_color)
        diff_rect = diff_text.get_rect(midtop=(SCREEN_WIDTH // 2, 10))
        
        if not game_state.ball_in_play and not game_state.game_over:
            hint_text = self.font.render("D: Change Difficulty", True, (100, 100, 100))
            hint_rect = hint_text.get_rect(midtop=(SCREEN_WIDTH // 2, 35))
            self.screen.blit(hint_text, hint_rect)
        
        diff_glow = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        pygame.draw.rect(diff_glow, (*diff_color, 30), 
                        (diff_rect.x - 10, diff_rect.y - 5, diff_rect.width + 20, diff_rect.height + 10))
        self.screen.blit(diff_glow, (0, 0))
        self.screen.blit(diff_text, diff_rect)
        
        if game_state.combo_multiplier > 1:
            scale = self.combo_animation_scale
            combo_text = self.big_font.render(f"x{game_state.combo_multiplier} COMBO!", True, COLOR_NEON_GREEN)
            
            scaled_size = (int(combo_text.get_width() * scale), int(combo_text.get_height() * scale))
            combo_scaled = pygame.transform.scale(combo_text, scaled_size)
            
            combo_rect = combo_scaled.get_rect(center=(SCREEN_WIDTH // 2, 70))
            combo_glow = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
            pygame.draw.rect(combo_glow, (*COLOR_NEON_GREEN, 40), 
                            (combo_rect.x - 15, combo_rect.y - 10, combo_rect.width + 30, combo_rect.height + 20))
            self.screen.blit(combo_glow, (0, 0))
            self.screen.blit(combo_scaled, combo_rect)
    
    def _draw_plunger_indicator(self, power):
        bar_height = int((power / self.difficulty.plunger_max_power) * 100)
        
        glow_surface = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        pygame.draw.rect(glow_surface, (*COLOR_PLUNGER, 60), 
                        (558, 750 - bar_height, 24, bar_height))
        self.screen.blit(glow_surface, (0, 0))
        
        pygame.draw.rect(self.screen, COLOR_PLUNGER, 
                        (560, 750 - bar_height, 20, bar_height))
        pygame.draw.rect(self.screen, COLOR_TEXT,
                        (560, 650, 20, 100), 2)
    
    def _draw_ball_saver_indicator(self, time_left):
        """Draw ball saver status with neon glow."""
        text = self.font.render(f"BALL SAVER: {time_left:.1f}s", True, COLOR_NEON_GREEN)
        text_rect = text.get_rect(center=(SCREEN_WIDTH // 2, 50))
        
        glow_surface = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        pygame.draw.rect(glow_surface, (*COLOR_NEON_GREEN, 30), 
                        (text_rect.x - 10, text_rect.y - 5, text_rect.width + 20, text_rect.height + 10))
        self.screen.blit(glow_surface, (0, 0))
        self.screen.blit(text, text_rect)
    
    def _draw_game_over(self, game_state: GameState, high_score_board: 'HighScoreBoard'):
        """Draw game over screen with neon styling."""
        overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 220))
        self.screen.blit(overlay, (0, 0))
        
        final_score = game_state.score
        
        game_over_text = self.big_font.render("GAME OVER", True, COLOR_NEON_PINK)
        go_rect = game_over_text.get_rect(center=(SCREEN_WIDTH // 2, 80))
        go_glow = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        pygame.draw.rect(go_glow, (*COLOR_NEON_PINK, 40),
                        (go_rect.x - 20, go_rect.y - 15, go_rect.width + 40, go_rect.height + 30))
        self.screen.blit(go_glow, (0, 0))
        self.screen.blit(game_over_text, go_rect)
        
        score_text = self.font.render(f"YOUR SCORE: {final_score:,}", True, COLOR_NEON_CYAN)
        score_rect = score_text.get_rect(center=(SCREEN_WIDTH // 2, 140))
        self.screen.blit(score_text, score_rect)
        
        if game_state.asking_for_name:
            prompt_text = self.font.render("NEW HIGH SCORE! Enter name:", True, COLOR_NEON_GREEN)
            prompt_rect = prompt_text.get_rect(center=(SCREEN_WIDTH // 2, 200))
            self.screen.blit(prompt_text, prompt_rect)
            
            cursor_blink = (pygame.time.get_ticks() // 500) % 2 == 0
            name_display = game_state.player_name + ("|" if cursor_blink else "")
            name_text = self.big_font.render(name_display, True, COLOR_NEON_CYAN)
            name_rect = name_text.get_rect(center=(SCREEN_WIDTH // 2, 260))
            
            name_glow = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
            pygame.draw.rect(name_glow, (*COLOR_NEON_CYAN, 50),
                           (SCREEN_WIDTH // 2 - 150, 230, 300, 60))
            self.screen.blit(name_glow, (0, 0))
            pygame.draw.rect(self.screen, COLOR_NEON_CYAN,
                           (SCREEN_WIDTH // 2 - 150, 230, 300, 60), 2)
            self.screen.blit(name_text, name_rect)
            
            hint_text = self.font.render("Press ENTER to submit", True, COLOR_TEXT)
            hint_rect = hint_text.get_rect(center=(SCREEN_WIDTH // 2, 310))
            self.screen.blit(hint_text, hint_rect)
            start_y = 360
        else:
            if high_score_board.is_high_score(final_score) and not game_state.name_submitted:
                prompt_text = self.font.render("Record your score? (Y/N)", True, COLOR_NEON_GREEN)
                prompt_rect = prompt_text.get_rect(center=(SCREEN_WIDTH // 2, 200))
                self.screen.blit(prompt_text, prompt_rect)
            start_y = 250
        
        board_title = self.font.render("=== HIGH SCORES ===", True, COLOR_PLUNGER)
        board_rect = board_title.get_rect(center=(SCREEN_WIDTH // 2, start_y))
        self.screen.blit(board_title, board_rect)
        
        for i, entry in enumerate(high_score_board.scores[:5]):
            rank_color = COLOR_NEON_PINK if i == 0 else (COLOR_NEON_CYAN if i < 3 else COLOR_TEXT)
            entry_text = self.font.render(f"{i+1}. {entry['name'][:10]:10s} {entry['score']:,}", True, rank_color)
            entry_rect = entry_text.get_rect(center=(SCREEN_WIDTH // 2, start_y + 40 + i * 35))
            self.screen.blit(entry_text, entry_rect)
        
        if len(high_score_board.scores) == 0:
            no_scores = self.font.render("No records yet!", True, COLOR_TEXT)
            no_rect = no_scores.get_rect(center=(SCREEN_WIDTH // 2, start_y + 60))
            self.screen.blit(no_scores, no_rect)
        
        restart_text = self.font.render("Press R to restart", True, COLOR_TEXT)
        restart_rect = restart_text.get_rect(center=(SCREEN_WIDTH // 2, 750))
        self.screen.blit(restart_text, restart_rect)


# =============================================================================
# MAIN GAME
# =============================================================================
class PinballGame:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("NEON PINBALL")
        
        self.screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
        self.clock = pygame.time.Clock()
        
        self.difficulty_manager = DifficultyManager()
        self.sound_manager = SoundManager()
        self._init_game()
        
        self.high_score_board = HighScoreBoard()
        self.running = True
    
    def _init_game(self):
        difficulty = self.difficulty_manager.current
        self.game_state = GameState(difficulty)
        self.space = pymunk.Space()
        self.space.gravity = difficulty.gravity
        self.renderer = Renderer(self.screen, difficulty)
        self.table = PinballTable(self.space, self.game_state, difficulty, self.renderer, self.sound_manager)
    
    def _rebuild_table(self):
        for ball in self.table.balls[:]:
            self.space.remove(ball.body, ball)
        self.table.balls.clear()
        
        difficulty = self.difficulty_manager.current
        self.game_state = GameState(difficulty)
        self.space = pymunk.Space()
        self.space.gravity = difficulty.gravity
        self.renderer.set_difficulty(difficulty)
        self.table = PinballTable(self.space, self.game_state, difficulty, self.renderer, self.sound_manager)
    
    def reset(self):
        for ball in self.table.balls[:]:
            self.space.remove(ball.body, ball)
        self.table.balls.clear()
        
        self.game_state.reset(self.difficulty_manager.current)
    
    def cycle_difficulty(self):
        new_difficulty = self.difficulty_manager.cycle_difficulty()
        self._rebuild_table()
        return new_difficulty
    
    def _is_any_ball_in_plunger(self):
        for ball in self.table.balls:
            if self.table.is_ball_in_plunger_lane(ball):
                return True
        return False
    
    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
            
            elif event.type == pygame.KEYDOWN:
                if self.game_state.asking_for_name:
                    if event.key == pygame.K_RETURN:
                        if self.game_state.player_name:
                            self.high_score_board.add_score(
                                self.game_state.player_name,
                                self.game_state.score
                            )
                            self.game_state.asking_for_name = False
                            self.game_state.name_submitted = True
                    elif event.key == pygame.K_BACKSPACE:
                        self.game_state.player_name = self.game_state.player_name[:-1]
                    elif event.key == pygame.K_ESCAPE:
                        self.game_state.asking_for_name = False
                    elif len(self.game_state.player_name) < 10:
                        if event.unicode.isalnum() or event.unicode in " _-":
                            self.game_state.player_name += event.unicode.upper()
                    continue
                
                if self.game_state.game_over and not self.game_state.name_submitted:
                    if event.key == pygame.K_y:
                        if self.high_score_board.is_high_score(self.game_state.score):
                            self.game_state.asking_for_name = True
                        continue
                    elif event.key == pygame.K_n:
                        self.game_state.name_submitted = True
                        continue
                
                if event.key == pygame.K_ESCAPE:
                    self.running = False
                
                elif event.key == pygame.K_r:
                    self.reset()
                
                elif event.key == pygame.K_d:
                    if not self.game_state.ball_in_play:
                        self.cycle_difficulty()
                
                elif event.key in (pygame.K_LEFT, pygame.K_z):
                    self.table.flip_left()
                
                elif event.key in (pygame.K_RIGHT, pygame.K_x):
                    self.table.flip_right()
                
                elif event.key == pygame.K_SPACE:
                    if not self.game_state.game_over:
                        if not self.game_state.ball_in_play:
                            self.table.create_ball()
                        elif self._is_any_ball_in_plunger():
                            self.game_state.plunger_charging = True
                    if not self.game_state.ball_in_play or self._is_any_ball_in_plunger():
                        self.game_state.plunger_charging = True
            
            elif event.type == pygame.KEYUP:
                if event.key == pygame.K_SPACE:
                    if self.game_state.plunger_charging:
                        self.table.launch_ball(self.game_state.plunger_power)
                        self.game_state.plunger_power = 0
                        self.game_state.plunger_charging = False
                        self.game_state.plunger_direction = 1
        
        if not self.game_state.asking_for_name:
            keys = pygame.key.get_pressed()
            if keys[pygame.K_LEFT] or keys[pygame.K_z]:
                self.table.flip_left()
            if keys[pygame.K_RIGHT] or keys[pygame.K_x]:
                self.table.flip_right()
    
    def update(self, dt):
        d = self.difficulty_manager.current
        if self.game_state.plunger_charging:
            self.game_state.plunger_power += d.plunger_charge_rate * dt * self.game_state.plunger_direction
            if self.game_state.plunger_power >= d.plunger_max_power:
                self.game_state.plunger_power = d.plunger_max_power
                self.game_state.plunger_direction = -1
            elif self.game_state.plunger_power <= 0:
                self.game_state.plunger_power = 0
                self.game_state.plunger_direction = 1
        
        self.table.update(dt)
        
        sub_dt = dt / PHYSICS_SUBSTEPS
        for _ in range(PHYSICS_SUBSTEPS):
            self.space.step(sub_dt)
    
    def draw(self):
        self.renderer.draw(self.table, self.game_state, self.high_score_board)
        pygame.display.flip()
    
    async def run(self):
        while self.running:
            dt = 1.0 / FPS
            
            self.handle_events()
            
            if not self.game_state.game_over:
                self.update(dt)
            
            self.draw()
            self.clock.tick(FPS)
            await asyncio.sleep(0)
        
        pygame.quit()


# =============================================================================
# ENTRY POINT
# =============================================================================
if __name__ == "__main__":
    game = PinballGame()
    asyncio.run(game.run())
