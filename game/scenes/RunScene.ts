import Phaser from 'phaser';
import { sfx } from '../audio';
import { Course, CourseDefender } from '../course';
import { formatMilestone, nextMilestoneAfter } from '../milestones';
import {
  DEFENDER_KINDS,
  GAME_HEIGHT,
  GAME_WIDTH,
  LANE_SWITCH_MS,
  LANE_X,
  PLAYER_Y,
} from '../config';
import {
  DEFENDER_FRAMES,
  LINEMAN_FRAMES,
  RUNNER_FRAMES,
  RUNNER_PALETTE,
  STAR_FRAME,
  STAR_PALETTE,
  bakeSprite,
  defenderPalette,
} from '../sprites';

export type RunSceneData = {
  seed: number;
  /** Called once, after the tackle animation, with the exact final yardage. */
  onRunOver: (yards: number) => void;
};

const ARCADE_FONT = '"Press Start 2P", monospace';
/** Distance a sprite travels per animation frame flip, in px. */
const STRIDE = 26;

/**
 * Renders a Course. All gameplay rules live in Course; this scene only draws
 * the simulation and forwards taps.
 */
export class RunScene extends Phaser.Scene {
  private course!: Course;
  private onRunOver!: (yards: number) => void;

  private field!: Phaser.GameObjects.TileSprite;
  private crowdLeft!: Phaser.GameObjects.TileSprite;
  private crowdRight!: Phaser.GameObjects.TileSprite;
  private player!: Phaser.GameObjects.Image;
  private sprites = new Map<number, Phaser.GameObjects.Image>();

  private running = false;
  private countdownValue = 3;
  private nextMilestone = 100;

  constructor() {
    super('RunScene');
  }

  init(data: RunSceneData) {
    this.course = new Course(data.seed ?? 1);
    this.onRunOver = data.onRunOver ?? (() => {});
    this.sprites = new Map();
    this.running = false;
    this.countdownValue = 3;
    this.nextMilestone = nextMilestoneAfter(0);
  }

  create() {
    this.buildTextures();

    this.field = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'turf')
      .setOrigin(0, 0);

    // Sideline crowd, scrolling at a slower rate for a cheap parallax.
    this.crowdLeft = this.add
      .tileSprite(0, 0, 26, GAME_HEIGHT, 'crowd')
      .setOrigin(0, 0)
      .setDepth(1);
    this.crowdRight = this.add
      .tileSprite(GAME_WIDTH - 26, 0, 26, GAME_HEIGHT, 'crowd')
      .setOrigin(0, 0)
      .setDepth(1);

    this.player = this.add
      .image(LANE_X[this.course.lane], PLAYER_Y, 'runner-0')
      .setDepth(10);

    // Exactly one input: a tap anywhere toggles the lane.
    this.input.on('pointerdown', this.handleTap, this);

