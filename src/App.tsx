import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import "./index.css";
import { BOSSES, JOKERS, SPECIAL_DICE, TURN_LIMIT, UPGRADES } from "./game/constants";
import { playUiSound } from "./game/audio";
import { cloneState, makeId } from "./game/platform";
import {
  bankScore,
  buyDieUpgradeForFace,
  buyShopItem,
  buySpecialDieForSlot,
  calculateSelectedScore,
  confirmSelection,
  createInitialState,
  finishFarkleTurn,
  getHandUpgradeBonusAmount,
  getScoringIndices,
  handleFarkle,
  hasAnyScoringDice,
  nextRound,
  rollDice,
  toggleDieSelection
} from "./game/logic";
import type { BossId, JokerId, SaveData, UpgradeId } from "./types";

function formatScore(value: number): string {
  return value.toLocaleString();
}

const RECORDS_KEY = "dungeon-alea-records";
const ROLL_ANIMATION_MS = 300;
const MY_BAD_REROLL_DELAY_MS = 300;
const ROLL_TICK_MS = 50;
const MARKET_EXIT_MS = 520;
const HEALTH_CLEAR_SEQUENCE_MS = 620;
const BOSS_DEATH_SEQUENCE_MS = 620;
const REWARD_LABEL_MS = 1060;
const REWARD_STEP_MS = 460;

interface HomeRecords {
  bestScore: number;
  lastScore: number;
}

interface DamageDeltaPopup {
  id: string;
  value: number;
  dieIndex: number;
}

interface DiePressPulse {
  id: string;
  dieIndex: number;
}

interface JokerEffect {
  key: string;
  jokerId: JokerId;
}

interface RewardPopup {
  key: string;
  label: string;
  amount: number;
}

function rewardAmountText(amount: number): string {
  return `${amount >= 0 ? "+" : "-"}$${Math.abs(amount)}`;
}

function loadHomeRecords(): HomeRecords {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) {
      return { bestScore: 0, lastScore: 0 };
    }

    const parsed = JSON.parse(raw) as Partial<HomeRecords>;
    return {
      bestScore: Number.isFinite(parsed.bestScore) ? parsed.bestScore ?? 0 : 0,
      lastScore: Number.isFinite(parsed.lastScore) ? parsed.lastScore ?? 0 : 0
    };
  } catch {
    return { bestScore: 0, lastScore: 0 };
  }
}

