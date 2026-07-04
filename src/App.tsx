import { useEffect, useRef, useState } from "react";
import type { CSSProperties, SyntheticEvent } from "react";
import "./index.css";
import { assetPath } from "./game/asset";
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
  getFaceUpgradeLevel,
  getFaceUpgradePrice,
  getFaceUpgradeScale,
  getActivePortraitCopy,
  getGreedyMultiplier,
  hasHoldEmSelectionConflict,
  getJokerCount,
  getLockedPheonixValues,
  getScoringIndices,
  handleFarkle,
  hasAnyScoringDice,
  getUpgradeFace,
  normalizePortraitCopy,
  nextRound,
  rerollSingleDieValue,
  rollDice,
  toggleDieSelection
} from "./game/logic";
import type { BossId, JokerId, SaveData, UpgradeId } from "./types";

function formatScore(value: number): string {
  return value.toLocaleString();
}

function formatDamageDisplay(value: number): { text: string; lines: string[]; longestLineLength: number } {
  const text = formatScore(value);
  if (text.length < 10) {
    return { text, lines: [text], longestLineLength: text.length };
  }

  const groups = text.split(",");
  if (groups.length < 2) {
    return { text, lines: [text], longestLineLength: text.length };
  }

  let bestLines = [text];
  let bestLongestLineLength = text.length;
  let bestLengthDifference = text.length;

  for (let splitIndex = 1; splitIndex < groups.length; splitIndex += 1) {
    const firstLine = `${groups.slice(0, splitIndex).join(",")},`;
    const secondLine = groups.slice(splitIndex).join(",");
    const longestLineLength = Math.max(firstLine.length, secondLine.length);
    const lengthDifference = Math.abs(firstLine.length - secondLine.length);
    const isBetterSplit =
      longestLineLength < bestLongestLineLength ||
      (longestLineLength === bestLongestLineLength && lengthDifference < bestLengthDifference) ||
      (longestLineLength === bestLongestLineLength &&
        lengthDifference === bestLengthDifference &&
        firstLine.length >= secondLine.length);

    if (isBetterSplit) {
      bestLines = [firstLine, secondLine];
      bestLongestLineLength = longestLineLength;
      bestLengthDifference = lengthDifference;
    }
  }

  return { text, lines: bestLines, longestLineLength: bestLongestLineLength };
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
const GAME_OVER_DELAY_MS = 500;
const BASIC_DIE_IMAGE_PATH = assetPath("/dice-basic.png");
const FORESIGHT_DIE_IMAGE_PATHS = Array.from({ length: 6 }, (_, index) =>
  assetPath(`/dice-foresight-${index + 1}.png`)
);
const CHARGED_DIE_IMAGE_PATHS = [assetPath("/charged1.png"), assetPath("/charged2.png")];

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
  label?: string;
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

function formatGreedyMultiplierLabel(multiplier: number): string {
  if (multiplier >= 100) {
    return `${Math.floor(multiplier)}`.slice(0, 3);
  }
  if (multiplier >= 10) {
    return `${Math.floor(multiplier)}`;
  }
  return `x${multiplier.toFixed(1)}`;
}

function isFixedAnchorDie(state: SaveData, index: number): boolean {
  return state.dice.types[index] === "anchor" && state.dice.anchorFixed?.[index] === true;
}

function randomDisplayDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function getDieImagePath(refId: string): string {
  if (refId === "basic") {
    return BASIC_DIE_IMAGE_PATH;
  }
  return SPECIAL_DICE.find((die) => die.id === refId)?.image ?? BASIC_DIE_IMAGE_PATH;
}

function getBoardDieImagePath(state: SaveData, index: number): string {
  const type = state.dice.types[index];
  if (type === "glass" && state.dice.disabled[index]) {
    return assetPath("/dice-glass-broken.png");
  }
  if (type === "foresight") {
    const nextValue = state.dice.foresightNext?.[index] ?? null;
    return nextValue === null ? BASIC_DIE_IMAGE_PATH : FORESIGHT_DIE_IMAGE_PATHS[nextValue - 1] ?? BASIC_DIE_IMAGE_PATH;
  }
  if (type === "charged") {
    return state.dice.chargedUsed?.[index] ? CHARGED_DIE_IMAGE_PATHS[1] : CHARGED_DIE_IMAGE_PATHS[0];
  }
  return getDieImagePath(type);
}

function dieSpriteStyle(
  value: number,
  imagePath = BASIC_DIE_IMAGE_PATH,
  spriteRows = 2,
  rowOffset = 0
): CSSProperties {
  const normalized = Math.max(1, Math.min(6, value)) - 1;
  const column = normalized % 3;
  const row = Math.floor(normalized / 3) + rowOffset;

  return {
    backgroundImage: `url("${imagePath}")`,
    backgroundSize: `300% ${spriteRows * 100}%`,
    "--die-sprite-x": `${column * 50}%`,
    "--die-sprite-y": `${spriteRows <= 1 ? 0 : (row * 100) / (spriteRows - 1)}%`
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
  const breakdown = calculateSelectedScore(state);
  if (!breakdown.valid || breakdown.score <= 0) {
    return false;
  }

  return getSelectedValues(state).length === 3;
}

function isDiscountSmallStraight(state: SaveData): boolean {
  const values = [...getSelectedValues(state), ...getLockedPheonixValues(state.dice)].sort((a, b) => a - b);
  const key = values.join(",");
  return values.length === 5 && (key === "1,2,3,4,5" || key === "2,3,4,5,6");
}

function getDualityMultiplierLabel(stack: number): string {
  return `x${2 ** stack}`;
}

const BOSS_TITLES: Record<string, string> = {
  normal: "Bone Croupier",
  "bone-croupier": "Bone Croupier",
  "dry-table": "Dustbone Dealer",
  "tax-collector": "Vampire Tithe",
  "broken-cup": "Cupbone Brute",
  "bitter-five": "Bitter Acolyte",
  "heavy-bones": "Iron Prior",
  "poor-house": "Vault Hierophant"
};

const JOKER_IMAGE_PATHS: Partial<Record<string, string>> = {
  triplet: assetPath("/jokers/triplets.png"),
  greedy: assetPath("/jokers/greedy.png"),
  "big-risk": assetPath("/jokers/big%20risk.png"),
  "band-aid": assetPath("/jokers/band-aid.png"),
  insurance: assetPath("/jokers/insurance.png"),
  "my-bad": assetPath("/jokers/my%20bad.png"),
  "just-one-more": assetPath("/jokers/just%20one%20more.png"),
  sparta: assetPath("/jokers/sparta.png"),
  fever: assetPath("/jokers/fever.png"),
  deal: assetPath("/jokers/deal.png"),
  discount: assetPath("/jokers/discount.png"),
  "snake-eyes": assetPath("/jokers/snake%20eyes.png"),
  "clean-sweep": assetPath("/jokers/clean%20sweep.png"),
  momentum: assetPath("/jokers/momentum.png"),
  "tax-refund": assetPath("/jokers/tax%20refund.png"),
  "pocket-change": assetPath("/jokers/pocket%20change.png"),
  "double-or-nothing": assetPath("/jokers/double%20or%20nothing.png"),
  overtime: assetPath("/jokers/overtime.png"),
  "hold-em": assetPath("/jokers/hold'em.png"),
  "gold-mine": assetPath("/jokers/gold%20mine.png"),
  "golden-ratio": assetPath("/jokers/golden%20raito.png"),
  "the-portrait": assetPath("/jokers/the%20portrait.png"),
  "odd-choice": assetPath("/jokers/odd%20choice.png"),
  duality: assetPath("/jokers/duality.png"),
  investment: assetPath("/jokers/investment.png"),
  "wake-up": assetPath("/jokers/wake%20up.png"),
  "faustian-bargain": assetPath("/jokers/faustian%20bargain.png")
};

const DUMMY_DIE_UPGRADE_IMAGE_PATH = assetPath("/dice/die1.png");
const reportedMissingJokerImageRefs = new Set<string>();

function getJokerImagePath(refId: string, context = "joker"): string | null {
  const imagePath = JOKER_IMAGE_PATHS[refId] ?? null;
  if (!imagePath && !reportedMissingJokerImageRefs.has(refId)) {
    reportedMissingJokerImageRefs.add(refId);
    console.error("[joker-image] Missing Joker image mapping.", {
      refId,
      context,
      knownRefs: Object.keys(JOKER_IMAGE_PATHS)
    });
  }
  return imagePath;
}

function logJokerImageLoadFailure(
  event: SyntheticEvent<HTMLImageElement>,
  details: { refId: string | null; context: string; slotIndex?: number; expectedSrc?: string | null }
): void {
  const image = event.currentTarget;
  const src = image.currentSrc || image.src || details.expectedSrc || "";
  const baseDetails = {
    ...details,
    src,
    currentSrc: image.currentSrc,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    pageUrl: window.location.href,
    baseUrl: import.meta.env.BASE_URL
  };

  if (!src) {
    console.error("[joker-image] Failed to load Joker image: empty image src.", baseDetails);
    return;
  }

  console.error("[joker-image] Failed to load Joker image.", baseDetails);
  void fetch(src, { method: "HEAD", cache: "no-store" })
    .then((response) => {
      const contentType = response.headers.get("content-type") ?? "";
      const contentLength = response.headers.get("content-length") ?? "";
      const probableCause = !response.ok
        ? `HTTP ${response.status} ${response.statusText || "error"}`
        : contentType && !contentType.startsWith("image/")
          ? `Unexpected content-type: ${contentType}`
          : contentLength === "0"
            ? "The server returned an empty file."
            : "The URL responded, so check for a corrupt/unsupported image file or stale browser cache.";

      console.error("[joker-image] Joker image load diagnostics.", {
        ...baseDetails,
        httpStatus: response.status,
        ok: response.ok,
        contentType,
        contentLength,
        probableCause
      });
    })
    .catch((error: unknown) => {
      console.error("[joker-image] Could not diagnose Joker image load failure.", {
        ...baseDetails,
        probableCause: error instanceof Error ? error.message : String(error)
      });
    });
}

function getHandUpgradeSymbol(refId: string): string {
  return String(getUpgradeFace(refId as UpgradeId));
}

const MONSTER_IDLE_BASE =
  assetPath("/2D Pixel Dungeon Asset Pack v2.0/2D Pixel Dungeon Asset Pack/Character_animation/monsters_idle");
const PRIEST_IDLE_BASE =
  assetPath("/2D Pixel Dungeon Asset Pack v2.0/2D Pixel Dungeon Asset Pack/Character_animation/priests_idle");

const BOSS_MONSTER_IDLE: Record<string, string[]> = {
  normal: Array.from({ length: 4 }, (_, index) => `${MONSTER_IDLE_BASE}/skeleton1/v2/skeleton_v2_${index + 1}.png`),
  "bone-croupier": Array.from({ length: 4 }, (_, index) => `${MONSTER_IDLE_BASE}/skeleton1/v2/skeleton_v2_${index + 1}.png`),
  "dry-table": Array.from({ length: 4 }, (_, index) => `${MONSTER_IDLE_BASE}/skull/v2/skull_v2_${index + 1}.png`),
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
  const [showGameOverOverlay, setShowGameOverOverlay] = useState(false);
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
  const cleanSweepTimeoutsRef = useRef<number[]>([]);
  const cleanSweepAnimationFrameRef = useRef<number | null>(null);
  const gameOverOverlayTimeoutRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  const scoreAnimationFrameRef = useRef<number | null>(null);
  const previousRoundScoreRef = useRef(state.run.roundScore);
  const lastHotDiceLogIdRef = useRef<string | null>(null);
  const lastCleanSweepLogIdRef = useRef<string | null>(null);
  const lastTurnOverlayKeyRef = useRef<string | null>(null);
  const previousMarketVisibleRef = useRef(false);
  const marketGridEnteredForCurrentOpenRef = useRef(false);
  const selectSoundStepRef = useRef(0);

  const breakdown = calculateSelectedScore(state);
  const scoringIndices =
    state.dice.rollCount > 0
      ? getScoringIndices(
          state.dice.values,
          state.dice.locked,
          state.run.currentBoss,
          getJokerCount(state, "discount") > 0,
          state.dice.disabled,
          getJokerCount(state, "hold-em") > 0,
          getJokerCount(state, "odd-choice") > 0,
          state.dice.types
        )
      : new Set<number>();
  const holdEmSelectionConflict = hasHoldEmSelectionConflict(state);
  const bossId: BossId | "normal" = state.run.currentBoss ?? "normal";
  const bossData = state.run.currentBoss ? BOSSES[state.run.currentBoss] : null;
  const enemyDescription = bossData
    ? bossData.descriptions[state.run.bossDescriptionIndex] ?? bossData.descriptions[0]
    : "The house is watching. Try not to roll anything embarrassing.";
  const bossMonsterFrames = BOSS_MONSTER_IDLE[bossId];
  const bossMonsterImage = bossMonsterFrames[monsterIdleFrame % bossMonsterFrames.length];
  const bossTone = state.run.currentBossTone;
  const enemyHpRemaining = Math.max(0, state.run.targetScore - state.run.roundScore);
  const enemyHpRatio =
    state.run.targetScore <= 0 ? 0 : Math.max(0, 1 - state.run.roundScore / state.run.targetScore);
  const enemyHpPercent = Math.round(enemyHpRatio * 100);
  const itemSlots = Array.from({ length: 6 }, (_, index) => state.jokers[index] ?? null);
  const hasSelectedScore = breakdown.valid && breakdown.score > 0;
  const activeDiceCount = state.dice.values.filter(
    (_, index) => !state.dice.locked[index] && !state.dice.disabled[index]
  ).length;
  const selectedBloodyCount = state.dice.selected.filter(
    (selected, index) => selected && state.dice.types[index] === "bloody"
  ).length;
  const selectedPreviewTurnScore = state.run.turnScore + (hasSelectedScore ? breakdown.score : 0);
  const bloodyPreviewTurnScore =
    selectedBloodyCount > 0
      ? Math.round(selectedPreviewTurnScore * 1.5 ** selectedBloodyCount)
      : selectedPreviewTurnScore;
  const rawPreviewTurnScore =
    getJokerCount(state, "sparta") > 0 && activeDiceCount === 1 && hasSelectedScore
      ? bloodyPreviewTurnScore * 3 ** getJokerCount(state, "sparta")
      : bloodyPreviewTurnScore;
  const previewTurnScore =
    getJokerCount(state, "big-risk") > 0 && state.dice.rollCount >= 4
      ? rawPreviewTurnScore * 2 ** getJokerCount(state, "big-risk")
      : rawPreviewTurnScore;
  const [displayDamage, setDisplayDamage] = useState(previewTurnScore);
  const [displayScore, setDisplayScore] = useState(state.run.totalScore);
  const [damageDeltaPopups, setDamageDeltaPopups] = useState<DamageDeltaPopup[]>([]);
  const [damageDanger, setDamageDanger] = useState(false);
  const displayDamageRef = useRef(previewTurnScore);
  const displayScoreRef = useRef(state.run.totalScore);
  const previousDamageTargetRef = useRef(previewTurnScore);
  const suppressNextDamageDeltaRef = useRef(false);
  const damagePopupDieIndexRef = useRef<number | null>(null);
  const allowNextHotDiceOverlayRef = useRef(false);
  const damageDisplay = formatDamageDisplay(displayDamage);
  const damageValueStyle = {
    "--damage-fit-size": `${145 / Math.max(1, damageDisplay.longestLineLength)}cqw`
  } as CSSProperties;
  const finalTurnAttackRequirementMet =
    state.run.turnsLeft !== 1 || previewTurnScore >= enemyHpRemaining;
  const attackCanBank =
    previewTurnScore > 0 &&
    finalTurnAttackRequirementMet &&
    !state.shop.open &&
    !state.run.gameOver;
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
    (state.dice.awaitingAction && !hasSelectedScore);
  const attackDisabled = isRolling || isMyBadRerollPending || farkleResolving || !attackCanBank;
  const displayedDiceValues = isRolling && rollingDiceValues.length === state.dice.values.length
    ? rollingDiceValues.map((value, index) => (rollingDiceMask[index] ? value : state.dice.values[index]))
    : state.dice.values;
  const currentTurnLimit = TURN_LIMIT + getJokerCount(state, "deal");
  const displayedTurnCount = marketVisible ? currentTurnLimit : Math.max(0, displayTurns - 1);
  const gameOverBestScore = Math.max(records.bestScore, state.run.totalScore);
  const activePortraitCopy = getActivePortraitCopy(state);

  useEffect(() => {
    if (!state.dice.selected.some(Boolean)) {
      selectSoundStepRef.current = 0;
    }
  }, [state.dice.selected]);

  const apply = (next: SaveData, sound?: Parameters<typeof playUiSound>[0]) => {
    stateRef.current = next;
    setState(next);
    if (sound) {
      playUiSound(sound);
    }
  };

  const triggerJokerEffect = (jokerId: JokerId, label?: string) => {
    if (!state.jokers.includes(jokerId)) {
      return;
    }

    const effectKey = makeId();
    setActiveJokerEffects((current) => [...current, { key: effectKey, jokerId, label }]);
    const timeoutId = window.setTimeout(() => {
      setActiveJokerEffects((current) => current.filter((effect) => effect.key !== effectKey));
      jokerEffectTimeoutsRef.current = jokerEffectTimeoutsRef.current.filter((id) => id !== timeoutId);
    }, 500);
    jokerEffectTimeoutsRef.current.push(timeoutId);
  };

  const triggerEffectiveJokerEffect = (
    jokerId: JokerId,
    label?: string,
    options: { portraitTiming?: "sync" | "delayed" | "exclusive" } = {}
  ) => {
    const portraitCopiesJoker = getActivePortraitCopy(state) === jokerId;
    if (options.portraitTiming === "exclusive" && portraitCopiesJoker) {
      triggerJokerEffect(Math.random() < 0.5 ? jokerId : "the-portrait", label);
      return;
    }

    triggerJokerEffect(jokerId, label);
    if (portraitCopiesJoker) {
      if (options.portraitTiming === "delayed") {
        window.setTimeout(() => triggerJokerEffect("the-portrait", label), 90);
      } else {
        triggerJokerEffect("the-portrait", label);
      }
    }
  };

  const triggerBigRiskActivation = (before: SaveData, after: SaveData) => {
    if (
      getJokerCount(after, "big-risk") > 0 &&
      before.dice.rollCount < 4 &&
      after.dice.rollCount >= 4 &&
      !hasNewFarkleLog(before, after)
    ) {
      triggerEffectiveJokerEffect("big-risk");
    }
  };

  const triggerWakeUpActivation = (before: SaveData, after: SaveData) => {
    const previousLogIds = new Set(before.log.map((entry) => entry.id));
    if (after.log.some((entry) => !previousLogIds.has(entry.id) && entry.text.startsWith("Wake Up reactivated"))) {
      triggerEffectiveJokerEffect("wake-up", undefined, { portraitTiming: "exclusive" });
    }
  };

  const triggerFaustianBargainActivation = (before: SaveData, after: SaveData) => {
    const previousLogIds = new Set(before.log.map((entry) => entry.id));
    if (after.log.some((entry) => !previousLogIds.has(entry.id) && entry.text.startsWith("Faustian Bargain spent"))) {
      triggerEffectiveJokerEffect("faustian-bargain", undefined, { portraitTiming: "exclusive" });
    }
  };

  const hasNewFarkleLog = (before: SaveData, after: SaveData) => {
    const previousLogIds = new Set(before.log.map((entry) => entry.id));
    return after.log.some((entry) => !previousLogIds.has(entry.id) && entry.text.startsWith("Farkle."));
  };

  const hasRollScoringDice = (candidate: SaveData) => {
    const activeValuesAfterRoll = candidate.dice.values.filter((_, index) => !candidate.dice.locked[index] && !candidate.dice.disabled[index]);
    return hasAnyScoringDice(
      activeValuesAfterRoll,
      candidate.run.currentBoss,
      getJokerCount(candidate, "discount") > 0,
      getJokerCount(candidate, "hold-em") > 0,
      getJokerCount(candidate, "odd-choice") > 0,
      getLockedPheonixValues(candidate.dice)
    );
  };

  const triggerMomentumRollActivation = (before: SaveData, after: SaveData) => {
    if (
      getJokerCount(before, "momentum") <= 0 ||
      before.run.turnScore <= 0 ||
      hasNewFarkleLog(before, after) ||
      !hasRollScoringDice(after)
    ) {
      return false;
    }

    triggerEffectiveJokerEffect("momentum");
    return true;
  };

  const triggerConfirmJokerEffects = (
    before: SaveData,
    after: SaveData,
    options: { triggerJustOneMore?: boolean; triggerMomentum?: boolean } = {}
  ) => {
    const selectedValues = getSelectedValues(before);
    const beforeAllUnavailable = before.dice.locked.every((locked, index) => locked || before.dice.disabled[index]);
    const afterAllUnavailable = after.dice.locked.every((locked, index) => locked || after.dice.disabled[index]);
    const hotDiceTriggered = !beforeAllUnavailable && afterAllUnavailable && after.dice.hotDice;

    if (options.triggerJustOneMore !== false && before.dice.rollCount >= 3) {
      triggerEffectiveJokerEffect("just-one-more");
    }
    if (options.triggerMomentum !== false) {
      triggerEffectiveJokerEffect("momentum");
    }
    if (before.flags.feverCharges > 0 && !hotDiceTriggered) {
      triggerEffectiveJokerEffect("fever");
    }
    if (hotDiceTriggered && getJokerCount(before, "fever") > 0) {
      triggerEffectiveJokerEffect("fever");
    }
    if (hotDiceTriggered && getJokerCount(before, "clean-sweep") > 0) {
      triggerEffectiveJokerEffect("clean-sweep");
    }
    if (getJokerCount(before, "discount") > 0 && isDiscountSmallStraight(before)) {
      triggerEffectiveJokerEffect("discount");
    }
  };

  const triggerFarkleJokerEffects = (before: SaveData, after: SaveData) => {
    if (after.flags.dualityStacks.original > before.flags.dualityStacks.original) {
      triggerJokerEffect("duality");
    }
    if (after.flags.dualityStacks.portrait > before.flags.dualityStacks.portrait) {
      triggerJokerEffect("the-portrait");
    }
    if (after.flags.bandAidUsesRound > before.flags.bandAidUsesRound) {
      if (getActivePortraitCopy(after) === "band-aid" && after.flags.bandAidUsesRound > 1) {
        triggerJokerEffect("the-portrait");
      } else {
        triggerJokerEffect("band-aid");
      }
    }
    if (after.run.roundScore > before.run.roundScore && before.run.turnScore > 0) {
      triggerEffectiveJokerEffect("insurance");
    }
  };

  useEffect(() => {
    [...FORESIGHT_DIE_IMAGE_PATHS, ...CHARGED_DIE_IMAGE_PATHS].forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
      cleanSweepTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      cleanSweepTimeoutsRef.current = [];
      if (cleanSweepAnimationFrameRef.current !== null) {
        cancelAnimationFrame(cleanSweepAnimationFrameRef.current);
      }
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
    triggerEffectiveJokerEffect("overtime");

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
            animateTurns(state.run.turnsLeft, 0, 460);
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
    const cleanSweepLog = state.log.find((entry) => entry.text.startsWith("Clean Sweep gained $"));
    if (!cleanSweepLog || cleanSweepLog.id === lastCleanSweepLogIdRef.current) {
      return;
    }

    const cleanSweepAmount = Number(cleanSweepLog.text.match(/Clean Sweep gained \$(\d+)\./)?.[1] ?? 0);
    if (cleanSweepAmount <= 0) {
      return;
    }

    lastCleanSweepLogIdRef.current = cleanSweepLog.id;
    cleanSweepTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    cleanSweepTimeoutsRef.current = [];
    if (cleanSweepAnimationFrameRef.current !== null) {
      cancelAnimationFrame(cleanSweepAnimationFrameRef.current);
    }

    const pendingClearReward = state.run.cleared
      ? rewardBreakdown.reduce((sum, item) => sum + item.amount, 0)
      : 0;
    const to = state.run.money - pendingClearReward;
    const from = to - cleanSweepAmount;
    const popupKey = `${cleanSweepLog.id}-sweep`;
    const startedAt = performance.now();

    setDisplayMoney(from);
    setRewardPopups((current) => [...current, { key: popupKey, label: "+sweep", amount: cleanSweepAmount }]);
    playUiSound("coin");

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 460);
      const eased = 1 - (1 - progress) ** 3;
      setDisplayMoney(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        cleanSweepAnimationFrameRef.current = requestAnimationFrame(tick);
      } else {
        cleanSweepAnimationFrameRef.current = null;
      }
    };
    cleanSweepAnimationFrameRef.current = requestAnimationFrame(tick);

    cleanSweepTimeoutsRef.current.push(
      window.setTimeout(() => {
        setRewardPopups((current) => current.filter((popup) => popup.key !== popupKey));
      }, REWARD_LABEL_MS),
      window.setTimeout(() => {
        setDisplayMoney(to);
      }, 500)
    );
  }, [rewardBreakdown, state.log, state.run.cleared, state.run.money]);

  useEffect(() => {
    if (!state.run.gameOver) {
      recordedGameOverRef.current = false;
      setShowGameOverOverlay(false);
      if (gameOverOverlayTimeoutRef.current !== null) {
        window.clearTimeout(gameOverOverlayTimeoutRef.current);
        gameOverOverlayTimeoutRef.current = null;
      }
      return;
    }

    if (!showGameOverOverlay && gameOverOverlayTimeoutRef.current === null) {
      gameOverOverlayTimeoutRef.current = window.setTimeout(() => {
        setShowGameOverOverlay(true);
        gameOverOverlayTimeoutRef.current = null;
      }, GAME_OVER_DELAY_MS);
    }

    if (recordedGameOverRef.current) {
      return;
    }

    recordedGameOverRef.current = true;
    playUiSound("game-over");
    setRecords((current) => {
      const next = {
        bestScore: Math.max(current.bestScore, state.run.totalScore),
        lastScore: state.run.totalScore
      };
      saveHomeRecords(next);
      return next;
    });
  }, [showGameOverOverlay, state.run.gameOver, state.run.totalScore]);

  useEffect(() => {
    if (scoreAnimationFrameRef.current !== null) {
      cancelAnimationFrame(scoreAnimationFrameRef.current);
      scoreAnimationFrameRef.current = null;
    }

    const from = displayScoreRef.current;
    const to = state.run.totalScore;
    if (from === to) {
      setDisplayScore(to);
      return;
    }

    const durationMs = Math.min(900, Math.max(260, Math.abs(to - from) * 2));
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      const nextValue = Math.round(from + (to - from) * eased);

      displayScoreRef.current = nextValue;
      setDisplayScore(nextValue);

      if (progress < 1) {
        scoreAnimationFrameRef.current = requestAnimationFrame(tick);
      } else {
        scoreAnimationFrameRef.current = null;
        displayScoreRef.current = to;
        setDisplayScore(to);
      }
    };

    scoreAnimationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (scoreAnimationFrameRef.current !== null) {
        cancelAnimationFrame(scoreAnimationFrameRef.current);
        scoreAnimationFrameRef.current = null;
      }
    };
  }, [state.run.totalScore]);

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
        state.dice.values.map((value, index) =>
          rollingDiceMask[index] ? randomDisplayDie() : current[index] ?? value
        )
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
      if (gameOverOverlayTimeoutRef.current !== null) {
        window.clearTimeout(gameOverOverlayTimeoutRef.current);
      }
      if (scoreAnimationFrameRef.current !== null) {
        cancelAnimationFrame(scoreAnimationFrameRef.current);
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
        const next = finishFarkleTurn(current);
        const rollMask = current.dice.values.map((_, index) => !current.dice.disabled[index]);

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
      const activeValues = state.dice.values.filter((_, diceIndex) => !state.dice.locked[diceIndex] && !state.dice.disabled[diceIndex]);
      const patternValues = [...activeValues, ...getLockedPheonixValues(state.dice)];
      const counts = getCounts(patternValues);
      const clickedValue = state.dice.values[index];
      const unlockedIndices = state.dice.values
        .map((_, diceIndex) => diceIndex)
        .filter((diceIndex) => !state.dice.locked[diceIndex] && !state.dice.disabled[diceIndex]);
      const clickedValueScoresAlone =
        clickedValue === 1 ||
        clickedValue === 5 ||
        (getJokerCount(state, "odd-choice") > 0 && clickedValue === 3);

      let pulseIndices: number[] = [];
      if (
        !holdEmSelectionConflict &&
        !clickedValueScoresAlone &&
        (isStraight(patternValues) ||
          isThreePairs(patternValues) ||
          (getJokerCount(state, "discount") > 0 &&
            ([1, 2, 3, 4, 5].every((value) => patternValues.includes(value)) ||
              [2, 3, 4, 5, 6].every((value) => patternValues.includes(value)))))
      ) {
        pulseIndices = unlockedIndices;
      } else if (
        !holdEmSelectionConflict &&
        !clickedValueScoresAlone &&
        counts[clickedValue] >= 3
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
    const selectedSnakeEyesStarted =
      getSelectedValues(state).filter((value) => value === 1).length < 2 &&
      getSelectedValues(next).filter((value) => value === 1).length >= 2;
    const spartaStarted =
      getJokerCount(state, "sparta") > 0 &&
      state.dice.values.filter((_, diceIndex) => !state.dice.locked[diceIndex] && !state.dice.disabled[diceIndex]).length === 1 &&
      !state.dice.selected[index] &&
      next.dice.selected[index] &&
      calculateSelectedScore(next).valid;
    setState(next);
    if (selectionChanged) {
      const selectedCount = next.dice.selected.filter(Boolean).length;
      const previousSelectedCount = state.dice.selected.filter(Boolean).length;
      const selectedMoreDice = selectedCount > previousSelectedCount;
      if (selectedTripletStarted) {
        triggerEffectiveJokerEffect("triplet");
      }
      if (discountComboStarted) {
        triggerEffectiveJokerEffect("discount");
      }
      if (selectedSnakeEyesStarted) {
        triggerEffectiveJokerEffect("snake-eyes");
      }
      if (spartaStarted) {
        triggerEffectiveJokerEffect("sparta");
      }
      if (selectedMoreDice && state.flags.feverCharges > 0) {
        triggerEffectiveJokerEffect("fever");
      }
      if (state.dice.rollCount > 1) {
        const greedyMultiplier = getGreedyMultiplier(state.dice.rollCount);
        triggerEffectiveJokerEffect("greedy", formatGreedyMultiplierLabel(greedyMultiplier));
      }
      if (selectedMoreDice && state.jokers.includes("duality") && state.flags.dualityStacks.original > 0) {
        triggerJokerEffect("duality", getDualityMultiplierLabel(state.flags.dualityStacks.original));
      }
      if (selectedMoreDice && activePortraitCopy === "duality" && state.flags.dualityStacks.portrait > 0) {
        triggerJokerEffect("the-portrait", getDualityMultiplierLabel(state.flags.dualityStacks.portrait));
      }
      if (selectedMoreDice && getJokerCount(state, "big-risk") > 0 && state.dice.rollCount >= 4) {
        triggerEffectiveJokerEffect("big-risk");
      }
      const selectSoundStep = selectedMoreDice
        ? selectSoundStepRef.current + 1
        : Math.max(0, selectSoundStepRef.current - 1);
      selectSoundStepRef.current = selectedCount === 0 ? 0 : selectSoundStep;
      playUiSound("select", { step: selectSoundStep });
    }
  };

  const onAttack = () => {
    if (attackCanBank) {
      suppressNextDamageDeltaRef.current = true;
      const next = hasSelectedScore ? confirmSelection(state) : state;
      const pocketChangeActivated = getJokerCount(next, "pocket-change") > 0 && next.dice.rollCount <= 3;
      const banked = bankScore(next);
      playUiSound("click");
      if (pocketChangeActivated) {
        triggerEffectiveJokerEffect("pocket-change");
      }

      if (banked.shop.open || banked.run.gameOver) {
        apply(banked, "attack");
        return;
      }

      if (rollTimeoutRef.current !== null) {
        window.clearTimeout(rollTimeoutRef.current);
      }

      const rollMask = banked.dice.values.map((_, index) => !banked.dice.disabled[index]);
      setState(banked);
      setRollingDiceMask(rollMask);
      setRollingDiceValues(banked.dice.values.map(() => randomDisplayDie()));
      setIsRolling(true);
      playUiSound("attack");
      playUiSound("roll");
      rollTimeoutRef.current = window.setTimeout(() => {
        setIsRolling(false);
        setRollingDiceMask([]);
        setRollingDiceValues([]);
        rollTimeoutRef.current = null;
      }, ROLL_ANIMATION_MS);
    }
  };

  const finishRollAfterAnimation = (
    rolledState: SaveData,
    rollMask: boolean[],
    options: { beforeRollCount?: number; beforeState?: SaveData; triggerMomentumOnResolvedRoll?: boolean } = {}
  ) => {
    const triggerRollCompleteEffects = (before: SaveData, after: SaveData) => {
      if (options.triggerMomentumOnResolvedRoll) {
        triggerMomentumRollActivation(before, after);
      }
      if (options.beforeRollCount !== undefined) {
        triggerBigRiskActivation(before, after);
      }
    };

    const finishResolvedRoll = (before: SaveData, after: SaveData) => {
      const applyResolvedRoll = (triggerFarkleEffects = true) => {
        setFarkleResolving(false);
        setIsRolling(false);
        setRollingDiceMask([]);
        setRollingDiceValues([]);
        setState(after);
        if (triggerFarkleEffects) {
          triggerFarkleJokerEffects(before, after);
        }
        triggerRollCompleteEffects(before, after);
        rollTimeoutRef.current = null;
      };

      applyResolvedRoll();
    };

    const myBadAnimationQueue: JokerId[] = [
      ...(rolledState.jokers.includes("my-bad") ? (["my-bad"] as JokerId[]) : []),
      ...(getActivePortraitCopy(rolledState) === "my-bad" ? (["the-portrait"] as JokerId[]) : [])
    ];

    if (myBadAnimationQueue.length <= 0) {
      setIsRolling(false);
      setRollingDiceMask([]);
      setRollingDiceValues([]);
      finishResolvedRoll(options.beforeState ?? rolledState, rolledState);
      return;
    }

    const nonScoringIndicesFor = (candidate: SaveData) => {
      const scoringIndicesAfterRoll = getScoringIndices(
        candidate.dice.values,
        candidate.dice.locked,
        candidate.run.currentBoss,
        getJokerCount(candidate, "discount") > 0,
        candidate.dice.disabled,
        getJokerCount(candidate, "hold-em") > 0,
        getJokerCount(candidate, "odd-choice") > 0,
        candidate.dice.types
      );
      return candidate.dice.values
        .map((_, index) => index)
        .filter((index) => rollMask[index] && !candidate.dice.locked[index] && !candidate.dice.disabled[index] && !scoringIndicesAfterRoll.has(index));
    };

    const finishMyBadChain = (current: SaveData) => {
      const activeValuesAfterReroll = current.dice.values.filter((_, index) => !current.dice.locked[index] && !current.dice.disabled[index]);
      const finalState = hasAnyScoringDice(
        activeValuesAfterReroll,
        current.run.currentBoss,
        getJokerCount(current, "discount") > 0,
        getJokerCount(current, "hold-em") > 0,
        getJokerCount(current, "odd-choice") > 0,
        getLockedPheonixValues(current.dice)
      )
        ? current
        : handleFarkle(current);
      setIsRolling(false);
      setIsMyBadRerollPending(false);
      setRollingDiceMask([]);
      setRollingDiceValues([]);
      finishResolvedRoll(current, finalState);
    };

    const runMyBadReroll = (current: SaveData, remainingAnimations: JokerId[]) => {
      const nonScoringIndices = nonScoringIndicesFor(current);
      if (remainingAnimations.length <= 0 || nonScoringIndices.length === 0) {
        finishMyBadChain(current);
        return;
      }

      const rerollIndex = nonScoringIndices[Math.floor(Math.random() * nonScoringIndices.length)];
      const [animationJokerId, ...nextAnimations] = remainingAnimations;
      triggerJokerEffect(animationJokerId);
      const rerolledState = rerollSingleDieValue(current, rerollIndex);
      rerolledState.log.unshift({ id: makeId(), text: `My bad rerolled die ${rerollIndex + 1}.`, tone: "good" });
      rerolledState.updatedAt = Date.now();

      setState(current);
      setIsRolling(false);
      setIsMyBadRerollPending(true);
      setRollingDiceMask([]);
      setRollingDiceValues([]);
      rollTimeoutRef.current = window.setTimeout(() => {
        setRollingDiceMask(current.dice.values.map((_, index) => index === rerollIndex));
        setRollingDiceValues(current.dice.values);
        setIsRolling(true);
        setIsMyBadRerollPending(false);
        playUiSound("roll");
        rollTimeoutRef.current = window.setTimeout(() => {
          setIsRolling(false);
          setRollingDiceMask([]);
          setRollingDiceValues([]);
          runMyBadReroll(rerolledState, nextAnimations);
        }, ROLL_ANIMATION_MS);
      }, MY_BAD_REROLL_DELAY_MS);
    };

    runMyBadReroll(rolledState, myBadAnimationQueue);
  };

  const onRoll = () => {
    if (isRolling || isMyBadRerollPending) {
      return;
    }

    if (hasSelectedScore) {
      const scoredState = confirmSelection(state);
      triggerConfirmJokerEffects(state, scoredState, { triggerMomentum: false });
      allowNextHotDiceOverlayRef.current = scoredState.dice.hotDice;
      const allUnavailable = scoredState.dice.locked.every((locked, index) => locked || scoredState.dice.disabled[index]);
      const deferFarkle = getJokerCount(scoredState, "my-bad") > 0;
      const next = rollDice(scoredState, { deferFarkle });
      const wakeUpActivated = next.log.some(
        (entry) => !scoredState.log.some((previous) => previous.id === entry.id) && entry.text.startsWith("Wake Up reactivated")
      );
      const rollMask = wakeUpActivated
        ? scoredState.dice.values.map(() => true)
        : scoredState.dice.locked.map(
            (locked, index) =>
              (!scoredState.dice.disabled[index] && (allUnavailable || !locked)) ||
              (scoredState.dice.disabled[index] && !next.dice.disabled[index])
          );
      const visibleRollMask = rollMask.map((rolling, index) => rolling && !isFixedAnchorDie(scoredState, index));
      triggerWakeUpActivation(scoredState, next);
      triggerFaustianBargainActivation(scoredState, next);
      const momentumTriggeredImmediately = triggerMomentumRollActivation(scoredState, next);

      setState(scoredState);
      setRollingDiceMask(visibleRollMask);
      setRollingDiceValues(
        scoredState.dice.values.map((value, index) => (visibleRollMask[index] ? randomDisplayDie() : value))
      );
      setIsRolling(true);
      playUiSound("click");
      playUiSound("roll");
      rollTimeoutRef.current = window.setTimeout(() => {
        finishRollAfterAnimation(next, rollMask, {
          beforeRollCount: scoredState.dice.rollCount,
          beforeState: scoredState,
          triggerMomentumOnResolvedRoll: deferFarkle && !momentumTriggeredImmediately
        });
      }, ROLL_ANIMATION_MS);
      return;
    }

    const beforeRollCount = state.dice.rollCount;
    const allUnavailable = state.dice.locked.every((locked, index) => locked || state.dice.disabled[index]);
    const deferFarkle = getJokerCount(state, "my-bad") > 0;
    const next = rollDice(state, { deferFarkle });
    const wakeUpActivated = next.log.some(
      (entry) => !state.log.some((previous) => previous.id === entry.id) && entry.text.startsWith("Wake Up reactivated")
    );
    const rollMask = wakeUpActivated
      ? state.dice.values.map(() => true)
      : state.dice.locked.map(
          (locked, index) =>
            (!state.dice.disabled[index] && (allUnavailable || !locked)) ||
            (state.dice.disabled[index] && !next.dice.disabled[index])
    );
    const visibleRollMask = rollMask.map((rolling, index) => rolling && !isFixedAnchorDie(state, index));
    triggerWakeUpActivation(state, next);
    triggerFaustianBargainActivation(state, next);
    const momentumTriggeredImmediately = triggerMomentumRollActivation(state, next);

    setRollingDiceMask(visibleRollMask);
    setRollingDiceValues(
      state.dice.values.map((value, index) => (visibleRollMask[index] ? randomDisplayDie() : value))
    );
    setIsRolling(true);
    playUiSound("click");
    playUiSound("roll");
    rollTimeoutRef.current = window.setTimeout(() => {
      finishRollAfterAnimation(next, rollMask, {
        beforeRollCount,
        beforeState: state,
        triggerMomentumOnResolvedRoll: deferFarkle && !momentumTriggeredImmediately
      });
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
    lastCleanSweepLogIdRef.current = null;
    previousRoundScoreRef.current = 0;
    setDisplayMoney(next.run.money);
    setDisplayTurns(next.run.turnsLeft);
    setRewardPopups([]);
    setRewardAnimationCompleteLogId(null);
    rewardAnimationLogIdRef.current = null;
    rewardTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    rewardTimeoutsRef.current = [];
    cleanSweepTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    cleanSweepTimeoutsRef.current = [];
    if (cleanSweepAnimationFrameRef.current !== null) {
      cancelAnimationFrame(cleanSweepAnimationFrameRef.current);
      cleanSweepAnimationFrameRef.current = null;
    }
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
      const next = nextRound(stateRef.current);
      stateRef.current = next;
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
    normalizePortraitCopy(next);
    next.run.money += salePrice;
    next.log.unshift({ id: makeId(), text: `Sold ${joker.name} for $${salePrice}.`, tone: "good" });
    next.updatedAt = Date.now();

    setPendingJokerSaleIndex(null);
    stateRef.current = next;
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
    const level = getFaceUpgradeLevel(state.upgrades, upgradeId);
    const currentScale = getFaceUpgradeScale(state.upgrades, upgradeId);
    return {
      name: `LV.${level + 1} ${upgrade?.name ?? "number"}`,
      description: `multiply 2.\n Current scale : x${currentScale.toFixed(1)}`
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
        <strong className="score-value">{formatScore(displayScore)}</strong>
        <span className="score-side">Round {state.run.round}</span>
      </section>

      {marketVisible ? (
        <section className={`market-panel frame ${marketEntering ? "entering" : ""} ${marketLeaving ? "leaving" : ""}`}>
          <h1>MARKET</h1>
        </section>
      ) : (
        <section className="enemy-panel frame">
          <div
            className={`portrait-box boss-${bossId} boss-tone-${bossTone} ${bossDyingShown || bossDeadShown ? "dead" : ""} ${bossDyingShown && !bossDeadShown ? "dying" : ""} ${healthHit ? "hit" : ""}`}
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
            <strong
              className={`damage-value ${damageDisplay.lines.length > 1 ? "wrapped" : ""} ${damageDanger ? "danger" : ""}`}
              style={damageValueStyle}
              aria-label={damageDisplay.text}
            >
              {damageDisplay.lines.map((line, index) => (
                <span key={`${index}-${line}`} className="damage-value-line" aria-hidden="true">
                  {line}
                </span>
              ))}
            </strong>
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
            const portraitCopyId = jokerId === "the-portrait" ? activePortraitCopy : null;
            const jokerImagePath = jokerId ? getJokerImagePath(jokerId, `slot-${index}`) : null;
            const portraitCopiedImagePath =
              portraitCopyId
                ? getJokerImagePath(portraitCopyId, `portrait-copy-slot-${index}`)
                : null;
            const jokerArtwork =
              jokerId === "the-portrait" && portraitCopiedImagePath ? (
                <span className="portrait-copy-artwork" aria-hidden="true">
                  <img
                    className="relic-slot-joker-image portrait-copied-joker-image portrait-copy-base-image"
                    src={portraitCopiedImagePath}
                    alt=""
                    draggable={false}
                    onError={(event) =>
                      logJokerImageLoadFailure(event, {
                        refId: portraitCopyId,
                        context: "portrait-copied-joker",
                        slotIndex: index,
                        expectedSrc: portraitCopiedImagePath
                      })
                    }
                  />
                  {jokerImagePath ? (
                    <img
                      className="relic-slot-joker-image portrait-frame-joker-image portrait-copy-overlay-image"
                      src={jokerImagePath}
                      alt=""
                      draggable={false}
                      onError={(event) =>
                        logJokerImageLoadFailure(event, {
                          refId: jokerId,
                          context: "portrait-frame-joker",
                          slotIndex: index,
                          expectedSrc: jokerImagePath
                        })
                      }
                    />
                  ) : null}
                </span>
              ) : jokerImagePath ? (
                <img
                  className="relic-slot-joker-image"
                  src={jokerImagePath}
                  alt=""
                  draggable={false}
                  onError={(event) =>
                    logJokerImageLoadFailure(event, {
                      refId: jokerId,
                      context: "joker-slot",
                      slotIndex: index,
                      expectedSrc: jokerImagePath
                    })
                  }
                />
              ) : null;
            const jokerEffect = jokerId
              ? activeJokerEffects.filter((effect) => effect.jokerId === jokerId).at(-1) ?? null
              : null;
            const jokerName = jokerId ? JOKERS.find((joker) => joker.id === jokerId)?.name ?? "joker" : "joker";
            const salePending = pendingJokerSaleIndex === index && !!jokerId;
            const canSellJoker = marketVisible && !rewardAnimating && !marketLeaving && !pendingJokerSaleId && !!jokerId;
            const effectiveInactiveJokerId = jokerId === "the-portrait" ? activePortraitCopy : jokerId;
            const bandAidInactive =
              !state.run.cleared &&
              ((jokerId === "band-aid" && state.flags.bandAidUsesRound >= 1) ||
                (jokerId === "the-portrait" && activePortraitCopy === "band-aid" && state.flags.bandAidUsesRound >= 2));
            const dualityInactive =
              (jokerId === "duality" && state.flags.dualityStacks.original <= 0) ||
              (jokerId === "the-portrait" && activePortraitCopy === "duality" && state.flags.dualityStacks.portrait <= 0);
            const inactive =
              bandAidInactive ||
              dualityInactive ||
              (effectiveInactiveJokerId === "big-risk" && state.dice.rollCount < 4) ||
              (effectiveInactiveJokerId === "double-or-nothing" && state.run.turnNumber !== 1) ||
              (effectiveInactiveJokerId === "fever" && state.flags.feverCharges <= 0) ||
              (effectiveInactiveJokerId === "overtime" && state.run.turnsLeft !== 1) ||
              (effectiveInactiveJokerId === "pocket-change" && (state.dice.rollCount >= 4 || (isRolling && state.dice.rollCount >= 3)));
            const slotClassName = `board-slot relic-slot ${jokerId ? "filled" : "empty"} ${jokerId === "the-portrait" ? "portrait-slot" : ""} ${portraitCopyId ? "portrait-copy-slot" : ""} ${inactive ? "inactive" : ""} ${jokerEffect ? "joker-effect" : ""} ${salePending ? "sell-pending" : ""} ${canSellJoker ? "sellable" : ""}`;
            const multiplierLabel =
              jokerId === "greedy" ||
              jokerId === "duality" ||
              (jokerId === "the-portrait" && (activePortraitCopy === "greedy" || activePortraitCopy === "duality"));
            const labelClassName = `joker-effect-label ${multiplierLabel ? "greedy-effect-label" : ""}`;
            return canSellJoker ? (
              <button
                key={`item-${index}-${jokerEffect?.key ?? "idle"}`}
                type="button"
                className={slotClassName}
                onClick={() => onJokerSlotClick(index)}
                aria-label={`Sell ${jokerName}`}
              >
                {jokerArtwork}
                {jokerEffect?.label ? <span className={labelClassName}>{jokerEffect.label}</span> : null}
              </button>
            ) : (
              <div
                key={`item-${index}-${jokerEffect?.key ?? "idle"}`}
                className={slotClassName}
              >
                {jokerArtwork}
                {jokerEffect?.label ? <span className={labelClassName}>{jokerEffect.label}</span> : null}
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
                  const jokerImagePath = item.kind === "joker" ? getJokerImagePath(item.refId, "market-item") : null;
                  const itemPrice =
                    item.kind === "hand-upgrade" ? getFaceUpgradePrice(state.upgrades, item.refId as UpgradeId) : item.price;
                  const disabled =
                    rewardAnimating ||
                    marketLeaving ||
                    !!pendingJokerSaleId ||
                    item.purchased ||
                    state.run.money < itemPrice ||
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
                        <em>${itemPrice}</em>
                      </span>
                      {jokerImagePath ? (
                        <img
                          className="market-item-joker-image"
                          src={jokerImagePath}
                          alt=""
                          draggable={false}
                          onError={(event) =>
                            logJokerImageLoadFailure(event, {
                              refId: item.refId,
                              context: "market-item",
                              expectedSrc: jokerImagePath
                            })
                          }
                        />
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
          {choosingDieUpgrade ? (
            <div className="hot-dice-overlay choose-die-overlay" aria-live="polite">
              Select a die
            </div>
          ) : null}
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
            const canSelectScoringDice =
              !choosingDieUpgrade &&
              !isRolling &&
              !isMyBadRerollPending &&
              !farkleResolving &&
              !state.run.gameOver &&
              !marketOpen;
            const selected = !choosingDieUpgrade && !farkleResolving && !rolling && state.dice.selected[index];
            const locked = !choosingDieUpgrade && !farkleResolving && !rolling && state.dice.locked[index];
            const disabled = !choosingDieUpgrade && !farkleResolving && !rolling && state.dice.disabled[index];
            const scoring = canSelectScoringDice && scoringIndices.has(index);
            const dieDeltaPopups = damageDeltaPopups.filter((popup) => popup.dieIndex === index);
            const pressing = diePressPulses.some((pulse) => pulse.dieIndex === index);
            const dieImagePath = getBoardDieImagePath(state, index);
            const chargedUsed = state.dice.types[index] === "charged" && state.dice.chargedUsed?.[index] === true;
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
                <span
                  className="die-image"
                  style={dieSpriteStyle(value, dieImagePath, chargedUsed ? 4 : 2, chargedUsed ? 2 : 0)}
                  aria-hidden="true"
                />
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

      {showGameOverOverlay ? (
        <section className="game-over-overlay" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
          <div className="game-over-card frame">
            <h2 id="game-over-title">Game Over</h2>
            <div className="game-over-stats">
              <article>
                <span>Score</span>
                <strong>{formatScore(state.run.totalScore)}</strong>
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