    this.runCountdown();
  }

  /** Bake every sprite at boot. The game ships no image files. */
  private buildTextures() {
    RUNNER_FRAMES.forEach((frame, i) =>
      bakeSprite(this, `runner-${i}`, frame, RUNNER_PALETTE, 5),
    );

    for (const kind of DEFENDER_KINDS) {
      const frames = kind.build === 'lineman' ? LINEMAN_FRAMES : DEFENDER_FRAMES;
      frames.forEach((frame, i) =>
        bakeSprite(
          this,
          `def-${kind.key}-${i}`,
          frame,
          defenderPalette(kind.color, kind.helmet),
          kind.scale,
        ),
      );
    }

    bakeSprite(this, 'star', STAR_FRAME, STAR_PALETTE, 3);

    this.buildTurf();
    this.buildCrowd();
  }

  private buildTurf() {
    if (this.textures.exists('turf')) return;
    const h = 186;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // Mown bands. Deliberately not yard-aligned, so they cannot be counted to
    // estimate the hidden score.
    g.fillStyle(0x1e7a3c, 1);
    g.fillRect(0, 0, GAME_WIDTH, h);
    g.fillStyle(0x1a6c35, 1);
    g.fillRect(0, 0, GAME_WIDTH, 93);

    // Chunky pixel noise, so the turf reads as 8-bit rather than flat colour.
    g.fillStyle(0x000000, 0.05);
    for (let y = 0; y < h; y += 8) {
      for (let x = (y / 8) % 2 === 0 ? 0 : 8; x < GAME_WIDTH; x += 16) {
        g.fillRect(x, y, 8, 4);
      }
    }

    // Lane divider: dashed hash marks.
    g.fillStyle(0xffffff, 0.14);
    for (let y = 0; y < h; y += 31) g.fillRect(GAME_WIDTH / 2 - 3, y, 6, 16);

    // Sidelines.
    g.fillStyle(0xf5f1e6, 0.55);
    g.fillRect(30, 0, 5, h);
    g.fillRect(GAME_WIDTH - 35, 0, 5, h);

    g.generateTexture('turf', GAME_WIDTH, h);
    g.destroy();
  }

  private buildCrowd() {
    if (this.textures.exists('crowd')) return;
    const h = 96;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x0d2418, 1);
    g.fillRect(0, 0, 26, h);

    // Pixel-block spectators. The offsets are irregular so the sideline does
    // not read as a repeating strip while it scrolls.
    const colors = [0x1b3a8f, 0xf2c027, 0xe0453a, 0xf5f1e6, 0x2fbf6f, 0x3f8fe0];
    const jitter = [0, 3, 1, 4, 2, 5, 1, 3];
    let i = 0;
    for (let y = 0; y < h; y += 9) {
      for (let x = 1; x < 24; x += 7) {
        const j = jitter[i % jitter.length];
        g.fillStyle(colors[i % colors.length], 0.55);
        g.fillRect(x + (j % 2), y + j, 5, 5);
        i += 1;
      }
    }
    g.generateTexture('crowd', 26, h);
    g.destroy();
  }

  private runCountdown() {
    const label = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '3', {
        fontFamily: ARCADE_FONT,
        fontSize: '64px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(30);

    const pop = () => {
      label.setScale(1.6);
      this.tweens.add({ targets: label, scale: 1, duration: 220, ease: 'Back.easeOut' });
    };

    sfx.countdownTick();
    pop();

    this.time.addEvent({
      delay: 600,
      repeat: 3,
      callback: () => {
        this.countdownValue -= 1;
        if (this.countdownValue > 0) {
          label.setText(String(this.countdownValue));
          sfx.countdownTick();
          pop();
        } else if (this.countdownValue === 0) {
          label.setText('HIKE').setFontSize('44px').setColor('#f2c027');
          sfx.hike();
          pop();
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
    sfx.laneSwitch();
    this.tweens.add({
      targets: this.player,
      x: LANE_X[this.course.lane],
      duration: LANE_SWITCH_MS,
      ease: 'Quad.easeOut',
    });
    // A slight lean into the cut.
    this.player.setAngle(this.course.lane === 0 ? -10 : 10);
    this.tweens.add({ targets: this.player, angle: 0, duration: 180, delay: 60 });
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;

    if (this.running) {
      const before = this.course.distancePx;
      this.course.step(dt);
      const moved = this.course.distancePx - before;
      this.field.tilePositionY -= moved;
      this.crowdLeft.tilePositionY -= moved * 0.55;
      this.crowdRight.tilePositionY -= moved * 0.55;

      this.player.setTexture(
        `runner-${Math.floor(this.course.distancePx / STRIDE) % 2}`,
      );
      this.checkMilestone();
    }

    this.syncDefenders(delta);

    if (this.running && this.course.tackled) this.tackle();
  }

  /** The only in-run feedback. Shows a threshold, never the exact yardage. */
  private checkMilestone() {
    if (this.course.yards < this.nextMilestone) return;
    const reached = this.nextMilestone;
    this.nextMilestone = nextMilestoneAfter(reached);
    this.showMilestone(reached);
  }

  private showMilestone(yards: number) {
    sfx.milestone();

    // Sits below the runner so it can never hide an incoming defender.
    const y = PLAYER_Y + 110;
    const text = this.add
      .text(0, 0, formatMilestone(yards), {
        fontFamily: ARCADE_FONT,
        fontSize: '16px',
        color: '#f2c027',
        stroke: '#14203a',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    const offset = text.width / 2 + 20;
    const banner = this.add
      .container(GAME_WIDTH / 2, y, [
        text,
        this.add.image(-offset, 0, 'star'),
        this.add.image(offset, 0, 'star'),
      ])
      .setDepth(25)
      .setScale(0.4);

    // Pop in, hold, drift up and out. Gameplay never pauses for this.
    this.tweens.chain({
      targets: banner,
      tweens: [
        { scale: 1, duration: 180, ease: 'Back.easeOut' },
        { scale: 1, duration: 700 },
        { alpha: 0, y: y - 40, duration: 380, ease: 'Quad.easeIn' },
      ],
      onComplete: () => banner.destroy(),
    });
  }

  private syncDefenders(delta: number) {
    const live = new Set<number>();

    for (const d of this.course.defenders) {
      live.add(d.id);
      let sprite = this.sprites.get(d.id);
      if (!sprite) {
        sprite = this.add
          .image(LANE_X[d.lane], d.y, `def-${d.kind.key}-0`)
          .setDepth(5);
        this.sprites.set(d.id, sprite);
      }
      sprite.y = d.y;
      sprite.setTexture(`def-${d.kind.key}-${Math.floor(d.y / STRIDE) % 2}`);
      this.animateDefender(sprite, d, delta);
    }

    for (const [id, sprite] of this.sprites) {
      // Keep the tackler on screen for the game-over animation.
      if (live.has(id) || this.course.tackled) continue;
      sprite.destroy();
      this.sprites.delete(id);
    }
  }

  /** Purely visual flair. Never moves a defender between lanes. */
  private animateDefender(
    sprite: Phaser.GameObjects.Image,
    d: CourseDefender,
    delta: number,
  ) {
    switch (d.kind.motion) {
      case 'spin':
        sprite.rotation += delta * 0.005;
        break;
      case 'dive':
        // Leaves his feet on the approach.
        sprite.rotation = Phaser.Math.Clamp((d.y - 200) * 0.004, 0, 1.1);
        break;
      case 'hurdle':
        sprite.scaleY = 1 + Math.sin(d.y * 0.05) * 0.14;
        break;
      case 'lunge':
        sprite.scaleX = 1 + Math.sin(d.y * 0.06) * 0.16;
        sprite.x = LANE_X[d.lane] + Math.sin(d.y * 0.03) * 10;
        break;
      default:
        // Straight runner: a small side-to-side bob.
        sprite.x = LANE_X[d.lane] + Math.sin(d.y * 0.04) * 4;
        break;
    }
  }

  private tackle() {
    this.running = false;
    const finalYards = this.course.yards;
    this.input.off('pointerdown', this.handleTap, this);

    sfx.collision();
    sfx.whistle();

    this.cameras.main.shake(340, 0.024);
    this.cameras.main.flash(140, 255, 255, 255);

    const awayFromTackler = this.course.lane === 0 ? 1 : -1;

    // Runner goes down hard.
    this.tweens.add({
      targets: this.player,
      angle: -75 * awayFromTackler,
      y: PLAYER_Y + 30,
      duration: 260,
      ease: 'Quad.easeOut',
    });

    // The ball pops loose.
    const ball = this.add
      .ellipse(this.player.x, PLAYER_Y, 16, 11, 0x8a4a1f)
      .setStrokeStyle(2, 0xf5f1e6)
      .setDepth(20);
    this.tweens.add({
      targets: ball,
      x: this.player.x + 120 * awayFromTackler,
      y: PLAYER_Y - 170,
      rotation: 7,
      duration: 720,
      ease: 'Quad.easeOut',
    });

    // Impact starburst.
    const burst = this.add
      .text(this.player.x, PLAYER_Y - 30, 'POW!', {
        fontFamily: ARCADE_FONT,
        fontSize: '26px',
        color: '#f2c027',
        stroke: '#e0453a',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(26)
      .setScale(0.3);
    this.tweens.add({
      targets: burst,
      scale: 1.2,
      alpha: 0,
      duration: 700,
      ease: 'Quad.easeOut',
    });

    // Brief pause before the score is revealed.
    this.time.delayedCall(1000, () => this.onRunOver(finalYards));
  }
}
