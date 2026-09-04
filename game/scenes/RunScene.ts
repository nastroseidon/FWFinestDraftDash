import Phaser from 'phaser';
import { Course, CourseDefender } from '../course';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  LANE_SWITCH_MS,
  LANE_X,
  PLAYER_Y,
} from '../config';

export type RunSceneData = {
  seed: number;
  /** Called once, after the tackle animation, with the exact final yardage. */
  onRunOver: (yards: number) => void;
};

/**
 * Renders a Course. All gameplay rules live in Course; this scene only draws
 * the simulation and forwards taps into it.
 */
export class RunScene extends Phaser.Scene {
  private course!: Course;
  private onRunOver!: (yards: number) => void;

  private field!: Phaser.GameObjects.TileSprite;
  private player!: Phaser.GameObjects.Container;
  private sprites = new Map<number, Phaser.GameObjects.Container>();

  private running = false;
  private countdownValue = 3;

  constructor() {
    super('RunScene');
  }

  init(data: RunSceneData) {
    this.course = new Course(data.seed ?? 1);
    this.onRunOver = data.onRunOver ?? (() => {});
    this.sprites = new Map();
    this.running = false;
    this.countdownValue = 3;
  }

  create() {
    this.buildTextures();

    this.field = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'turf')
      .setOrigin(0, 0);

    this.player = this.buildPlayer();

    // Exactly one input: a tap anywhere toggles the lane.
    this.input.on('pointerdown', this.handleTap, this);

    this.runCountdown();
  }

  /** Generate every sprite at runtime so Phase 1 needs no art assets. */
  private buildTextures() {
    if (this.textures.exists('turf')) return;

    // Turf bands are deliberately not yard-aligned, so players cannot count
    // lines to estimate their hidden score.
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x1e7a3c, 1);
    g.fillRect(0, 0, GAME_WIDTH, 186);
    g.fillStyle(0x1a6c35, 1);
    g.fillRect(0, 0, GAME_WIDTH, 93);
    g.fillStyle(0xffffff, 0.12);
    for (let y = 0; y < 186; y += 31) {
      g.fillRect(GAME_WIDTH / 2 - 2, y, 4, 16);
    }
    g.fillStyle(0xffffff, 0.18);
    g.fillRect(10, 0, 5, 186);
    g.fillRect(GAME_WIDTH - 15, 0, 5, 186);
    g.generateTexture('turf', GAME_WIDTH, 186);
    g.destroy();
  }

  private buildPlayer(): Phaser.GameObjects.Container {
    const body = this.add.rectangle(0, 0, 40, 52, 0xf5f1e6).setStrokeStyle(3, 0x14203a);
    const jersey = this.add.rectangle(0, 2, 40, 26, 0x1b3a8f);
    const helmet = this.add.rectangle(0, -32, 30, 24, 0xf2c027).setStrokeStyle(3, 0x14203a);
    const ball = this.add.ellipse(18, 6, 18, 12, 0x8a4a1f).setStrokeStyle(2, 0xffffff);
    return this.add
      .container(LANE_X[this.course.lane], PLAYER_Y, [body, jersey, helmet, ball])
      .setDepth(10);
  }

  private runCountdown() {
    const label = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '3', {
        fontFamily: 'monospace',
        fontSize: '96px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(30);

    this.time.addEvent({
      delay: 600,
      repeat: 3,
      callback: () => {
        this.countdownValue -= 1;
        if (this.countdownValue > 0) {
          label.setText(String(this.countdownValue));
        } else if (this.countdownValue === 0) {
          label.setText('HIKE');
        } else {
          label.destroy();
          this.running = true;
        }
      },
    });
  }

  private handleTap() {
    if (!this.running) return;
    // Lane ownership flips immediately; the tween is cosmetic. This keeps the
    // control instant and makes collisions match what the player tapped.
    this.course.toggleLane();
    this.tweens.add({
      targets: this.player,
      x: LANE_X[this.course.lane],
      duration: LANE_SWITCH_MS,
      ease: 'Quad.easeOut',
    });
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;

    if (this.running) {
      const before = this.course.distancePx;
      this.course.step(dt);
      this.field.tilePositionY -= this.course.distancePx - before;
    }

    this.syncDefenders(delta);

    if (this.running && this.course.tackled) this.tackle();
  }

  private syncDefenders(delta: number) {
    const live = new Set<number>();

    for (const d of this.course.defenders) {
      live.add(d.id);
      let sprite = this.sprites.get(d.id);
      if (!sprite) {
        sprite = this.buildDefender(d);
        this.sprites.set(d.id, sprite);
      }
      sprite.y = d.y;
      this.animateDefender(sprite, d, delta);
    }

    for (const [id, sprite] of this.sprites) {
      // Keep the tackler on screen for the game-over animation.
      if (live.has(id) || this.course.tackled) continue;
      sprite.destroy();
      this.sprites.delete(id);
    }
  }

  private buildDefender(d: CourseDefender): Phaser.GameObjects.Container {
    const body = this.add
      .rectangle(0, 0, d.kind.width, d.kind.height, d.kind.color)
      .setStrokeStyle(3, 0x14203a);
    const helmet = this.add
      .rectangle(0, -d.kind.height * 0.62, d.kind.width * 0.68, 22, 0x14203a)
      .setStrokeStyle(2, 0xffffff);
    return this.add.container(LANE_X[d.lane], d.y, [body, helmet]).setDepth(5);
  }

  /** Purely visual flair. Never moves a defender between lanes. */
  private animateDefender(
    sprite: Phaser.GameObjects.Container,
    d: CourseDefender,
    delta: number,
  ) {
    switch (d.kind.motion) {
      case 'spin':
        sprite.rotation += delta * 0.006;
        break;
      case 'dive':
        sprite.rotation = Math.min(sprite.rotation + delta * 0.002, 0.8);
        break;
      case 'hurdle':
        sprite.scaleY = 1 + Math.sin(d.y * 0.05) * 0.12;
        break;
      case 'lunge':
        sprite.scaleX = 1 + Math.sin(d.y * 0.06) * 0.15;
        break;
      default:
        break;
    }
  }

  private tackle() {
    this.running = false;
    const finalYards = this.course.yards;
    this.input.off('pointerdown', this.handleTap, this);

    this.cameras.main.shake(320, 0.02);
    this.cameras.main.flash(120, 255, 255, 255);

    const awayFromTackler = this.course.lane === 0 ? 1 : -1;

    // Runner goes down.
    this.tweens.add({
      targets: this.player,
      rotation: -1.2 * awayFromTackler,
      y: PLAYER_Y + 26,
      duration: 260,
      ease: 'Quad.easeOut',
    });

    // The ball pops loose.
    const ball = this.add
      .ellipse(this.player.x, PLAYER_Y, 18, 12, 0x8a4a1f)
      .setStrokeStyle(2, 0xffffff)
      .setDepth(20);
    this.tweens.add({
      targets: ball,
      x: this.player.x + 110 * awayFromTackler,
      y: PLAYER_Y - 160,
      rotation: 6,
      duration: 700,
      ease: 'Quad.easeOut',
    });

    // Brief pause before the score is revealed.
    this.time.delayedCall(900, () => this.onRunOver(finalYards));
  }
}
