import { assetPath } from "./asset";

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

const DICE_THROW_SOUNDS = [
  assetPath("/sound/dice-throw-1.ogg"),
  assetPath("/sound/dice-throw-2.ogg"),
  assetPath("/sound/dice-throw-3.ogg")
];
const SELECT_SOUND = assetPath("/sound/dice-select.wav");
const ATTACK_SOUND = assetPath("/sound/damage.wav");
const CLICK_SOUND = assetPath("/sound/heavy-click.wav");
const PURCHASE_SOUND = assetPath("/sound/purchase.wav");
const COIN_SOUND = assetPath("/sound/handleCoins.wav");
const HOT_DICE_SOUND = assetPath("/sound/hot-dice.wav");
const BOSS_DEAD_SOUND = assetPath("/sound/boss-dead.wav");
const MARKET_OPEN_SOUND = assetPath("/sound/open-market.ogg");
const MARKET_CLOSE_SOUND = assetPath("/sound/close-market.ogg");
const SOUND_SOURCES = [
  ...DICE_THROW_SOUNDS,
  SELECT_SOUND,
  ATTACK_SOUND,
  CLICK_SOUND,
  PURCHASE_SOUND,
  COIN_SOUND,
  HOT_DICE_SOUND,
  BOSS_DEAD_SOUND,
  MARKET_OPEN_SOUND,
  MARKET_CLOSE_SOUND
];

let audioContext: AudioContext | null = null;
let initializationPromise: Promise<void> | null = null;
let lastSelectSoundAt = 0;
const soundBuffers = new Map<string, AudioBuffer>();

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }

  audioContext ??= new AudioContextCtor();
  return audioContext;
}

async function loadSoundBuffer(context: AudioContext, src: string): Promise<void> {
  try {
    const response = await fetch(src);
    if (!response.ok) {
      return;
    }
    soundBuffers.set(src, await context.decodeAudioData(await response.arrayBuffer()));
  } catch {
    // A failed sound must not block the rest of the UI audio system.
  }
}

export function initializeUiAudio(): Promise<void> {
  if (initializationPromise) {
    return initializationPromise;
  }

  const context = getAudioContext();
  if (!context) {
    return Promise.resolve();
  }

  initializationPromise = Promise.all(SOUND_SOURCES.map((src) => loadSoundBuffer(context, src))).then(() => undefined);
  return initializationPromise;
}

export function unlockUiAudio(): void {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    void context.resume().catch(() => undefined);
  }
  void initializeUiAudio();
}

function playFallbackSample(src: string, volume: number, playbackRate: number): void {
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.volume = volume;
  audio.playbackRate = playbackRate;
  void audio.play().catch(() => undefined);
}

function playSample(src: string, volume: number, playbackRate = 1): void {
  const context = getAudioContext();
  const buffer = soundBuffers.get(src);
  if (!context || !buffer || context.state !== "running") {
    playFallbackSample(src, volume, playbackRate);
    void initializeUiAudio();
    return;
  }

  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(context.destination);
  source.start();
}

function playTone(frequency: number, duration: number, type: OscillatorType, gainValue: number): void {
  const context = getAudioContext();
  if (!context || context.state !== "running") {
    return;
  }

  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.value = gainValue;
  osc.connect(gain);
  gain.connect(context.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  osc.stop(context.currentTime + duration);
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
