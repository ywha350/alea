type UiSoundKind =
  | "roll"
  | "select"
  | "score"
  | "farkle"
  | "buy"
  | "attack"
  | "click"
  | "coin"
  | "hot-dice"
  | "boss-dead"
  | "market-open"
  | "market-close"
  | "game-over";

interface UiSoundOptions {
  step?: number;
}

const DICE_THROW_SOUNDS = ["/sound/dice-throw-1.ogg", "/sound/dice-throw-2.ogg", "/sound/dice-throw-3.ogg"];
const SELECT_SOUND = "/sound/dice-select.wav";
const ATTACK_SOUND = "/sound/damage.wav";
const CLICK_SOUND = "/sound/heavy-click.wav";
const PURCHASE_SOUND = "/sound/purchase.wav";
const COIN_SOUND = "/sound/handleCoins.wav";
const HOT_DICE_SOUND = "/sound/hot-dice.wav";
const BOSS_DEAD_SOUND = "/sound/boss-dead.wav";
const MARKET_OPEN_SOUND = "/sound/open-market.ogg";
const MARKET_CLOSE_SOUND = "/sound/close-market.ogg";
let lastSelectSoundAt = 0;

function playSample(src: string, volume: number, playbackRate = 1): void {
  const audio = new Audio(src);
  audio.volume = volume;
  audio.playbackRate = playbackRate;
  void audio.play().catch(() => undefined);
}

function playTone(frequency: number, duration: number, type: OscillatorType, gainValue: number): void {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return;
  }

  const ctx = new AudioContextCtor();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.value = gainValue;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.stop(ctx.currentTime + duration);
  void ctx.close().catch(() => undefined);
}

export function playUiSound(kind: UiSoundKind, options: UiSoundOptions = {}): void {
  if (typeof window === "undefined") {
    return;
  }

  if (kind === "roll") {
    const src = DICE_THROW_SOUNDS[Math.floor(Math.random() * DICE_THROW_SOUNDS.length)];
    playSample(src, 0.62, 0.96 + Math.random() * 0.08);
  } else if (kind === "select") {
    const now = performance.now();
    if (now - lastSelectSoundAt < 40) {
      return;
    }

    lastSelectSoundAt = now;
    const step = Math.max(0, options.step ?? 0);
    playSample(SELECT_SOUND, 0.34, Math.min(1.28, 0.9 + step * 0.08));
  } else if (kind === "attack") {
    playSample(ATTACK_SOUND, 0.58, 0.96 + Math.random() * 0.06);
  } else if (kind === "click") {
    playSample(CLICK_SOUND, 0.44, 0.94 + Math.random() * 0.04);
  } else if (kind === "buy") {
    playSample(PURCHASE_SOUND, 0.62, 0.92 + Math.random() * 0.03);
  } else if (kind === "coin") {
    playSample(COIN_SOUND, 0.62, 0.96 + Math.random() * 0.08);
  } else if (kind === "hot-dice") {
    playSample(HOT_DICE_SOUND, 0.66, 0.98 + Math.random() * 0.04);
  } else if (kind === "boss-dead") {
    playSample(BOSS_DEAD_SOUND, 0.68, 0.98);
  } else if (kind === "market-open") {
    playSample(MARKET_OPEN_SOUND, 0.62, 0.98);
  } else if (kind === "market-close") {
    playSample(MARKET_CLOSE_SOUND, 0.58, 0.98);
  } else if (kind === "score") {
    playSample(SELECT_SOUND, 0.32, 1.22);
  } else if (kind === "farkle") {
    playTone(95, 0.24, "sawtooth", 0.04);
  } else if (kind === "game-over") {
    playTone(70, 0.42, "sawtooth", 0.045);
  } else {
    playSample(SELECT_SOUND, 0.34, 0.78);
  }
}