function saveHomeRecords(records: HomeRecords): void {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function formatDelta(value: number): string {
  return `${value > 0 ? "+" : ""}${formatScore(value)}`;
}

function randomDisplayDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function getDieImagePath(refId: string): string {
  if (refId === "basic") {
    return "/dice-basic.png";
  }
  return SPECIAL_DICE.find((die) => die.id === refId)?.image ?? "/dice-basic.png";
}

function dieSpriteStyle(value: number, imagePath = "/dice-basic.png"): CSSProperties {
  const normalized = Math.max(1, Math.min(6, value)) - 1;
  const column = normalized % 3;
  const row = Math.floor(normalized / 3);

  return {
    backgroundImage: `url("${imagePath}")`,
    "--die-sprite-x": `${column * 50}%`,
    "--die-sprite-y": `${row * 100}%`
  } as CSSProperties;
}

function getCounts(values: number[]): number[] {
  const counts = Array(7).fill(0);
  values.forEach((value) => {
    counts[value] += 1;
  });
  return counts;
}

function isStraight(values: number[]): boolean {
  return [...values].sort((a, b) => a - b).join(",") === "1,2,3,4,5,6";
}

function isThreePairs(values: number[]): boolean {
  const counts = getCounts(values).slice(1).filter(Boolean).sort((a, b) => a - b);
  return counts.length === 3 && counts.every((count) => count === 2);
}

function getSelectedValues(state: SaveData): number[] {
  return state.dice.values.filter((_, index) => state.dice.selected[index]);
}

function hasSelectedTriplet(state: SaveData): boolean {
  const breakdown = calculateSelectedScore(state, { includeMomentum: false });
  if (!breakdown.valid || breakdown.score <= 0) {
    return false;
  }

  return getCounts(getSelectedValues(state)).some((count) => count === 3);
}

function isDiscountSmallStraight(state: SaveData): boolean {
  const values = [...getSelectedValues(state)].sort((a, b) => a - b);
  const key = values.join(",");
  return values.length === 5 && (key === "1,2,3,4,5" || key === "2,3,4,5,6");
}

const BOSS_TITLES: Record<string, string> = {
  normal: "Bone Croupier",
  "dry-table": "Dustbone Dealer",
  "tax-collector": "Vampire Tithe",
  "broken-cup": "Cupbone Brute",
  "bitter-five": "Bitter Acolyte",
  "heavy-bones": "Iron Prior",
  "poor-house": "Vault Hierophant"
};

const JOKER_IMAGE_PATHS: Partial<Record<string, string>> = {
  triplet: "/jokers/triplets.png",
  greedy: "/jokers/greedy.png",
  "big-risk": "/jokers/big%20risk.png",
  "band-aid": "/jokers/band-aid.png",
  insurance: "/jokers/insurance.png",
  "my-bad": "/jokers/my%20bad.png",
  "just-one-more": "/jokers/just%20one%20more.png",
  sparta: "/jokers/sparta.png",
  fever: "/jokers/fever.png",
  deal: "/jokers/deal.png",
  discount: "/jokers/discount.png",
  "snake-eyes": "/jokers/snake%20eyes.png",
  "clean-sweep": "/jokers/clean%20sweep.png",
  momentum: "/jokers/momentum.png",
  "tax-refund": "/jokers/tax%20refund.png",
  "pocket-change": "/jokers/pocket%20change.png",
  "double-or-nothing": "/jokers/double%20or%20nothing.png",
  overtime: "/jokers/overtime.png"
};

const DUMMY_DIE_UPGRADE_IMAGE_PATH = "/dice/die1.png";

function getJokerImagePath(refId: string): string | null {
  return JOKER_IMAGE_PATHS[refId] ?? null;
}

function getHandUpgradeSymbol(refId: string): string {
  if (refId === "one-upgrade") {
    return "1";
  }
  if (refId === "five-upgrade") {
    return "5";
  }
  if (refId === "triple-upgrade") {
    return "3x";
  }
  if (refId === "straight-upgrade") {
    return "st";
  }
  if (refId === "three-pairs-upgrade") {
    return "2p";
  }
  return "?";
}

const MONSTER_IDLE_BASE =
  "/2D Pixel Dungeon Asset Pack v2.0/2D Pixel Dungeon Asset Pack/Character_animation/monsters_idle";
const PRIEST_IDLE_BASE =
  "/2D Pixel Dungeon Asset Pack v2.0/2D Pixel Dungeon Asset Pack/Character_animation/priests_idle";

const BOSS_MONSTER_IDLE: Record<string, string[]> = {
  normal: Array.from({ length: 4 }, (_, index) => `${MONSTER_IDLE_BASE}/skeleton1/v2/skeleton_v2_${index + 1}.png`),
  "dry-table": Array.from({ length: 4 }, (_, index) => `${MONSTER_IDLE_BASE}/skeleton1/v2/skeleton_v2_${index + 1}.png`),
  "tax-collector": Array.from({ length: 4 }, (_, index) => `${MONSTER_IDLE_BASE}/vampire/v2/vampire_v2_${index + 1}.png`),
  "broken-cup": Array.from({ length: 4 }, (_, index) => `${MONSTER_IDLE_BASE}/skeleton2/v2/skeleton2_v2_${index + 1}.png`),
  "bitter-five": Array.from({ length: 4 }, (_, index) => `${PRIEST_IDLE_BASE}/priest1/v1/priest1_v1_${index + 1}.png`),
  "heavy-bones": Array.from({ length: 4 }, (_, index) => `${PRIEST_IDLE_BASE}/priest2/v1/priest2_v1_${index + 1}.png`),
  "poor-house": Array.from({ length: 4 }, (_, index) => `${PRIEST_IDLE_BASE}/priest3/v1/priest3_v1_${index + 1}.png`)
};

function App() {
  const [state, setState] = useState<SaveData>(createInitialState);
  const [records, setRecords] = useState<HomeRecords>(loadHomeRecords);
  const [screen, setScreen] = useState<"home" | "game">("home");
  const [farkleFlash, setFarkleFlash] = useState(false);
  const [farkleResolving, setFarkleResolving] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const [isMyBadRerollPending, setIsMyBadRerollPending] = useState(false);
  const [rollingDiceValues, setRollingDiceValues] = useState<number[]>([]);
  const [rollingDiceMask, setRollingDiceMask] = useState<boolean[]>([]);
  const [diePressPulses, setDiePressPulses] = useState<DiePressPulse[]>([]);
  const [activeJokerEffects, setActiveJokerEffects] = useState<JokerEffect[]>([]);
  const [pendingDieUpgradeItemId, setPendingDieUpgradeItemId] = useState<string | null>(null);
  const [pendingJokerSaleIndex, setPendingJokerSaleIndex] = useState<number | null>(null);
  const [displayMoney, setDisplayMoney] = useState(state.run.money);
  const [displayTurns, setDisplayTurns] = useState(state.run.turnsLeft);
  const [rewardPopups, setRewardPopups] = useState<RewardPopup[]>([]);
  const [healthHit, setHealthHit] = useState(false);
  const [bossDyingShown, setBossDyingShown] = useState(false);
  const [bossDeadShown, setBossDeadShown] = useState(false);
  const [hotDiceOverlayId, setHotDiceOverlayId] = useState<string | null>(null);
  const [lastTurnOverlayId, setLastTurnOverlayId] = useState<string | null>(null);
  const [marketLeaving, setMarketLeaving] = useState(false);
  const [marketEntering, setMarketEntering] = useState(false);
  const [marketGridEntering, setMarketGridEntering] = useState(false);
  const [rewardAnimationCompleteLogId, setRewardAnimationCompleteLogId] = useState<string | null>(null);
  const [monsterIdleFrame, setMonsterIdleFrame] = useState(0);
  const recordedGameOverRef = useRef(false);
  const lastFarkleLogIdRef = useRef<string | null>(null);
  const damageDangerFarkleLogIdRef = useRef<string | null>(null);
  const rollTimeoutRef = useRef<number | null>(null);
  const marketTimeoutRef = useRef<number | null>(null);
  const clearSequenceTimeoutsRef = useRef<number[]>([]);
  const hotDiceOverlayTimeoutRef = useRef<number | null>(null);
  const lastTurnOverlayTimeoutRef = useRef<number | null>(null);
  const jokerEffectTimeoutsRef = useRef<number[]>([]);
  const rewardAnimationLogIdRef = useRef<string | null>(null);
  const clearSequenceLogIdRef = useRef<string | null>(null);
  const rewardTimeoutsRef = useRef<number[]>([]);
  const previousRoundScoreRef = useRef(state.run.roundScore);
  const lastHotDiceLogIdRef = useRef<string | null>(null);
  const lastTurnOverlayKeyRef = useRef<string | null>(null);
  const previousMarketVisibleRef = useRef(false);
  const marketGridEnteredForCurrentOpenRef = useRef(false);

  const breakdown = calculateSelectedScore(state, { includeMomentum: false });
  const scoringIndices =
    state.dice.rollCount > 0
      ? getScoringIndices(state.dice.values, state.dice.locked, state.run.currentBoss, state.jokers.includes("discount"))
      : new Set<number>();
  const bossId: BossId | "normal" = state.run.currentBoss ?? "normal";
  const bossData = state.run.currentBoss
    ? BOSSES[state.run.currentBoss]
    : { name: "Dungeon Table", description: "No boss curse. Build score and strike clean." };
  const bossMonsterFrames = BOSS_MONSTER_IDLE[bossId];
  const bossMonsterImage = bossMonsterFrames[monsterIdleFrame % bossMonsterFrames.length];
  const enemyHpRemaining = Math.max(0, state.run.targetScore - state.run.roundScore);
  const enemyHpRatio =
    state.run.targetScore <= 0 ? 0 : Math.max(0, 1 - state.run.roundScore / state.run.targetScore);
  const enemyHpPercent = Math.round(enemyHpRatio * 100);
  const itemSlots = Array.from({ length: 6 }, (_, index) => state.jokers[index] ?? null);
  const hasSelectedScore = breakdown.valid && breakdown.score > 0;
  const rawPreviewTurnScore = state.run.turnScore + (hasSelectedScore ? breakdown.score : 0);
  const previewTurnScore =
    state.jokers.includes("big-risk") && state.dice.rollCount >= 4
      ? rawPreviewTurnScore * 2
      : rawPreviewTurnScore;
  const [displayDamage, setDisplayDamage] = useState(previewTurnScore);
  const [damageDeltaPopups, setDamageDeltaPopups] = useState<DamageDeltaPopup[]>([]);
  const [damageDanger, setDamageDanger] = useState(false);
  const displayDamageRef = useRef(previewTurnScore);
  const previousDamageTargetRef = useRef(previewTurnScore);
  const suppressNextDamageDeltaRef = useRef(false);
  const damagePopupDieIndexRef = useRef<number | null>(null);
  const allowNextHotDiceOverlayRef = useRef(false);
  const attackCanBank = previewTurnScore > 0 && !state.shop.open && !state.run.gameOver;
  const enemyDescription = bossData.description;
  const shopJokers = state.shop.items.filter((item) => item.kind === "joker");
  const shopDiceItems = state.shop.items.filter((item) => item.kind === "die-upgrade" || item.kind === "special-die");
  const shopHandUpgrades = state.shop.items.filter((item) => item.kind === "hand-upgrade");
  const marketOpen = state.shop.open;
  const rewardBreakdown = state.run.lastRewardBreakdown;
  const rewardAnimating = rewardPopups.length > 0;
  const clearLog = state.log.find((entry) => entry.text.startsWith(`Round ${state.run.round} cleared.`));
  const rewardSequenceReady = !state.run.cleared || rewardBreakdown.length === 0 || bossDeadShown;
  const rewardPayoutPending =
    state.run.cleared &&
    rewardBreakdown.length > 0 &&
    !!clearLog &&
    clearLog.id !== rewardAnimationCompleteLogId;
  const rewardPending =
    marketOpen && rewardPayoutPending && (!rewardSequenceReady || rewardAnimating || displayMoney !== state.run.money);
  const marketVisible = marketOpen && !rewardPending;
  const choosingDieUpgrade = marketVisible && pendingDieUpgradeItemId !== null;
  const pendingJokerSaleId =
    pendingJokerSaleIndex !== null ? state.jokers[pendingJokerSaleIndex] ?? null : null;
  const pendingJokerSaleDefinition = pendingJokerSaleId
    ? JOKERS.find((joker) => joker.id === pendingJokerSaleId) ?? null
    : null;
  const pendingJokerSalePrice = pendingJokerSaleDefinition ? Math.floor(pendingJokerSaleDefinition.price / 2) : 0;

  const rollDisabled =
    isRolling ||
    isMyBadRerollPending ||
    farkleResolving ||
    marketOpen ||
    state.run.gameOver ||
    (state.dice.awaitingAction && !hasSelectedScore) ||
    (state.run.currentBoss === "broken-cup" && state.dice.rollCount >= 2);
  const attackDisabled = isRolling || isMyBadRerollPending || farkleResolving || !attackCanBank;
  const displayedDiceValues = isRolling && rollingDiceValues.length === state.dice.values.length
    ? rollingDiceValues
    : state.dice.values;
  const displayedTurnCount = marketOpen ? TURN_LIMIT : Math.max(0, displayTurns - 1);
  const gameOverBestScore = Math.max(records.bestScore, state.run.roundScore);

  const apply = (next: SaveData, sound?: Parameters<typeof playUiSound>[0]) => {
    setState(next);
    if (sound) {
      playUiSound(sound);
    }
  };

  const triggerJokerEffect = (jokerId: JokerId) => {
    if (!state.jokers.includes(jokerId)) {
      return;
    }

    const effectKey = makeId();
    setActiveJokerEffects((current) => [...current, { key: effectKey, jokerId }]);
    const timeoutId = window.setTimeout(() => {
      setActiveJokerEffects((current) => current.filter((effect) => effect.key !== effectKey));
      jokerEffectTimeoutsRef.current = jokerEffectTimeoutsRef.current.filter((id) => id !== timeoutId);
    }, 500);
    jokerEffectTimeoutsRef.current.push(timeoutId);
  };

  const triggerConfirmJokerEffects = (
    before: SaveData,
    after: SaveData,
    options: { triggerJustOneMore?: boolean; triggerMomentum?: boolean } = {}
  ) => {
    const selectedValues = getSelectedValues(before);
    const activeBeforeSelection = before.dice.values.filter((_, index) => !before.dice.locked[index]).length;
    const hotDiceTriggered = !before.dice.locked.every(Boolean) && after.dice.locked.every(Boolean) && after.dice.hotDice;

    if (selectedValues.filter((value) => value === 1).length >= 2) {
      triggerJokerEffect("snake-eyes");
    }
    if (options.triggerJustOneMore !== false && before.dice.rollCount >= 3) {
      triggerJokerEffect("just-one-more");
    }
    if (options.triggerMomentum !== false) {
      triggerJokerEffect("momentum");
    }
    if (before.flags.feverCharges > 0 && !hotDiceTriggered) {
      triggerJokerEffect("fever");
    }
    if (hotDiceTriggered && before.jokers.includes("fever")) {
      triggerJokerEffect("fever");
    }
    if (hotDiceTriggered && before.jokers.includes("clean-sweep")) {
      triggerJokerEffect("clean-sweep");
    }
    if (activeBeforeSelection === 1) {
      triggerJokerEffect("sparta");
    }
    if (before.jokers.includes("discount") && isDiscountSmallStraight(before)) {
      triggerJokerEffect("discount");
    }
  };

  const triggerFarkleJokerEffects = (before: SaveData, after: SaveData) => {
    if (!before.flags.bandAidUsedRound && after.flags.bandAidUsedRound) {
      triggerJokerEffect("band-aid");
    }
    if (after.run.roundScore > before.run.roundScore && before.run.turnScore > 0) {
      triggerJokerEffect("insurance");
    }
  };

  const stopMarketAppearAnimation = () => {
    setMarketEntering(false);
    setMarketGridEntering(false);
  };

  useEffect(() => {
    if (marketVisible && !previousMarketVisibleRef.current) {
      setMarketEntering(true);
      playUiSound("market-open");
      const timeout = window.setTimeout(() => {
        setMarketEntering(false);
      }, 700);
      previousMarketVisibleRef.current = marketVisible;
      return () => {
        window.clearTimeout(timeout);
      };
    }
    previousMarketVisibleRef.current = marketVisible;
  }, [marketVisible]);

  useEffect(() => {
    const marketGridVisible = marketVisible && !choosingDieUpgrade;
    if (!marketVisible) {
      marketGridEnteredForCurrentOpenRef.current = false;
      setMarketGridEntering(false);
    } else if (marketGridVisible && !marketGridEnteredForCurrentOpenRef.current) {
      marketGridEnteredForCurrentOpenRef.current = true;
      setMarketGridEntering(true);
      const timeout = window.setTimeout(() => {
        setMarketGridEntering(false);
      }, 760);
      return () => {
        window.clearTimeout(timeout);
      };
    }
  }, [choosingDieUpgrade, marketVisible]);

  useEffect(() => {
    return () => {
      rewardTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      rewardTimeoutsRef.current = [];
      if (marketTimeoutRef.current !== null) {
        window.clearTimeout(marketTimeoutRef.current);
      }
      clearSequenceTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      clearSequenceTimeoutsRef.current = [];
      if (hotDiceOverlayTimeoutRef.current !== null) {
        window.clearTimeout(hotDiceOverlayTimeoutRef.current);
      }
      if (lastTurnOverlayTimeoutRef.current !== null) {
        window.clearTimeout(lastTurnOverlayTimeoutRef.current);
      }
      jokerEffectTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      jokerEffectTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setMonsterIdleFrame((frame) => (frame + 1) % 4);
    }, 180);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!state.shop.open || !state.run.cleared || rewardBreakdown.length === 0) {
      setDisplayTurns(state.run.turnsLeft);
    }
  }, [rewardBreakdown.length, state.run.cleared, state.run.turnsLeft, state.shop.open]);

  useEffect(() => {
    const latestHotDiceLog = state.log.find((entry) => entry.text.startsWith("Hot Dice."));

    if (!latestHotDiceLog || latestHotDiceLog.id === lastHotDiceLogIdRef.current) {
      return;
    }

    lastHotDiceLogIdRef.current = latestHotDiceLog.id;
    if (!allowNextHotDiceOverlayRef.current) {
      return;
    }

    allowNextHotDiceOverlayRef.current = false;
    setHotDiceOverlayId(latestHotDiceLog.id);
    playUiSound("hot-dice");

    if (hotDiceOverlayTimeoutRef.current !== null) {
      window.clearTimeout(hotDiceOverlayTimeoutRef.current);
    }
    hotDiceOverlayTimeoutRef.current = window.setTimeout(() => {
      setHotDiceOverlayId(null);
      hotDiceOverlayTimeoutRef.current = null;
    }, 1500);
  }, [state.log]);

  useEffect(() => {
    const lastTurnKey = `${state.run.round}-${state.run.turnNumber}`;
    const shouldShowLastTurn =
      state.run.turnsLeft === 1 &&
      !state.run.cleared &&
      !state.run.gameOver &&
      !state.shop.open &&
      lastTurnOverlayKeyRef.current !== lastTurnKey;

    if (!shouldShowLastTurn) {
      return;
    }

    lastTurnOverlayKeyRef.current = lastTurnKey;
    setLastTurnOverlayId(lastTurnKey);
    triggerJokerEffect("overtime");

    if (lastTurnOverlayTimeoutRef.current !== null) {
      window.clearTimeout(lastTurnOverlayTimeoutRef.current);
    }
    lastTurnOverlayTimeoutRef.current = window.setTimeout(() => {
      setLastTurnOverlayId(null);
      lastTurnOverlayTimeoutRef.current = null;
    }, 1500);
  }, [state.run.cleared, state.run.gameOver, state.run.round, state.run.turnNumber, state.run.turnsLeft, state.shop.open]);

  useEffect(() => {
    const previousRoundScore = previousRoundScoreRef.current;
    previousRoundScoreRef.current = state.run.roundScore;

    if (state.run.roundScore <= previousRoundScore) {
      return;
    }

    if (state.log[0]?.text.startsWith("Insurance banked")) {
      playUiSound("attack");
    }

    setHealthHit(false);
    const animationFrame = requestAnimationFrame(() => {
      setHealthHit(true);
    });
    const timeout = window.setTimeout(() => {
      setHealthHit(false);
    }, 420);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [state.run.roundScore]);

  useEffect(() => {
    const shouldRunClearSequence =
      state.shop.open && state.run.cleared && rewardBreakdown.length > 0 && clearLog;

    if (!shouldRunClearSequence) {
      clearSequenceLogIdRef.current = null;
      clearSequenceTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      clearSequenceTimeoutsRef.current = [];
      setBossDyingShown(false);
      setBossDeadShown(false);
      return;
    }

    if (clearLog.id === clearSequenceLogIdRef.current) {
      return;
    }

    clearSequenceLogIdRef.current = clearLog.id;
    clearSequenceTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    clearSequenceTimeoutsRef.current = [];
    setBossDyingShown(false);
    setBossDeadShown(false);

    clearSequenceTimeoutsRef.current.push(
      window.setTimeout(() => {
        setBossDyingShown(true);
        playUiSound("boss-dead");
      }, HEALTH_CLEAR_SEQUENCE_MS),
      window.setTimeout(() => {
        setBossDeadShown(true);
      }, HEALTH_CLEAR_SEQUENCE_MS + BOSS_DEATH_SEQUENCE_MS)
    );
  }, [clearLog, rewardBreakdown.length, state.run.cleared, state.shop.open]);

  useEffect(() => {
    const shouldAnimateReward =
      state.shop.open &&
      state.run.cleared &&
      rewardBreakdown.length > 0 &&
      rewardSequenceReady &&
      clearLog &&
      clearLog.id !== rewardAnimationLogIdRef.current;

    rewardTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    rewardTimeoutsRef.current = [];

    if (!shouldAnimateReward) {
      if (rewardPopups.length === 0 && rewardSequenceReady) {
        setDisplayMoney(state.run.money);
      }
      return;
    }

    rewardAnimationLogIdRef.current = clearLog.id;
    const totalReward = rewardBreakdown.reduce((sum, item) => sum + item.amount, 0);
    let cursor = state.run.money - totalReward;

    setDisplayMoney(cursor);
    setDisplayTurns(state.run.turnsLeft);
    setRewardPopups([]);

    const animateMoney = (from: number, to: number, durationMs: number) => {
      const startedAt = performance.now();
      let animationFrame = 0;
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / durationMs);
        const eased = 1 - (1 - progress) ** 3;
        setDisplayMoney(Math.round(from + (to - from) * eased));
        if (progress < 1) {
          animationFrame = requestAnimationFrame(tick);
        }
      };

      animationFrame = requestAnimationFrame(tick);
      rewardTimeoutsRef.current.push(
        window.setTimeout(() => {
          cancelAnimationFrame(animationFrame);
          setDisplayMoney(to);
        }, durationMs + 40)
      );
    };

    const animateTurns = (from: number, to: number, durationMs: number) => {
      const startedAt = performance.now();
      let animationFrame = 0;
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / durationMs);
        const eased = 1 - (1 - progress) ** 3;
        setDisplayTurns(Math.round(from + (to - from) * eased));
        if (progress < 1) {
          animationFrame = requestAnimationFrame(tick);
        }
      };

      animationFrame = requestAnimationFrame(tick);
      rewardTimeoutsRef.current.push(
        window.setTimeout(() => {
          cancelAnimationFrame(animationFrame);
          setDisplayTurns(to);
        }, durationMs + 40)
      );
    };

    rewardBreakdown.forEach((item, index) => {
      const from = cursor;
      const to = cursor + item.amount;
      cursor = to;

      rewardTimeoutsRef.current.push(
        window.setTimeout(() => {
          const popupKey = `${clearLog.id}-${item.id}-${index}`;
          setRewardPopups((current) => [...current, { key: popupKey, label: item.label, amount: item.amount }]);
          rewardTimeoutsRef.current.push(
            window.setTimeout(() => {
              setRewardPopups((current) => current.filter((popup) => popup.key !== popupKey));
            }, REWARD_LABEL_MS)
          );
          animateMoney(from, to, 460);
          if (item.id === "turns") {
            animateTurns(state.run.turnsLeft, Math.max(0, state.run.turnsLeft - item.amount), 460);
          }
          if (item.amount > 0) {
            playUiSound("coin");
          }
        }, index * REWARD_STEP_MS)
      );
    });

    rewardTimeoutsRef.current.push(
      window.setTimeout(() => {
        setRewardPopups([]);
        setDisplayMoney(state.run.money);
        setDisplayTurns(state.run.turnsLeft);
        setRewardAnimationCompleteLogId(clearLog.id);
      }, rewardBreakdown.length * REWARD_STEP_MS + 520)
    );
  }, [clearLog, rewardBreakdown, rewardSequenceReady, state.run.cleared, state.run.money, state.run.turnsLeft, state.shop.open]);

  useEffect(() => {
    if (!state.run.gameOver) {
      recordedGameOverRef.current = false;
      return;
    }

    if (recordedGameOverRef.current) {
      return;
    }

    recordedGameOverRef.current = true;
    playUiSound("game-over");
    setRecords((current) => {
      const next = {
        bestScore: Math.max(current.bestScore, state.run.roundScore),
        lastScore: state.run.roundScore
      };
      saveHomeRecords(next);
      return next;
    });
  }, [state.run.gameOver, state.run.roundScore]);

  useEffect(() => {
    const previousTarget = previousDamageTargetRef.current;
    const delta = previewTurnScore - previousTarget;
    previousDamageTargetRef.current = previewTurnScore;

    if (delta > 0 && !suppressNextDamageDeltaRef.current && damagePopupDieIndexRef.current !== null) {
      const popupId = makeId();
      const dieIndex = damagePopupDieIndexRef.current;
      setDamageDeltaPopups((current) => [...current, { id: popupId, value: delta, dieIndex }]);
      window.setTimeout(() => {
        setDamageDeltaPopups((current) => current.filter((popup) => popup.id !== popupId));
      }, 900);
    } else if (
      delta < 0 &&
      state.log[0]?.text.startsWith("Farkle.") &&
      state.log[0].id !== damageDangerFarkleLogIdRef.current
    ) {
      damageDangerFarkleLogIdRef.current = state.log[0].id;
      setDamageDanger(true);
      window.setTimeout(() => {
        setDamageDanger(false);
      }, 1000);
    }
    suppressNextDamageDeltaRef.current = false;
    damagePopupDieIndexRef.current = null;

    const from = displayDamageRef.current;
    const to = previewTurnScore;
    const durationMs = Math.min(700, Math.max(220, Math.abs(to - from) * 8));
    const startedAt = performance.now();

    let animationFrame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      const nextValue = Math.round(from + (to - from) * eased);

      displayDamageRef.current = nextValue;
      setDisplayDamage(nextValue);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(tick);
      }
    };

    animationFrame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [previewTurnScore, state.log]);

  useEffect(() => {
    if (!isRolling) {
      return;
    }

    const interval = window.setInterval(() => {
      setRollingDiceValues((current) =>
        state.dice.values.map((value, index) => (rollingDiceMask[index] ? randomDisplayDie() : current[index] ?? value))
      );
    }, ROLL_TICK_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRolling, rollingDiceMask, state.dice.values]);

  useEffect(() => {
    return () => {
      if (rollTimeoutRef.current !== null) {
        window.clearTimeout(rollTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const latestFarkleLog = state.log.find((entry) => entry.text.startsWith("Farkle."));
    if (!latestFarkleLog || latestFarkleLog.id === lastFarkleLogIdRef.current) {
      return;
    }

    lastFarkleLogIdRef.current = latestFarkleLog.id;
    setFarkleResolving(true);
    setFarkleFlash(false);
    playUiSound("farkle");

    const animationFrame = requestAnimationFrame(() => {
      setFarkleFlash(true);
    });
    const rollAnimationFrame = requestAnimationFrame(() => {
      setState((current) => {
        const rollMask = current.dice.values.map(() => true);
        const next = finishFarkleTurn(current);

        setRollingDiceMask(rollMask);
        setRollingDiceValues(current.dice.values.map(() => randomDisplayDie()));
        setIsRolling(true);
        playUiSound("roll");
        rollTimeoutRef.current = window.setTimeout(() => {
          setFarkleFlash(false);
          setFarkleResolving(false);
          finishRollAfterAnimation(next, rollMask);
        }, ROLL_ANIMATION_MS);

        return current;
      });
    });
    const timeout = window.setTimeout(() => {
      setFarkleFlash(false);
      setFarkleResolving(false);
    }, 1000);

    return () => {
      cancelAnimationFrame(animationFrame);
      cancelAnimationFrame(rollAnimationFrame);
      window.clearTimeout(timeout);
    };
  }, [state.log]);

  const onDieClick = (index: number) => {
    if (isRolling || isMyBadRerollPending || farkleResolving || state.run.gameOver) {
      return;
    }

    if (choosingDieUpgrade && pendingDieUpgradeItemId) {
      stopMarketAppearAnimation();
      const item = state.shop.items.find((candidate) => candidate.id === pendingDieUpgradeItemId);
      const next =
        item?.kind === "special-die"
          ? buySpecialDieForSlot(state, pendingDieUpgradeItemId, index)
          : buyDieUpgradeForFace(state, pendingDieUpgradeItemId, state.dice.values[index]);
      apply(next, "buy");
      setPendingDieUpgradeItemId(null);
      return;
    }

    if (state.dice.selected[index]) {
      suppressNextDamageDeltaRef.current = true;
    } else if (scoringIndices.has(index)) {
      const activeValues = state.dice.values.filter((_, diceIndex) => !state.dice.locked[diceIndex]);
      const counts = getCounts(activeValues);
      const clickedValue = state.dice.values[index];
      const unlockedIndices = state.dice.values
        .map((_, diceIndex) => diceIndex)
        .filter((diceIndex) => !state.dice.locked[diceIndex]);

      let pulseIndices: number[] = [];
      if (
        clickedValue !== 1 &&
        clickedValue !== 5 &&
        (isStraight(activeValues) ||
          isThreePairs(activeValues) ||
          (state.jokers.includes("discount") &&
            ([1, 2, 3, 4, 5].every((value) => activeValues.includes(value)) ||
              [2, 3, 4, 5, 6].every((value) => activeValues.includes(value)))))
      ) {
        pulseIndices = unlockedIndices;
      } else if (
        (clickedValue !== 1 && clickedValue !== 5 && counts[clickedValue] >= 3) ||
        (state.run.currentBoss === "dry-table" && clickedValue === 1 && counts[clickedValue] >= 3)
      ) {
        pulseIndices = unlockedIndices.filter((diceIndex) => state.dice.values[diceIndex] === clickedValue);
      }

      damagePopupDieIndexRef.current = index;
      if (pulseIndices.length > 1) {
        const pulses = pulseIndices.map((dieIndex) => ({ id: makeId(), dieIndex }));
        const pulseIds = new Set<string>(pulses.map((pulse) => pulse.id));
        setDiePressPulses((current) => [...current, ...pulses]);
        window.setTimeout(() => {
          setDiePressPulses((current) => current.filter((pulse) => !pulseIds.has(pulse.id)));
        }, 180);
      }
    }
    const next = toggleDieSelection(state, index);
    const selectionChanged = next.dice.selected.some((selected, diceIndex) => selected !== state.dice.selected[diceIndex]);
    const selectedTripletStarted = !hasSelectedTriplet(state) && hasSelectedTriplet(next);
    const discountComboStarted = !isDiscountSmallStraight(state) && isDiscountSmallStraight(next);
    setState(next);
    if (selectionChanged) {
      const changedCount = next.dice.selected.filter((selected, diceIndex) => selected !== state.dice.selected[diceIndex]).length;
      const selectedCount = next.dice.selected.filter(Boolean).length;
      const selectedMoreDice = selectedCount > state.dice.selected.filter(Boolean).length;
      if (selectedTripletStarted) {
        triggerJokerEffect("triplet");
      }
      if (discountComboStarted) {
        triggerJokerEffect("discount");
      }
      if (selectedMoreDice && state.flags.feverCharges > 0) {
        triggerJokerEffect("fever");
      }
      if (state.dice.rollCount > 1) {
        triggerJokerEffect("greedy");
      }
      if (state.run.turnNumber === 1) {
        triggerJokerEffect("double-or-nothing");
      }
      playUiSound("select", { step: changedCount > 1 ? 1 : selectedCount });
    }
  };

  const onAttack = () => {
    if (attackCanBank) {
      suppressNextDamageDeltaRef.current = true;
      const next = hasSelectedScore ? confirmSelection(state, { includeMomentum: false }) : state;
      const banked = bankScore(next);
      playUiSound("click");

      if (banked.shop.open || banked.run.gameOver) {
        apply(banked, "attack");
        return;
      }

      if (rollTimeoutRef.current !== null) {
        window.clearTimeout(rollTimeoutRef.current);
      }

      setState(banked);
      setRollingDiceMask([]);
      setRollingDiceValues([]);
      setIsRolling(false);
      playUiSound("attack");
    }
  };

  const finishRollAfterAnimation = (
    rolledState: SaveData,
    rollMask: boolean[],
    options: { triggerMomentumAfterRoll?: boolean } = {}
  ) => {
    const triggerRollCompleteEffects = () => {
      if (options.triggerMomentumAfterRoll) {
        triggerJokerEffect("momentum");
      }
    };

    if (!rolledState.jokers.includes("my-bad")) {
      setIsRolling(false);
      setRollingDiceMask([]);
      setRollingDiceValues([]);
      setState(rolledState);
      triggerRollCompleteEffects();
      rollTimeoutRef.current = null;
      return;
    }

    const scoringIndicesAfterRoll = getScoringIndices(
      rolledState.dice.values,
      rolledState.dice.locked,
      rolledState.run.currentBoss,
      rolledState.jokers.includes("discount")
    );
    const nonScoringIndices = rolledState.dice.values
      .map((_, index) => index)
      .filter((index) => rollMask[index] && !rolledState.dice.locked[index] && !scoringIndicesAfterRoll.has(index));

    if (nonScoringIndices.length === 0) {
      setIsRolling(false);
      setIsMyBadRerollPending(false);
      setRollingDiceMask([]);
      setRollingDiceValues([]);
      setState(rolledState);
      triggerRollCompleteEffects();
      rollTimeoutRef.current = null;
      return;
    }

    const rerollIndex = nonScoringIndices[Math.floor(Math.random() * nonScoringIndices.length)];
    triggerJokerEffect("my-bad");
    const rerolledState = cloneState(rolledState);
    rerolledState.dice.values[rerollIndex] = randomDisplayDie();
    rerolledState.log.unshift({ id: makeId(), text: `My bad rerolled die ${rerollIndex + 1}.`, tone: "good" });
    rerolledState.updatedAt = Date.now();

    const activeValuesAfterReroll = rerolledState.dice.values.filter((_, index) => !rerolledState.dice.locked[index]);
    const finalState = hasAnyScoringDice(activeValuesAfterReroll, rerolledState.run.currentBoss, rerolledState.jokers.includes("discount"))
      ? rerolledState
      : handleFarkle(rerolledState);
    triggerFarkleJokerEffects(rerolledState, finalState);

    setState(rolledState);
    setIsRolling(false);
    setIsMyBadRerollPending(true);
    setRollingDiceMask([]);
    setRollingDiceValues([]);
    rollTimeoutRef.current = window.setTimeout(() => {
      setRollingDiceMask(rolledState.dice.values.map((_, index) => index === rerollIndex));
      setRollingDiceValues(rolledState.dice.values);
      setIsRolling(true);
      setIsMyBadRerollPending(false);
      playUiSound("roll");
      rollTimeoutRef.current = window.setTimeout(() => {
        setIsRolling(false);
        setRollingDiceMask([]);
        setRollingDiceValues([]);
        setState(finalState);
        triggerRollCompleteEffects();
        rollTimeoutRef.current = null;
      }, ROLL_ANIMATION_MS);
    }, MY_BAD_REROLL_DELAY_MS);
  };

  const onRoll = () => {
    if (isRolling || isMyBadRerollPending) {
      return;
    }

    if (hasSelectedScore) {
      const scoredState = confirmSelection(state);
      triggerConfirmJokerEffects(state, scoredState, { triggerMomentum: false });
      allowNextHotDiceOverlayRef.current = scoredState.dice.hotDice;
      const allLocked = scoredState.dice.locked.every(Boolean);
      const rollMask = scoredState.dice.locked.map((locked) => allLocked || !locked);
      const next = rollDice(scoredState, { deferFarkle: scoredState.jokers.includes("my-bad") });
      triggerFarkleJokerEffects(scoredState, next);

      setState(scoredState);
      setRollingDiceMask(rollMask);
      setRollingDiceValues(scoredState.dice.values.map((value, index) => (rollMask[index] ? randomDisplayDie() : value)));
      setIsRolling(true);
      playUiSound("click");
      playUiSound("roll");
      rollTimeoutRef.current = window.setTimeout(() => {
        finishRollAfterAnimation(next, rollMask, { triggerMomentumAfterRoll: true });
      }, ROLL_ANIMATION_MS);
      return;
    }

    const allLocked = state.dice.locked.every(Boolean);
    const rollMask = state.dice.locked.map((locked) => allLocked || !locked);
    const next = rollDice(state, { deferFarkle: state.jokers.includes("my-bad") });
    triggerFarkleJokerEffects(state, next);

    setRollingDiceMask(rollMask);
    setRollingDiceValues(state.dice.values.map((value, index) => (rollMask[index] ? randomDisplayDie() : value)));
    setIsRolling(true);
    playUiSound("click");
    playUiSound("roll");
    rollTimeoutRef.current = window.setTimeout(() => {
      finishRollAfterAnimation(next, rollMask);
    }, ROLL_ANIMATION_MS);
  };

  const onStartRun = () => {
    const next = createInitialState();
    if (rollTimeoutRef.current !== null) {
      window.clearTimeout(rollTimeoutRef.current);
    }

    setState(next);
    recordedGameOverRef.current = false;
    lastFarkleLogIdRef.current = null;
    damageDangerFarkleLogIdRef.current = null;
    lastTurnOverlayKeyRef.current = null;
    allowNextHotDiceOverlayRef.current = false;
    setFarkleFlash(false);
    setFarkleResolving(false);
    setIsMyBadRerollPending(false);
    setLastTurnOverlayId(null);
    setMarketLeaving(false);
    setMarketEntering(false);
    setMarketGridEntering(false);
    marketGridEnteredForCurrentOpenRef.current = false;
    setBossDyingShown(false);
    setBossDeadShown(false);
    if (marketTimeoutRef.current !== null) {
      window.clearTimeout(marketTimeoutRef.current);
      marketTimeoutRef.current = null;
    }
    setIsRolling(true);
    setRollingDiceValues(next.dice.values.map(() => randomDisplayDie()));
    setRollingDiceMask(next.dice.values.map(() => true));
    setDiePressPulses([]);
    jokerEffectTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    jokerEffectTimeoutsRef.current = [];
    setActiveJokerEffects([]);
    setDamageDeltaPopups([]);
    setPendingDieUpgradeItemId(null);
    setPendingJokerSaleIndex(null);
    setHealthHit(false);
    setHotDiceOverlayId(null);
    if (hotDiceOverlayTimeoutRef.current !== null) {
      window.clearTimeout(hotDiceOverlayTimeoutRef.current);
      hotDiceOverlayTimeoutRef.current = null;
    }
    if (lastTurnOverlayTimeoutRef.current !== null) {
      window.clearTimeout(lastTurnOverlayTimeoutRef.current);
      lastTurnOverlayTimeoutRef.current = null;
    }
    lastHotDiceLogIdRef.current = null;
    previousRoundScoreRef.current = 0;
    setDisplayMoney(4);
    setDisplayTurns(next.run.turnsLeft);
    setRewardPopups([]);
    setRewardAnimationCompleteLogId(null);
    rewardAnimationLogIdRef.current = null;
    rewardTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    rewardTimeoutsRef.current = [];
    clearSequenceTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    clearSequenceTimeoutsRef.current = [];
    clearSequenceLogIdRef.current = null;
    setScreen("game");
    playUiSound("click");
    playUiSound("roll");
    rollTimeoutRef.current = window.setTimeout(() => {
      setIsRolling(false);
      setRollingDiceValues([]);
      setRollingDiceMask([]);
      rollTimeoutRef.current = null;
    }, ROLL_ANIMATION_MS);
  };

  const onHome = () => {
    setScreen("home");
    playUiSound("click");
  };

  const onShopItemClick = (itemId: string) => {
    if (rewardAnimating || marketLeaving || pendingJokerSaleId) {
      return;
    }

    const item = state.shop.items.find((candidate) => candidate.id === itemId);
    if (!item || item.purchased) {
      return;
    }

    stopMarketAppearAnimation();
    setPendingJokerSaleIndex(null);

    if (item.kind === "die-upgrade" || item.kind === "special-die") {
      if (state.run.money >= item.price) {
        setPendingDieUpgradeItemId(item.id);
        playUiSound("click");
      }
      return;
    }

    apply(buyShopItem(state, itemId), "buy");
  };

  const onSkipMarket = () => {
    if (rewardAnimating || marketLeaving) {
      return;
    }

    setPendingDieUpgradeItemId(null);
    setPendingJokerSaleIndex(null);
    setMarketLeaving(true);
    setMarketEntering(false);
    playUiSound("click");
    playUiSound("market-close");

    marketTimeoutRef.current = window.setTimeout(() => {
      const next = nextRound(state);
      if (rollTimeoutRef.current !== null) {
        window.clearTimeout(rollTimeoutRef.current);
      }

      setMarketLeaving(false);
      setMarketEntering(false);
      setMarketGridEntering(false);
      marketGridEnteredForCurrentOpenRef.current = false;
      setBossDyingShown(false);
      setBossDeadShown(false);
      marketTimeoutRef.current = null;
      setState(next);
      clearSequenceTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      clearSequenceTimeoutsRef.current = [];
      clearSequenceLogIdRef.current = null;
      setRewardAnimationCompleteLogId(null);
      setRollingDiceMask(next.dice.values.map(() => true));
      setRollingDiceValues(next.dice.values.map(() => randomDisplayDie()));
      setIsRolling(true);
      playUiSound("roll");
      rollTimeoutRef.current = window.setTimeout(() => {
        finishRollAfterAnimation(next, next.dice.values.map(() => true));
      }, ROLL_ANIMATION_MS);
    }, MARKET_EXIT_MS);
  };

  const onJokerSlotClick = (index: number) => {
    if (!marketVisible || rewardAnimating || marketLeaving) {
      return;
    }

    stopMarketAppearAnimation();
    setPendingDieUpgradeItemId(null);
    setPendingJokerSaleIndex(index);
    playUiSound("click");
  };

  const onCancelJokerSale = () => {
    setPendingJokerSaleIndex(null);
    playUiSound("click");
  };

  const onConfirmJokerSale = () => {
    if (pendingJokerSaleIndex === null) {
      return;
    }

    const jokerId = state.jokers[pendingJokerSaleIndex];
    const joker = jokerId ? JOKERS.find((candidate) => candidate.id === jokerId) : null;
    if (!joker) {
      setPendingJokerSaleIndex(null);
      return;
    }

    const salePrice = Math.floor(joker.price / 2);
    const next = cloneState(state);
    next.jokers.splice(pendingJokerSaleIndex, 1);
    next.run.money += salePrice;
    next.log.unshift({ id: makeId(), text: `Sold ${joker.name} for $${salePrice}.`, tone: "good" });
    next.updatedAt = Date.now();

    setPendingJokerSaleIndex(null);
    setState(next);
    playUiSound("coin");
  };

  const getShopItemText = (item: SaveData["shop"]["items"][number]): { name: string; description: string } => {
    if (item.kind === "joker") {
      const joker = JOKERS.find((candidate) => candidate.id === item.refId);
      return { name: joker?.name ?? "Joker", description: joker?.description ?? "Passive modifier." };
    }
    if (item.kind === "die-upgrade") {
      return { name: `Die +${item.bonus ?? 25}`, description: "Choose one die face to add this bonus when it scores." };
    }
    if (item.kind === "special-die") {
      const die = SPECIAL_DICE.find((candidate) => candidate.id === item.refId);
      return { name: die?.name ?? "Special Die", description: die?.description ?? "Replace one die with this special die." };
    }
    const upgradeId = item.refId as UpgradeId;
    const upgrade = UPGRADES.find((candidate) => candidate.id === upgradeId);
    const bonus = getHandUpgradeBonusAmount(state.upgrades, upgradeId);
    return {
      name: upgrade?.name ?? "Hand Upgrade",
      description: `Current x1.5 adds +${bonus}.`
    };
  };

  if (screen === "home") {
    return (
      <main className="shell home-shell">
        <section className="home-card">
          <h1 className="home-title">
            <span>Dungeon</span>
            <span className="home-title-alea">Alea</span>
          </h1>
          <div className="home-records" aria-label="Run records">
            <div className="home-record">
              <span>Best</span>
              <strong>{formatScore(records.bestScore)}</strong>
            </div>
            <div className="home-record">
              <span>Last</span>
              <strong>{formatScore(records.lastScore)}</strong>
            </div>
          </div>
          <button className="home-start" onClick={onStartRun}>
            Play
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="score-banner frame">
        <span className="score-label">Score</span>
        <strong className="score-value">{formatScore(state.run.roundScore)}</strong>
        <span className="score-side">Round {state.run.round}</span>
      </section>

      {marketVisible ? (
        <section className={`market-panel frame ${marketEntering ? "entering" : ""} ${marketLeaving ? "leaving" : ""}`}>
          <h1>MARKET</h1>
        </section>
      ) : (
        <section className="enemy-panel frame">
          <div
            className={`portrait-box boss-${bossId} ${bossDyingShown || bossDeadShown ? "dead" : ""} ${bossDyingShown && !bossDeadShown ? "dying" : ""} ${healthHit ? "hit" : ""}`}
          >
            <div className="portrait-aura" />
            <img className="boss-sprite" src={bossMonsterImage} alt={BOSS_TITLES[bossId]} draggable={false} />
          </div>
          <div className="boss-card">
            <div className="boss-header">
              <h1>{BOSS_TITLES[bossId]}</h1>
            </div>
            <div className="boss-copy">
              <p>{enemyDescription}</p>
            </div>
            <div className="health-block">
              <div className="health-meta">
                <span />
                <span>
                  {formatScore(enemyHpRemaining)}/{formatScore(state.run.targetScore)}
                </span>
              </div>
              <div className={`health-track ${healthHit ? "hit" : ""}`}>
                <div className="health-fill" style={{ width: `${enemyHpPercent}%` }} />
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="stat-strip">
        <article className="stat-box frame money-stat">
          <span className="eyebrow">Money</span>
          <strong>${displayMoney}</strong>
          {rewardPopups.map((popup) => (
            <div key={popup.key} className="money-reward-overlay" aria-live="polite" aria-label={popup.label}>
              <em className={popup.amount < 0 ? "penalty" : ""}>
                {popup.label} {rewardAmountText(popup.amount)}
              </em>
            </div>
          ))}
        </article>
        <article className="stat-box frame damage-stat">
          <span className="eyebrow">Damage</span>
          <div className="damage-stack">
            <strong className={`damage-value ${damageDanger ? "danger" : ""}`}>{displayDamage}</strong>
          </div>
        </article>
        <article className="stat-box frame">
          <span className="eyebrow">Turns</span>
          <strong>{displayedTurnCount}</strong>
        </article>
      </section>

      <section className="tactical-board frame">
        <div className="board-head">
          <div className="board-title" />
        </div>

        <div className="slot-row items-row">
          {itemSlots.map((jokerId, index) => {
            const jokerImagePath = jokerId ? getJokerImagePath(jokerId) : null;
            const jokerEffect = jokerId
              ? activeJokerEffects.filter((effect) => effect.jokerId === jokerId).at(-1) ?? null
              : null;
            const jokerName = jokerId ? JOKERS.find((joker) => joker.id === jokerId)?.name ?? "joker" : "joker";
            const salePending = pendingJokerSaleIndex === index && !!jokerId;
            const canSellJoker = marketVisible && !rewardAnimating && !marketLeaving && !pendingJokerSaleId && !!jokerId;
            const inactive =
              (jokerId === "band-aid" && state.flags.bandAidUsedRound && !state.run.cleared) ||
              (jokerId === "fever" && state.flags.feverCharges <= 0) ||
              (jokerId === "overtime" && state.run.turnsLeft !== 1);
            const slotClassName = `board-slot relic-slot ${jokerId ? "filled" : "empty"} ${inactive ? "inactive" : ""} ${jokerEffect ? "joker-effect" : ""} ${salePending ? "sell-pending" : ""} ${canSellJoker ? "sellable" : ""}`;
            return canSellJoker ? (
              <button
                key={`item-${index}-${jokerEffect?.key ?? "idle"}`}
                type="button"
                className={slotClassName}
                onClick={() => onJokerSlotClick(index)}
                aria-label={`Sell ${jokerName}`}
              >
                {jokerImagePath ? <img className="relic-slot-joker-image" src={jokerImagePath} alt="" draggable={false} /> : null}
              </button>
            ) : (
              <div
                key={`item-${index}-${jokerEffect?.key ?? "idle"}`}
                className={slotClassName}
              >
                {jokerImagePath ? <img className="relic-slot-joker-image" src={jokerImagePath} alt="" draggable={false} /> : null}
              </div>
            );
          })}
        </div>

        {marketVisible && !choosingDieUpgrade ? (
          <div className={`market-grid ${marketGridEntering ? "entering" : ""} ${marketLeaving ? "leaving" : ""} ${pendingJokerSaleId ? "sale-pending" : ""}`}>
            {[
              { label: "Jokers", items: shopJokers },
              { label: "Dice", items: shopDiceItems },
              { label: "Hands", items: shopHandUpgrades }
            ].map((column) => (
              <div key={column.label} className="market-column">
                {column.items.map((item) => {
                  const itemText = getShopItemText(item);
                  const jokerImagePath = item.kind === "joker" ? getJokerImagePath(item.refId) : null;
                  const disabled =
                    rewardAnimating ||
                    marketLeaving ||
                    !!pendingJokerSaleId ||
                    item.purchased ||
                    state.run.money < item.price ||
                    (item.kind === "joker" && state.jokers.length >= 6);
                  return (
                    <button
                      key={item.id}
                      className={`market-item ${item.purchased ? "purchased" : ""}`}
                      onClick={() => onShopItemClick(item.id)}
                      disabled={disabled}
                    >
                      <span className="market-item-head">
                        <strong>{itemText.name}</strong>
                        <em>${item.price}</em>
                      </span>
                      {jokerImagePath ? (
                        <img className="market-item-joker-image" src={jokerImagePath} alt="" draggable={false} />
                      ) : item.kind === "die-upgrade" ? (
                        <img className="market-item-die-image" src={DUMMY_DIE_UPGRADE_IMAGE_PATH} alt="" draggable={false} />
                      ) : item.kind === "special-die" ? (
                        <span
                          className="market-item-die-image"
                          style={dieSpriteStyle(1, getDieImagePath(item.refId))}
                          aria-hidden="true"
                        />
                      ) : item.kind === "hand-upgrade" ? (
                        <span className="market-item-hand-symbol" aria-hidden="true">
                          {getHandUpgradeSymbol(item.refId)}
                        </span>
                      ) : (
                        <span className={`market-item-portrait ${item.kind}`} aria-hidden="true">
                          <span />
                        </span>
                      )}
                      <span className="market-item-copy">{itemText.description}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
        <div className={`slot-row dice-row ${farkleFlash ? "farkle-flash" : ""} ${choosingDieUpgrade ? "choosing-upgrade" : ""}`}>
          {!choosingDieUpgrade && !marketOpen && hotDiceOverlayId ? (
            <div key={hotDiceOverlayId} className="hot-dice-overlay" aria-live="polite">
              Hot Dice!
            </div>
          ) : null}
          {!choosingDieUpgrade && !marketOpen && !hotDiceOverlayId && lastTurnOverlayId ? (
            <div key={lastTurnOverlayId} className="hot-dice-overlay last-turn-overlay" aria-live="polite">
              Last Turn!
            </div>
          ) : null}
          {displayedDiceValues.map((value, index) => {
            const rolling = isRolling && rollingDiceMask[index];
            const selected = !choosingDieUpgrade && !farkleResolving && !rolling && state.dice.selected[index];
            const locked = !choosingDieUpgrade && !farkleResolving && !rolling && state.dice.locked[index];
            const disabled = !choosingDieUpgrade && !farkleResolving && !rolling && state.dice.disabled[index];
            const scoring = !choosingDieUpgrade && !farkleResolving && !rolling && scoringIndices.has(index);
            const dieDeltaPopups = damageDeltaPopups.filter((popup) => popup.dieIndex === index);
            const pressing = diePressPulses.some((pulse) => pulse.dieIndex === index);
            return (
              <button
                key={`die-${index}`}
                className={`board-slot die-slot ${selected ? "selected" : ""} ${locked ? "locked" : ""} ${disabled ? "inactive" : ""} ${scoring ? "scoring" : ""} ${rolling ? "rolling" : ""} ${pressing ? "press-pulse" : ""}`}
                onClick={() => onDieClick(index)}
                disabled={isRolling || isMyBadRerollPending || farkleResolving || state.run.gameOver || (marketOpen && !choosingDieUpgrade)}
                aria-label={`Die ${value}`}
              >
                <span className="slot-tag">Die</span>
                {dieDeltaPopups.length > 0 ? (
                  <span className="die-delta-stack" aria-live="polite">
                    {dieDeltaPopups.map((popup) => (
                      <span key={popup.id} className="die-delta">
                        {formatDelta(popup.value)}
                      </span>
                    ))}
                  </span>
                ) : null}
                <span className="die-image" style={dieSpriteStyle(value, getDieImagePath(state.dice.types[index]))} aria-hidden="true" />
                <span className="die-state">
                  {disabled ? "Inactive" : locked ? "Banked" : selected ? "Chosen" : scoring ? "Live" : "Dead"}
                </span>
              </button>
            );
          })}
        </div>
        )}
        {marketVisible && pendingJokerSaleId && pendingJokerSaleDefinition ? (
          <div className="joker-sale-confirm" role="dialog" aria-modal="true" aria-label="Confirm joker sale">
            <h2 className="joker-sale-title">Sell {pendingJokerSaleDefinition.name}?</h2>
            <p className="joker-sale-description">{pendingJokerSaleDefinition.description}</p>
            <span>Get ${pendingJokerSalePrice}</span>
            <div className="joker-sale-actions">
              <button type="button" className="joker-sale-button cancel" onClick={onCancelJokerSale}>
                Cancel
              </button>
              <button type="button" className="joker-sale-button confirm" onClick={onConfirmJokerSale}>
                Sell
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="action-bar">
        {marketVisible ? (
          <button className="action-button skip" onClick={onSkipMarket} disabled={rewardAnimating || marketLeaving || !!pendingJokerSaleId}>
            Skip
          </button>
        ) : marketOpen ? null : (
          <>
            <button className="action-button roll" onClick={onRoll} disabled={rollDisabled}>
              Roll
            </button>
            <button className="action-button attack" onClick={onAttack} disabled={attackDisabled}>
              Attack
            </button>
          </>
        )}
      </section>

      {state.run.gameOver ? (
        <section className="game-over-overlay" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
          <div className="game-over-card frame">
            <h2 id="game-over-title">Game Over</h2>
            <div className="game-over-stats">
              <article>
                <span>Score</span>
                <strong>{formatScore(state.run.roundScore)}</strong>
              </article>
              <article>
                <span>Best</span>
                <strong>{formatScore(gameOverBestScore)}</strong>
              </article>
            </div>
            <div className="game-over-actions">
              <button className="game-over-button retry" onClick={onStartRun}>
                Retry
              </button>
              <button className="game-over-button home" onClick={onHome}>
                Home
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

export default App;
