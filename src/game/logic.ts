import type {
  BossId,
  BossTone,
  DiceState,
  JokerId,
  LogEntry,
  RewardBreakdownItem,
  SaveData,
  ScoreBreakdown,
  ShopItem,
  SpecialDieId,
  UpgradeId,
  UpgradeState
} from "../types";
import { BOSSES, JOKERS, SAVE_VERSION, SPECIAL_DICE, TARGETS, TURN_LIMIT, UPGRADES } from "./constants";
import { cloneState, makeId } from "./platform";

function randomDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

const WILD_DIE_FACES = [1, 1, 2, 3, 4, 5, 5, 6];

type ForesightNext = Array<number | null>;

interface DiceRollResult {
  values: number[];
  foresightNext: ForesightNext;
  anchorFixed: boolean[];
}

function emptyForesightNext(): ForesightNext {
  return Array(6).fill(null);
}

function isValidDieFace(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6;
}

function normalizeForesightNext(values?: unknown[]): ForesightNext {
  return Array.from({ length: 6 }, (_, index) => {
    const value = values?.[index];
    return isValidDieFace(value) ? value : null;
  });
}

function normalizeAnchorFixed(values?: unknown[]): boolean[] {
  return Array.from({ length: 6 }, (_, index) => values?.[index] === true);
}

function normalizeChargedUsed(values?: unknown[]): boolean[] {
  return Array.from({ length: 6 }, (_, index) => values?.[index] === true);
}

function normalizeNumberArray(values: unknown[] | undefined, length: number): number[] {
  return Array.from({ length }, (_, index) => {
    const value = values?.[index];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  });
}

function randomDieForType(type: SpecialDieId, foresightValue: number | null = null): number {
  if (type === "foresight" && foresightValue !== null) {
    return foresightValue;
  }
  if (type === "wild") {
    return WILD_DIE_FACES[Math.floor(Math.random() * WILD_DIE_FACES.length)];
  }
  return randomDie();
}

function rollDiceValues(
  types: SpecialDieId[] = basicDiceTypes(),
  foresightNext: unknown[] = emptyForesightNext(),
  rollMask: boolean[] = Array(6).fill(true),
  currentValues: number[] = [],
  currentAnchorFixed: unknown[] = Array(6).fill(false),
  oddChoice = false
): DiceRollResult {
  const normalizedForesightNext = normalizeForesightNext(foresightNext);
  const normalizedAnchorFixed = normalizeAnchorFixed(currentAnchorFixed);
  const nextForesight = Array.from({ length: 6 }, (_, index) =>
    (types[index] ?? "basic") === "foresight" ? normalizedForesightNext[index] : null
  );
  const nextAnchorFixed = Array.from({ length: 6 }, (_, index) =>
    (types[index] ?? "basic") === "anchor" && normalizedAnchorFixed[index]
  );
  const values = Array.from({ length: 6 }, (_, index) => {
    const type = types[index] ?? "basic";
    if (!rollMask[index]) {
      return currentValues[index] ?? randomDieForType(type, nextForesight[index]);
    }

    if (type === "anchor" && nextAnchorFixed[index] && isValidDieFace(currentValues[index])) {
      nextAnchorFixed[index] = false;
      return currentValues[index];
    }

    const value = randomDieForType(type, nextForesight[index]);
    nextForesight[index] = type === "foresight" ? randomDie() : null;
    nextAnchorFixed[index] = type === "anchor" && (value === 1 || value === 5 || (oddChoice && value === 3));
    return value;
  });

  return { values, foresightNext: nextForesight, anchorFixed: nextAnchorFixed };
}

function randomDiceValues(types: SpecialDieId[] = basicDiceTypes()): number[] {
  return rollDiceValues(types).values;
}

function basicDiceTypes(): SpecialDieId[] {
  return Array(6).fill("basic");
}

function randomScoringDiceRoll(
  _boss: BossId | null,
  discount: boolean,
  holdEm = false,
  oddChoice = false,
  types: SpecialDieId[] = basicDiceTypes(),
  foresightNext: unknown[] = emptyForesightNext(),
  activeMask: boolean[] = Array(6).fill(true),
  currentValues: number[] = [],
  currentAnchorFixed: unknown[] = Array(6).fill(false)
): DiceRollResult {
  const normalizedForesightNext = normalizeForesightNext(foresightNext);
  const normalizedAnchorFixed = normalizeAnchorFixed(currentAnchorFixed);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const roll = rollDiceValues(types, normalizedForesightNext, activeMask, currentValues, normalizedAnchorFixed, oddChoice);
    const active = roll.values.filter((_, index) => activeMask[index]);
    if (hasAnyScoringDice(active, null, discount, holdEm, oddChoice)) {
      return roll;
    }
  }

  const fallback = rollDiceValues(types, normalizedForesightNext, activeMask, currentValues, normalizedAnchorFixed, oddChoice);
  const firstFlexibleActiveIndex = activeMask.findIndex((active, index) => {
    const type = types[index] ?? "basic";
    return active && type !== "anchor" && (type !== "foresight" || normalizedForesightNext[index] === null);
  });
  if (firstFlexibleActiveIndex >= 0) {
    fallback.values[firstFlexibleActiveIndex] = 1;
  }
  return fallback;
}

function makeLog(text: string, tone: LogEntry["tone"] = "neutral"): LogEntry {
  return { id: makeId(), text, tone };
}

export function getJokerCount(state: SaveData, jokerId: JokerId): number {
  const ownedCount = state.jokers.includes(jokerId) ? 1 : 0;
  const copiedCount = getActivePortraitCopy(state) === jokerId ? 1 : 0;
  return ownedCount + copiedCount;
}

function hasJoker(state: SaveData, jokerId: JokerId): boolean {
  return getJokerCount(state, jokerId) > 0;
}

function hasOwnedJoker(state: SaveData, jokerId: JokerId): boolean {
  return state.jokers.includes(jokerId);
}

export function getActivePortraitCopy(state: SaveData): JokerId | null {
  const copiedJoker = state.flags.portraitCopiedJoker;
  if (
    !copiedJoker ||
    copiedJoker === "the-portrait" ||
    !state.jokers.includes("the-portrait") ||
    !state.jokers.includes(copiedJoker)
  ) {
    return null;
  }

  return copiedJoker;
}

export function normalizePortraitCopy(state: SaveData): SaveData {
  if (state.flags.portraitCopiedJoker && !getActivePortraitCopy(state)) {
    state.flags.portraitCopiedJoker = null;
  }

  return state;
}

function choosePortraitCopy(state: SaveData): JokerId | null {
  if (!state.jokers.includes("the-portrait")) {
    return null;
  }

  const candidates = state.jokers.filter((jokerId) => jokerId !== "the-portrait");
  if (candidates.length === 0) {
    return null;
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

function tryWakeUp(state: SaveData): boolean {
  let activated = false;
  for (let attempt = 0; attempt < getJokerCount(state, "wake-up"); attempt += 1) {
    const inactiveDiceCount = state.dice.disabled.filter(Boolean).length;
    const bankedDiceCount = state.dice.locked.filter(Boolean).length;
    if (inactiveDiceCount + bankedDiceCount > 0 && Math.random() < 0.15) {
      state.dice.types.forEach((type, index) => {
        if (type === "charged" && (state.dice.disabled[index] || state.dice.locked[index])) {
          state.dice.chargedUsed[index] = false;
        }
      });
      state.dice.disabled.fill(false);
      state.dice.locked.fill(false);
      state.log.unshift(makeLog(`Wake Up reactivated ${inactiveDiceCount + bankedDiceCount} dice.`, "good"));
      activated = true;
    }
  }
  return activated;
}

function tryFaustianBargain(state: SaveData): void {
  for (let attempt = 0; attempt < getJokerCount(state, "faustian-bargain"); attempt += 1) {
    if (state.run.money >= 1 && Math.random() < 0.07) {
      state.run.money -= 1;
      state.run.turnsLeft += 1;
      state.log.unshift(makeLog("Faustian Bargain spent $1 and gained +1 turn.", "good"));
    }
  }
}

function getTurnLimit(state: SaveData): number {
  return TURN_LIMIT + getJokerCount(state, "deal");
}

const FACE_UPGRADE_SCALE = 2;

export function getUpgradeFace(upgradeId: UpgradeId): number {
  if (upgradeId === "one-upgrade") {
    return 1;
  }
  if (upgradeId === "two-upgrade") {
    return 2;
  }
  if (upgradeId === "three-upgrade") {
    return 3;
  }
  if (upgradeId === "four-upgrade") {
    return 4;
  }
  if (upgradeId === "five-upgrade") {
    return 5;
  }
  return 6;
}

export function getFaceUpgradeLevel(upgrades: UpgradeState, upgradeId: UpgradeId): number {
  return upgrades.faceUpgradeLevels?.[getUpgradeFace(upgradeId)] ?? 0;
}

export function getFaceUpgradeScale(upgrades: UpgradeState, upgradeId: UpgradeId): number {
  return FACE_UPGRADE_SCALE ** getFaceUpgradeLevel(upgrades, upgradeId);
}

export function getFaceUpgradePrice(upgrades: UpgradeState, upgradeId: UpgradeId): number {
  const basePrice = UPGRADES.find((upgrade) => upgrade.id === upgradeId)?.price ?? 0;
  return basePrice * 2 ** getFaceUpgradeLevel(upgrades, upgradeId);
}

type ScoringDieRef = { value: number; index: number };

function activeDieRefs(dice: DiceState): ScoringDieRef[] {
  return dice.values
    .map((value, index) => ({ value, index }))
    .filter((die) => !dice.locked[die.index] && !dice.disabled[die.index]);
}

export function getLockedPheonixValues(dice: DiceState): number[] {
  return dice.values.filter(
    (_, index) =>
      dice.types[index] === "pheonix" &&
      dice.locked[index] &&
      !dice.disabled[index]
  );
}

function getValuesUpgradeMultiplier(
  upgrades: UpgradeState,
  values: number[],
  scholarSourceDice: ScoringDieRef[] = [],
  diceTypes: SpecialDieId[] = []
): number {
  const uniqueValues = new Set(values);
  const scholarBonusLevels = scholarSourceDice.reduce((counts, die) => {
    if (uniqueValues.has(die.value) && diceTypes[die.index] === "scholar") {
      counts[die.value] = (counts[die.value] ?? 0) + 1;
    }
    return counts;
  }, Array(7).fill(0) as number[]);
  return [...uniqueValues].reduce((multiplier, value) => {
    const level = (upgrades.faceUpgradeLevels?.[value] ?? 0) + (scholarBonusLevels[value] ?? 0);
    return multiplier * FACE_UPGRADE_SCALE ** level;
  }, 1);
}

function activeValues(dice: DiceState): number[] {
  return dice.values.filter((_, index) => !dice.locked[index] && !dice.disabled[index]);
}

function countsFor(values: number[]): number[] {
  const counts = Array(7).fill(0);
  for (const value of values) {
    counts[value] += 1;
  }
  return counts;
}

function straightScore(values: number[], discount = false): number {
  const sorted = [...values].sort((a, b) => a - b);
  const key = sorted.join(",");
  if (key === "1,2,3,4,5,6") {
    return 1500;
  }
  return discount && (key === "1,2,3,4,5" || key === "2,3,4,5,6") ? 1500 : 0;
}

function threePairsScore(values: number[]): number {
  const counts = countsFor(values).slice(1).filter(Boolean).sort((a, b) => a - b);
  return counts.length === 3 && counts.every((count) => count === 2) ? 1500 : 0;
}

function fullHouseScore(values: number[]): number {
  const counts = countsFor(values).slice(1).filter(Boolean).sort((a, b) => a - b);
  return counts.length === 2 && counts[0] === 2 && counts[1] === 3 ? 1500 : 0;
}

function hasTwoPairs(values: number[]): boolean {
  return countsFor(values).filter((count) => count === 2).length >= 2;
}

function getHoldEmScoringIndices(
  values: number[],
  locked: boolean[],
  disabled: boolean[],
  diceTypes: SpecialDieId[]
): Set<number> {
  const activeDice = values
    .map((value, index) => ({ value, index }))
    .filter((die) => !locked[die.index] && !disabled[die.index]);
  const lockedPheonixValues = values.filter(
    (_, index) =>
      diceTypes[index] === "pheonix" &&
      locked[index] &&
      !disabled[index]
  );
  const indices = new Set<number>();

  for (let mask = 1; mask < 2 ** activeDice.length; mask += 1) {
    const selectedDice = activeDice.filter((_, activeIndex) => (mask & (1 << activeIndex)) !== 0);
    const patternValues = [...selectedDice.map((die) => die.value), ...lockedPheonixValues];
    const isFullHouse = fullHouseScore(patternValues) > 0;
    const isTwoPairs = patternValues.length === 4 && hasTwoPairs(patternValues);
    if (!isFullHouse && !isTwoPairs) {
      continue;
    }

    selectedDice.forEach((die) => indices.add(die.index));
  }

  return indices;
}

function snakeEyesBonusScore(
  state: SaveData,
  selectedIndices: Array<{ value: number; index: number }>,
  singleOneScoreAlreadyCounted: number
): number {
  const snakeEyesCount = getJokerCount(state, "snake-eyes");
  if (snakeEyesCount <= 0) {
    return 0;
  }

  const oneIndices = selectedIndices.filter((die) => die.value === 1).map((die) => die.index);
  if (oneIndices.length !== 2) {
    return 0;
  }

  const targetMultiplier = 4 ** snakeEyesCount;
  const upgradeMultiplier = getValuesUpgradeMultiplier(state.upgrades, [1], activeDieRefs(state.dice), state.dice.types);
  if (singleOneScoreAlreadyCounted > 0) {
    return singleOneScoreAlreadyCounted * (targetMultiplier - 1);
  }

  return Math.round(200 * (targetMultiplier - 1) * upgradeMultiplier);
}

export function getGreedyMultiplier(rollCount: number): number {
  return Math.round((1.2 ** Math.max(0, rollCount - 1)) * 10) / 10;
}

export function getTargetForRound(round: number): number {
  if (round <= TARGETS.length) {
    return TARGETS[round - 1];
  }

  const overflow = round - TARGETS.length;
  return Math.round(TARGETS[TARGETS.length - 1] * 1.35 ** overflow);
}

const BOSS_CYCLE: BossId[] = [
  "bone-croupier",
  "broken-cup",
  "dry-table",
  "tax-collector",
  "bitter-five",
  "heavy-bones",
  "poor-house"
];
const BOSS_TONES: BossTone[] = ["base", "blue", "red", "green", "purple", "gold", "ashen"];
const RANDOM_BOSS_TONES: BossTone[] = ["red", "green", "purple", "gold", "ashen"];

export function getBossForRound(round: number): BossId | null {
  if (round <= BOSS_CYCLE.length * 2) {
    return BOSS_CYCLE[Math.floor((round - 1) / 2)];
  }

  return BOSS_CYCLE[Math.floor(Math.random() * BOSS_CYCLE.length)];
}

export function getBossToneForRound(round: number): BossTone {
  if (round <= BOSS_CYCLE.length * 2) {
    return (round - 1) % 2 === 1 ? "blue" : "base";
  }

  return RANDOM_BOSS_TONES[Math.floor(Math.random() * RANDOM_BOSS_TONES.length)];
}

function randomBossDescriptionIndex(boss: BossId | null): number {
  return boss ? Math.floor(Math.random() * BOSSES[boss].descriptions.length) : 0;
}

function validBossDescriptionIndex(boss: BossId | null, index: number | undefined): number {
  return boss && Number.isInteger(index) && index !== undefined && index >= 0 && index < BOSSES[boss].descriptions.length
    ? index
    : randomBossDescriptionIndex(boss);
}

function validBossTone(tone: BossTone | undefined, round: number): BossTone {
  return tone && BOSS_TONES.includes(tone) ? tone : getBossToneForRound(round);
}

export function createInitialState(): SaveData {
  const now = Date.now();
  const currentBoss = getBossForRound(1);
  const currentBossTone = getBossToneForRound(1);
  const openingRoll = randomScoringDiceRoll(currentBoss, false);
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    run: {
      round: 1,
      targetScore: getTargetForRound(1),
      totalScore: 0,
      roundScore: 0,
      bossKillScore: 0,
      turnScore: 0,
      turnsLeft: TURN_LIMIT,
      turnNumber: 1,
      money: 3,
      gameOver: false,
      cleared: false,
      currentBoss,
      currentBossTone,
      bossDescriptionIndex: randomBossDescriptionIndex(currentBoss),
      lastRewardBreakdown: []
    },
    dice: {
      values: openingRoll.values,
      types: basicDiceTypes(),
      foresightNext: openingRoll.foresightNext,
      anchorFixed: openingRoll.anchorFixed,
      chargedUsed: Array(6).fill(false),
      disabled: Array(6).fill(false),
      selected: Array(6).fill(false),
      locked: Array(6).fill(false),
      rollCount: 1,
      hotDice: false,
      canRerollSingle: true,
      canFlipSingle: true,
      awaitingAction: true
    },
    jokers: [],
    upgrades: {
      faceUpgradeLevels: Array(7).fill(0),
      dieFaceBonuses: Array(7).fill(0)
    },
    shop: {
      items: [],
      open: false
    },
    meta: {
      bestRound: 1,
      totalRuns: 1
    },
    log: [makeLog("Run started. Roll the bones.", "good")],
    flags: {
      bandAidUsesRound: 0,
      feverCharges: 0,
      successfulScoresThisTurn: 0,
      hadFarkleRound: false,
      portraitCopiedJoker: null,
      dualityStacks: {
        original: 0,
        portrait: 0
      }
    }
  };
}

export function migrateSave(save: SaveData | null): SaveData {
  if (!save) {
    return createInitialState();
  }

  const initial = createInitialState();
  const currentBoss = save.run.currentBoss ?? initial.run.currentBoss;
  const savedRun = save.run as Partial<SaveData["run"]>;
  const legacyFlags = save.flags as Partial<SaveData["flags"]> & { bandAidUsedRound?: boolean };
  return normalizePortraitCopy({
    ...createInitialState(),
    ...save,
    upgrades: {
      ...initial.upgrades,
      ...save.upgrades,
      faceUpgradeLevels: normalizeNumberArray(save.upgrades.faceUpgradeLevels, 7),
      dieFaceBonuses: normalizeNumberArray(save.upgrades.dieFaceBonuses, 7)
    },
    dice: {
      ...initial.dice,
      ...save.dice,
      types: (save.dice.types ?? initial.dice.types).map((type) =>
        (type as string) === "odd" ? "wild" : type
      ),
      foresightNext: normalizeForesightNext(save.dice.foresightNext ?? initial.dice.foresightNext),
      anchorFixed: normalizeAnchorFixed(save.dice.anchorFixed ?? initial.dice.anchorFixed),
      chargedUsed: normalizeChargedUsed(save.dice.chargedUsed ?? initial.dice.chargedUsed),
      disabled: save.dice.disabled ?? initial.dice.disabled
    },
    run: {
      ...initial.run,
      ...save.run,
      totalScore: save.run.totalScore ?? save.run.roundScore ?? initial.run.totalScore,
      currentBossTone: validBossTone(savedRun.currentBossTone, save.run.round ?? initial.run.round),
      bossDescriptionIndex: validBossDescriptionIndex(currentBoss, save.run.bossDescriptionIndex),
      lastRewardBreakdown: save.run.lastRewardBreakdown ?? initial.run.lastRewardBreakdown
    },
    shop: {
      ...initial.shop,
      ...save.shop,
      items: (save.shop.items ?? initial.shop.items).map((item) =>
        item.kind === "special-die" && (item.refId as string) === "odd"
          ? { ...item, refId: "wild" }
          : item
      )
    },
    flags: {
      ...initial.flags,
      ...save.flags,
      bandAidUsesRound:
        save.flags.bandAidUsesRound ??
        (legacyFlags.bandAidUsedRound ? 1 : 0),
      portraitCopiedJoker: save.flags.portraitCopiedJoker ?? initial.flags.portraitCopiedJoker,
      dualityStacks: {
        ...initial.flags.dualityStacks,
        ...save.flags.dualityStacks
      }
    },
    version: SAVE_VERSION,
    updatedAt: Date.now()
  });
}

export function getScoringIndices(
  values: number[],
  locked: boolean[],
  _boss: BossId | null = null,
  discount = false,
  disabled: boolean[] = [],
  holdEm = false,
  oddChoice = false,
  diceTypes: SpecialDieId[] = []
): Set<number> {
  const indices = new Set<number>();
  const active = values.filter((_, index) => !locked[index] && !disabled[index]);
  const lockedPheonixValues = values.filter(
    (_, index) =>
      diceTypes[index] === "pheonix" &&
      locked[index] &&
      !disabled[index]
  );
  const patternValues = [...active, ...lockedPheonixValues];

  if (
    (patternValues.length === 6 &&
      (straightScore(patternValues, discount) > 0 || threePairsScore(patternValues) > 0)) ||
    straightScore(patternValues, discount) > 0
  ) {
    values.forEach((_, index) => {
      if (!locked[index] && !disabled[index]) {
        indices.add(index);
      }
    });
    return indices;
  }

  const counts = countsFor(patternValues);
  values.forEach((value, index) => {
    if (locked[index] || disabled[index]) {
      return;
    }
    if (value === 1 || value === 5 || (oddChoice && value === 3) || counts[value] >= 3) {
      indices.add(index);
    }
  });
  if (holdEm) {
    getHoldEmScoringIndices(values, locked, disabled, diceTypes).forEach((index) => indices.add(index));
  }
  return indices;
}

export function hasHoldEmSelectionConflict(state: SaveData): boolean {
  if (!hasJoker(state, "hold-em")) {
    return false;
  }

  const active = activeValues(state.dice);
  const patternValues = [...active, ...getLockedPheonixValues(state.dice)];
  if (patternValues.length === 6 && threePairsScore(patternValues) > 0) {
    return false;
  }

  const holdEmIndices = getHoldEmScoringIndices(
    state.dice.values,
    state.dice.locked,
    state.dice.disabled,
    state.dice.types
  );
  if (holdEmIndices.size === 0) {
    return false;
  }

  const basicIndices = getScoringIndices(
    state.dice.values,
    state.dice.locked,
    state.run.currentBoss,
    hasJoker(state, "discount"),
    state.dice.disabled,
    false,
    hasJoker(state, "odd-choice"),
    state.dice.types
  );
  return basicIndices.size > 0;
}

export function hasAnyScoringDice(
  values: number[],
  _boss: BossId | null = null,
  discount = false,
  holdEm = false,
  oddChoice = false,
  lockedPheonixValues: number[] = []
): boolean {
  const patternValues = [...values, ...lockedPheonixValues];
  if (
    (patternValues.length === 6 &&
      (straightScore(patternValues, discount) > 0 || threePairsScore(patternValues) > 0)) ||
    straightScore(patternValues, discount) > 0 ||
    (holdEm && patternValues.length === 5 && fullHouseScore(patternValues) > 0)
  ) {
    return true;
  }
  if (holdEm && hasTwoPairs(patternValues)) {
    return true;
  }

  const counts = countsFor(patternValues);
  const activeCounts = countsFor(values);
  const hasKind = counts.some(
    (count, value) =>
      activeCounts[value] > 0 && count >= 3
  );
  const hasActiveSingle = values.some(
    (value) => value === 1 || value === 5 || (oddChoice && value === 3)
  );
  return hasKind || hasActiveSingle;
}

export function calculateSelectedScore(state: SaveData): ScoreBreakdown {
  const selectedValues = state.dice.values.filter((_, index) => state.dice.selected[index]);
  const lockedPheonixValues = getLockedPheonixValues(state.dice);
  const patternValues = [...selectedValues, ...lockedPheonixValues];
  const selectedIndices = state.dice.values
    .map((value, index) => ({ value, index }))
    .filter((die) => state.dice.selected[die.index]);
  if (selectedValues.length === 0) {
    return { valid: false, score: 0, label: "Select scoring dice", multiplier: 1, flatBonus: 0 };
  }
  const upgradeSourceDice = activeDieRefs(state.dice);
  const upgradeMultiplierFor = (values: number[]) =>
    getValuesUpgradeMultiplier(state.upgrades, values, upgradeSourceDice, state.dice.types);

  const discountStraight = hasJoker(state, "discount");
  const oddChoiceCount = getJokerCount(state, "odd-choice");
  const activePortraitCopy = getActivePortraitCopy(state);
  const copiedDiscount = activePortraitCopy === "discount";
  const copiedHoldEm = activePortraitCopy === "hold-em";
  const patternCounts = countsFor(patternValues);
  const remainingSelectedCounts = countsFor(selectedValues);
  let score = 0;
  const labels: string[] = [];
  let flatBonus = 0;
  let singleOneScoreAlreadyCounted = 0;
  const dieFaceBonusAppliedIndices = new Set<number>();
  const singleOneScore = 100;
  const singleOneFaceBonus = state.upgrades.dieFaceBonuses[1] ?? 0;
  const singleOneUpgradeMultiplier = upgradeMultiplierFor([1]);

  const straight = straightScore(patternValues, discountStraight);
  const threePairs = patternValues.length === 6 ? threePairsScore(patternValues) : 0;
  const fullHouse = hasJoker(state, "hold-em") && patternValues.length === 5 ? fullHouseScore(patternValues) : 0;
  const twoPairValues = hasJoker(state, "hold-em")
    ? patternCounts.map((count, value) => ({ count, value })).filter(({ count }) => count === 2).map(({ value }) => value)
    : [];

  if (straight > 0) {
    const smallStraightCopiedBonus = copiedDiscount && patternValues.length === 5 ? 2 : 1;
    score += Math.round(straight * smallStraightCopiedBonus * upgradeMultiplierFor(patternValues));
    labels.push("Straight");
  } else if (threePairs > 0) {
    score += Math.round(threePairs * upgradeMultiplierFor(patternValues));
    labels.push("Three Pairs");
  } else if (fullHouse > 0) {
    score += Math.round(fullHouse * (copiedHoldEm ? 2 : 1) * upgradeMultiplierFor(patternValues));
    labels.push("Full House");
  } else {
    if (twoPairValues.length === 2) {
      score += Math.round(800 * (copiedHoldEm ? 2 : 1) * upgradeMultiplierFor(twoPairValues));
      labels.push("Two Pairs");
      twoPairValues.forEach((value) => {
        remainingSelectedCounts[value] = 0;
      });
    }

    for (let value = 1; value <= 6; value += 1) {
      const count = patternCounts[value];
      if (count >= 3 && remainingSelectedCounts[value] > 0) {
        const baseTriple = value === 1 ? 1000 : value * 100;
        const kindMultiplier = count === 3 ? 1 : count === 4 ? 2 : count === 5 ? 3 : 4;
        let kindScore = baseTriple * kindMultiplier;
        if (selectedIndices.some((die) => die.value === value && state.dice.types[die.index] === "heavy")) {
          kindScore = Math.round(kindScore * 2);
        }
        kindScore = Math.round(kindScore * upgradeMultiplierFor([value]));
        score += kindScore;
        labels.push(`${count}x${value}`);
        remainingSelectedCounts[value] = 0;
      }
    }

    const singleOneIndices = selectedIndices
      .filter((die) => die.value === 1)
      .slice(0, remainingSelectedCounts[1])
      .map((die) => die.index);
    singleOneScoreAlreadyCounted = singleOneIndices.reduce((sum, index) => {
      dieFaceBonusAppliedIndices.add(index);
      const bullseyeMultiplier = state.dice.types[index] === "bullseye" ? 3 : 1;
      return sum + Math.round((singleOneScore + singleOneFaceBonus) * bullseyeMultiplier * singleOneUpgradeMultiplier);
    }, 0);
    score += singleOneScoreAlreadyCounted;
    if (remainingSelectedCounts[1] > 0) {
      labels.push(`${remainingSelectedCounts[1]} one${remainingSelectedCounts[1] > 1 ? "s" : ""}`);
      remainingSelectedCounts[1] = 0;
    }

    const singleFiveScore = 50;
    const singleFiveIndices = selectedIndices
      .filter((die) => die.value === 5)
      .slice(0, remainingSelectedCounts[5])
      .map((die) => die.index);
    score += singleFiveIndices.reduce((sum, index) => {
      dieFaceBonusAppliedIndices.add(index);
      return sum + Math.round((singleFiveScore + (state.upgrades.dieFaceBonuses[5] ?? 0)) * upgradeMultiplierFor([5]));
    }, 0);
    if (remainingSelectedCounts[5] > 0) {
      labels.push(`${remainingSelectedCounts[5]} five${remainingSelectedCounts[5] > 1 ? "s" : ""}`);
      remainingSelectedCounts[5] = 0;
    }

    if (oddChoiceCount > 0 && remainingSelectedCounts[3] > 0) {
      const singleThreeScore = 100 * oddChoiceCount;
      const singleThreeIndices = selectedIndices
        .filter((die) => die.value === 3)
        .slice(0, remainingSelectedCounts[3])
        .map((die) => die.index);
      score += singleThreeIndices.reduce((sum, index) => {
        dieFaceBonusAppliedIndices.add(index);
        return (
          sum +
          Math.round(
            (singleThreeScore + (state.upgrades.dieFaceBonuses[3] ?? 0)) *
              upgradeMultiplierFor([3])
          )
        );
      }, 0);
      labels.push(`${remainingSelectedCounts[3]} three${remainingSelectedCounts[3] > 1 ? "s" : ""}`);
      remainingSelectedCounts[3] = 0;
    }

    if (remainingSelectedCounts.some((count) => count > 0)) {
      return { valid: false, score: 0, label: "Invalid selection", multiplier: 1, flatBonus: 0 };
    }
  }

  const bullseyeComboBonus = selectedIndices.reduce((sum, die) => {
    if (die.value !== 1 || state.dice.types[die.index] !== "bullseye" || dieFaceBonusAppliedIndices.has(die.index)) {
      return sum;
    }

    const normalSingleOneScore = Math.round((singleOneScore + singleOneFaceBonus) * singleOneUpgradeMultiplier);
    const bullseyeSingleOneScore = Math.round((singleOneScore + singleOneFaceBonus) * 3 * singleOneUpgradeMultiplier);
    return sum + bullseyeSingleOneScore - normalSingleOneScore;
  }, 0);
  if (bullseyeComboBonus > 0) {
    score += bullseyeComboBonus;
    labels.push("Bull's Eye");
  }

  score += flatBonus;
  const snakeEyesBonus = snakeEyesBonusScore(state, selectedIndices, singleOneScoreAlreadyCounted);
  if (snakeEyesBonus > 0) {
    score += snakeEyesBonus;
    labels.push("Snake Eyes");
  }
  if (hasJoker(state, "just-one-more") && state.dice.rollCount >= 3) {
    score += 300 * getJokerCount(state, "just-one-more");
  }
  score += selectedIndices.reduce(
    (sum, die) => {
      if (dieFaceBonusAppliedIndices.has(die.index)) {
        return sum;
      }
      return sum + (state.upgrades.dieFaceBonuses[die.value] ?? 0);
    },
    0
  );
  let multiplier = 1;

  const tripletCount = getJokerCount(state, "triplet");
  if (tripletCount > 0 && selectedValues.length === 3) {
    multiplier *= 2 ** tripletCount;
  }
  if (selectedIndices.some((die) => state.dice.types[die.index] === "glass")) {
    multiplier *= 5;
  }
  const greedyCount = getJokerCount(state, "greedy");
  if (greedyCount > 0) {
    multiplier *= getGreedyMultiplier(state.dice.rollCount) ** greedyCount;
  }
  const goldenRatioCount = getJokerCount(state, "golden-ratio");
  if (goldenRatioCount > 0) {
    multiplier *= 1.6 ** goldenRatioCount;
  }
  if (state.flags.feverCharges > 0) {
    multiplier *= 2 ** Math.min(3, state.flags.feverCharges);
  }
  const overtimeCount = getJokerCount(state, "overtime");
  if (overtimeCount > 0 && state.run.turnsLeft === 1) {
    multiplier *= 2 ** overtimeCount;
  }
  const doubleOrNothingCount = getJokerCount(state, "double-or-nothing");
  if (doubleOrNothingCount > 0 && state.run.turnNumber === 1) {
    multiplier *= 2 ** doubleOrNothingCount;
  }
  if (hasOwnedJoker(state, "duality") && state.flags.dualityStacks.original > 0) {
    multiplier *= 2 ** state.flags.dualityStacks.original;
  }
  if (getActivePortraitCopy(state) === "duality" && state.flags.dualityStacks.portrait > 0) {
    multiplier *= 2 ** state.flags.dualityStacks.portrait;
  }

  return {
    valid: true,
    score: Math.round(score * multiplier),
    label: labels.join(", "),
    multiplier,
    flatBonus
  };
}

export function rollDice(state: SaveData, options: { deferFarkle?: boolean } = {}): SaveData {
  const next = cloneState(state);

  if (next.run.gameOver || next.shop.open) {
    return next;
  }

  const momentumCount = getJokerCount(next, "momentum");
  if (momentumCount > 0 && next.run.turnScore > 0) {
    next.run.turnScore = Math.round(next.run.turnScore * 1.2 ** momentumCount);
  }

  const startsHotDiceRoll = next.dice.hotDice && next.dice.locked.every((locked, index) => locked || next.dice.disabled[index]);
  let wakeUpActivated = false;
  if (!startsHotDiceRoll) {
    wakeUpActivated = tryWakeUp(next);
  }
  tryFaustianBargain(next);

  const allLocked = next.dice.locked.every((locked, index) => locked || next.dice.disabled[index]);
  if (allLocked) {
    next.dice.locked.fill(false);
    next.dice.selected.fill(false);
    next.dice.hotDice = true;
  }

  const firstRoll = next.dice.rollCount === 0;
  const needsScoringRoll = firstRoll || allLocked || wakeUpActivated;
  const anchorFixedForRoll = allLocked ? Array(6).fill(false) : next.dice.anchorFixed;
  const rollMask = needsScoringRoll
    ? next.dice.disabled.map((disabled) => !disabled)
    : next.dice.values.map((_, index) => !next.dice.locked[index] && !next.dice.disabled[index]);
  const roll = needsScoringRoll
    ? randomScoringDiceRoll(
        next.run.currentBoss,
        hasJoker(next, "discount"),
        hasJoker(next, "hold-em"),
        hasJoker(next, "odd-choice"),
        next.dice.types,
        next.dice.foresightNext,
        rollMask,
        next.dice.values,
        anchorFixedForRoll
      )
    : rollDiceValues(next.dice.types, next.dice.foresightNext, rollMask, next.dice.values, anchorFixedForRoll, hasJoker(next, "odd-choice"));
  next.dice.values = roll.values;
  next.dice.foresightNext = roll.foresightNext;
  next.dice.anchorFixed = roll.anchorFixed;
  next.dice.selected.fill(false);
  next.dice.rollCount += 1;
  next.dice.awaitingAction = true;
  next.updatedAt = Date.now();

  const active = activeValues(next.dice);
  if (
    !options.deferFarkle &&
    !hasAnyScoringDice(
      active,
      null,
      hasJoker(next, "discount"),
      hasJoker(next, "hold-em"),
      hasJoker(next, "odd-choice"),
      getLockedPheonixValues(next.dice)
    )
  ) {
    return handleFarkle(next);
  }

  next.log.unshift(makeLog(`Roll ${next.dice.rollCount}: ${next.dice.values.join(" ")}`));
  return next;
}

export function rerollSingleDieValue(state: SaveData, index: number): SaveData {
  const next = cloneState(state);
  if (
    index < 0 ||
    index >= next.dice.values.length ||
    next.dice.locked[index] ||
    next.dice.disabled[index]
  ) {
    return next;
  }

  const roll = rollDiceValues(
    next.dice.types,
    next.dice.foresightNext,
    next.dice.values.map((_, diceIndex) => diceIndex === index),
    next.dice.values,
    next.dice.anchorFixed,
    hasJoker(next, "odd-choice")
  );
  next.dice.values = roll.values;
  next.dice.foresightNext = roll.foresightNext;
  next.dice.anchorFixed = roll.anchorFixed;
  next.updatedAt = Date.now();
  return next;
}

export function toggleDieSelection(state: SaveData, index: number): SaveData {
  const next = cloneState(state);
  if (next.run.gameOver || next.shop.open || next.dice.rollCount <= 0 || next.dice.locked[index] || next.dice.disabled[index]) {
    return next;
  }

  const scoringIndices = getScoringIndices(
    next.dice.values,
    next.dice.locked,
    next.run.currentBoss,
    hasJoker(next, "discount"),
    next.dice.disabled,
    hasJoker(next, "hold-em"),
    hasJoker(next, "odd-choice"),
    next.dice.types
  );
  if (!scoringIndices.has(index)) {
    return next;
  }
  if (hasHoldEmSelectionConflict(next)) {
    next.dice.selected[index] = !next.dice.selected[index];
    return next;
  }

  const active = activeValues(next.dice);
  const patternValues = [...active, ...getLockedPheonixValues(next.dice)];
  const counts = countsFor(patternValues);
  const clickedValue = next.dice.values[index];
  const clickedValueScoresAlone =
    clickedValue === 1 ||
    clickedValue === 5 ||
    (hasJoker(next, "odd-choice") && clickedValue === 3);
  const wholeHandScore =
    straightScore(patternValues, hasJoker(next, "discount")) > 0 ||
    (hasJoker(next, "hold-em") && patternValues.length === 5 && fullHouseScore(patternValues) > 0);
  const pairOnlyScore =
    ((patternValues.length === 6 && threePairsScore(patternValues) > 0) ||
      (hasJoker(next, "hold-em") && hasTwoPairs(patternValues))) &&
    !clickedValueScoresAlone &&
    counts[clickedValue] === 2;

  if (wholeHandScore || pairOnlyScore) {
    const shouldSelect = next.dice.values.some(
      (value, diceIndex) =>
        !next.dice.locked[diceIndex] &&
        !next.dice.disabled[diceIndex] &&
        !next.dice.selected[diceIndex] &&
        (!pairOnlyScore || counts[value] === 2)
    );
    next.dice.selected = next.dice.selected.map((selected, diceIndex) =>
      next.dice.locked[diceIndex] ||
      next.dice.disabled[diceIndex] ||
      (pairOnlyScore && counts[next.dice.values[diceIndex]] !== 2)
        ? selected
        : shouldSelect
    );
    return next;
  }

  const kindOnlyScore = !clickedValueScoresAlone && counts[clickedValue] >= 3;
  if (kindOnlyScore) {
    const matchingIndices = next.dice.values
      .map((value, diceIndex) => ({ value, diceIndex }))
      .filter((die) => !next.dice.locked[die.diceIndex] && !next.dice.disabled[die.diceIndex] && die.value === clickedValue)
      .map((die) => die.diceIndex);
    const shouldSelect = matchingIndices.some((diceIndex) => !next.dice.selected[diceIndex]);
    matchingIndices.forEach((diceIndex) => {
      next.dice.selected[diceIndex] = shouldSelect;
    });
    return next;
  }

  next.dice.selected[index] = !next.dice.selected[index];
  return next;
}

export function confirmSelection(state: SaveData): SaveData {
  const next = cloneState(state);
  const breakdown = calculateSelectedScore(next);
  if (!breakdown.valid || breakdown.score <= 0) {
    return next;
  }

  const activeBeforeSelection = activeValues(next.dice).length;
  const hotDiceTriggered = next.dice.selected.every((selected, index) => selected || next.dice.locked[index] || next.dice.disabled[index]);
  const bloodyCount = next.dice.selected.filter((selected, index) => selected && next.dice.types[index] === "bloody").length;

  next.run.turnScore += breakdown.score;
  if (bloodyCount > 0) {
    next.run.turnScore = Math.round(next.run.turnScore * 1.5 ** bloodyCount);
  }
  next.dice.selected.forEach((selected, index) => {
    if (selected) {
      if (next.dice.types[index] === "glass") {
        next.dice.disabled[index] = true;
      } else if (next.dice.types[index] === "charged" && !hotDiceTriggered && !next.dice.chargedUsed[index]) {
        next.dice.chargedUsed[index] = true;
      } else {
        next.dice.locked[index] = true;
      }
      next.dice.selected[index] = false;
    }
  });

  if (hotDiceTriggered) {
    next.dice.chargedUsed.fill(false);
    const feverCount = getJokerCount(next, "fever");
    if (feverCount > 0) {
      next.flags.feverCharges = Math.min(3, feverCount);
    }
    const cleanSweepCount = getJokerCount(next, "clean-sweep");
    if (cleanSweepCount > 0) {
      const gained = 2 * cleanSweepCount;
      next.run.money += gained;
      next.log.unshift(makeLog(`Clean Sweep gained $${gained}.`, "good"));
    }
    next.dice.hotDice = true;
    next.log.unshift(makeLog(`Hot Dice. ${breakdown.label} scored ${breakdown.score}.`, "good"));
  } else {
    next.log.unshift(makeLog(`${breakdown.label} scored ${breakdown.score}.`, "good"));
  }

  if (bloodyCount > 0) {
    next.log.unshift(makeLog(`Bloody Die multiplied turn damage x${(1.5 ** bloodyCount).toFixed(2)}.`, "good"));
  }

  const spartaCount = getJokerCount(next, "sparta");
  if (spartaCount > 0 && activeBeforeSelection === 1) {
    next.run.turnScore *= 3 ** spartaCount;
    next.log.unshift(makeLog(`Sparta multiplied the turn score x${3 ** spartaCount}.`, "good"));
  }

  next.flags.successfulScoresThisTurn += 1;
  next.dice.awaitingAction = false;
  next.updatedAt = Date.now();
  return next;
}

function startNextTurn(state: SaveData, awaitingAction = false): SaveData {
  const previousTypes = state.dice.types ?? basicDiceTypes();
  const previousForesightNext = normalizeForesightNext(state.dice.foresightNext);
  const resetAnchorFixed = Array(6).fill(false);
  const previousDisabled = state.dice.disabled ?? Array(6).fill(false);
  const disabled = previousTypes.map((type, index) => type === "glass" && previousDisabled[index]);
  const rollMask = awaitingAction ? disabled.map((isDisabled) => !isDisabled) : Array(6).fill(false);
  const roll = awaitingAction
    ? randomScoringDiceRoll(
        state.run.currentBoss,
        hasJoker(state, "discount"),
        hasJoker(state, "hold-em"),
        hasJoker(state, "odd-choice"),
        previousTypes,
        previousForesightNext,
        rollMask,
        state.dice.values,
        resetAnchorFixed
      )
    : rollDiceValues(previousTypes, previousForesightNext, rollMask, state.dice.values, resetAnchorFixed);
  state.dice = {
    values: roll.values,
    selected: Array(6).fill(false),
    locked: Array(6).fill(false),
    types: previousTypes,
    foresightNext: roll.foresightNext,
    anchorFixed: roll.anchorFixed,
    chargedUsed: Array(6).fill(false),
    disabled,
    rollCount: awaitingAction ? 1 : 0,
    hotDice: false,
    canRerollSingle: true,
    canFlipSingle: true,
    awaitingAction
  };
  state.run.turnScore = 0;
  state.flags.feverCharges = 0;
  state.flags.successfulScoresThisTurn = 0;
  return state;
}

function clearRewardBreakdown(state: SaveData, bankedAmount: number, hadFarkle: boolean): RewardBreakdownItem[] {
  const turnBonus = Math.max(0, state.run.turnsLeft);
  const turnReward: RewardBreakdownItem | null =
    turnBonus > 0
      ? {
          id: "turns",
          label: "turns",
          description: `${turnBonus} turn${turnBonus === 1 ? "" : "s"} left after clearing.`,
          amount: turnBonus
        }
      : null;
  const breakdown: RewardBreakdownItem[] = [
    {
      id: "base",
      label: "clear",
      description: "Base reward for beating the round.",
      amount: 2
    }
  ];

  if (!hadFarkle) {
    breakdown.push({
      id: "clean",
      label: "clean",
      description: "No Farkle happened this round.",
      amount: 2
    });
  }
  if (bankedAmount >= state.run.targetScore * 2) {
    breakdown.push({
      id: "apex",
      label: "apex",
      description: "Round score reached at least 2x the target.",
      amount: 2
    });
  }

  const wealthBonus = Math.min(4, Math.floor(state.run.money / 5));
  if (wealthBonus > 0) {
    const interestMultiplier = 2 ** getJokerCount(state, "investment");
    breakdown.push({
      id: "interest",
      label: "stash",
      description: `Bonus from money already held${interestMultiplier > 1 ? ", doubled by Investment" : ""}.`,
      amount: wealthBonus * interestMultiplier
    });
  }
  const goldMineCount = getJokerCount(state, "gold-mine");
  if (goldMineCount > 0) {
    breakdown.push({
      id: "gold-mine",
      label: "gold",
      description: "Gold Mine bonus for clearing the round.",
      amount: 2 * goldMineCount
    });
  }

  return turnReward ? [turnReward, ...breakdown] : breakdown;
}

function rewardTotal(breakdown: RewardBreakdownItem[]): number {
  return breakdown.reduce((sum, item) => sum + item.amount, 0);
}

export function bankScore(state: SaveData): SaveData {
  const next = cloneState(state);
  if (next.run.turnScore <= 0 || next.shop.open || next.run.gameOver) {
    return next;
  }

  let banked = next.run.turnScore;
  const bigRiskCount = getJokerCount(next, "big-risk");
  if (bigRiskCount > 0 && next.dice.rollCount >= 4) {
    banked *= 2 ** bigRiskCount;
  }
  const overtimeCount = getJokerCount(next, "overtime");
  if (overtimeCount > 0 && next.run.turnsLeft === 1) {
    banked *= 2 ** overtimeCount;
  }
  next.run.roundScore += banked;
  next.run.totalScore += banked;
  if (hasJoker(next, "lucky-cash") && banked >= 1000) {
    next.run.money += getJokerCount(next, "lucky-cash");
  }
  if (hasJoker(next, "tax-refund") && [500, 1000, 1500, 2000].includes(banked)) {
    next.run.money += getJokerCount(next, "tax-refund");
  }
  if (hasJoker(next, "pocket-change") && next.dice.rollCount <= 3) {
    next.run.money += getJokerCount(next, "pocket-change");
  }
  next.flags.dualityStacks.original = 0;
  next.flags.dualityStacks.portrait = 0;
  next.run.turnsLeft -= 1;
  next.run.turnNumber += 1;
  next.log.unshift(makeLog(`Banked ${banked}. Round total ${next.run.roundScore}.`, "good"));
  startNextTurn(next, true);

  if (next.run.roundScore >= next.run.targetScore) {
    next.run.cleared = true;
    next.meta.bestRound = Math.max(next.meta.bestRound, next.run.round);
    const rewardBreakdown = clearRewardBreakdown(next, next.run.roundScore, next.flags.hadFarkleRound);
    const reward = rewardTotal(rewardBreakdown);
    next.run.lastRewardBreakdown = rewardBreakdown;
    next.run.money += reward;
    next.log.unshift(makeLog(`Round ${next.run.round} cleared. Earned $${reward}.`, "good"));
    next.shop.items = generateShop(next);
    next.shop.open = true;
  } else if (next.run.turnsLeft <= 0) {
    next.run.gameOver = true;
    next.log.unshift(makeLog("No turns left. The run is over.", "bad"));
  }

  next.updatedAt = Date.now();
  return next;
}

export function handleFarkle(state: SaveData): SaveData {
  const next = cloneState(state);

  const zombieIndex = next.dice.types.findIndex((type, index) => type === "zombie" && !next.dice.locked[index] && !next.dice.disabled[index]);
  if (zombieIndex >= 0) {
    next.dice.disabled[zombieIndex] = true;
    next.dice.selected.fill(false);
    next.dice.awaitingAction = false;
    next.log.unshift(makeLog("Zombie Die prevented a Farkle, then went inactive.", "good"));
    next.updatedAt = Date.now();
    return next;
  }

  const bandAidCount = getJokerCount(next, "band-aid");
  if (bandAidCount > 0 && next.flags.bandAidUsesRound < bandAidCount) {
    next.flags.bandAidUsesRound += 1;
    next.dice.selected.fill(false);
    next.dice.awaitingAction = false;
    next.log.unshift(makeLog("Band-aid protected your damage from this Farkle.", "good"));
    next.updatedAt = Date.now();
    return next;
  }

  const insuranceCount = getJokerCount(next, "insurance");
  if (insuranceCount > 0 && next.run.turnScore > 0) {
    const insuredRate = insuranceCount >= 2 ? 0.75 : 0.5;
    const insured = Math.floor(next.run.turnScore * insuredRate);
    next.run.roundScore += insured;
    next.run.totalScore += insured;
    next.log.unshift(makeLog(`Insurance banked ${insured}.`, "good"));
  }

  next.flags.hadFarkleRound = true;
  if (hasOwnedJoker(next, "duality")) {
    next.flags.dualityStacks.original += 1;
  }
  if (getActivePortraitCopy(next) === "duality") {
    next.flags.dualityStacks.portrait += 1;
  }
  next.run.turnScore = 0;
  next.dice.selected.fill(false);
  next.dice.locked.fill(false);
  next.dice.awaitingAction = false;
  next.run.turnsLeft -= 1;
  next.run.turnNumber += 1;
  next.log.unshift(makeLog("Farkle. Stored damage lost.", "bad"));

  if (next.run.roundScore >= next.run.targetScore) {
    next.run.cleared = true;
    next.shop.items = generateShop(next);
    next.shop.open = true;
  } else if (next.run.turnsLeft <= 0) {
    next.run.gameOver = true;
    next.log.unshift(makeLog("No turns left. The run is over.", "bad"));
  }

  next.updatedAt = Date.now();
  return next;
}

export function finishFarkleTurn(state: SaveData): SaveData {
  const next = cloneState(state);
  if (next.run.gameOver || next.shop.open) {
    return next;
  }

  startNextTurn(next, true);
  next.updatedAt = Date.now();
  return next;
}

export function generateShop(state: SaveData): ShopItem[] {
  const unavailableJokers = new Set<JokerId>(["lucky-cash", "tax-refund", "just-one-more", "odd-choice"]);
  const unavailableSpecialDice = new Set<SpecialDieId>(["zombie", "glass"]);
  const availableJokers = JOKERS.filter((joker) => !unavailableJokers.has(joker.id) && !state.jokers.includes(joker.id));
  const availableSpecialDice = SPECIAL_DICE.filter(
    (die) =>
      !unavailableSpecialDice.has(die.id) &&
      state.dice.types.filter((ownedDieId) => ownedDieId === die.id).length < 2
  );
  const shuffledJokers = [...availableJokers].sort(() => Math.random() - 0.5).slice(0, 2);
  const handUpgrades = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 2);
  const specialDice = [...availableSpecialDice].sort(() => Math.random() - 0.5).slice(0, 2);

  return [
    ...shuffledJokers.map((joker) => ({
      id: makeId(),
      kind: "joker" as const,
      refId: joker.id,
      price: joker.price,
      purchased: false
    })),
    ...specialDice.map((die) => ({
      id: makeId(),
      kind: "special-die" as const,
      refId: die.id,
      price: die.price,
      purchased: false
    })),
    ...handUpgrades.map((upgrade) => ({
      id: makeId(),
      kind: "hand-upgrade" as const,
      refId: upgrade.id,
      price: getFaceUpgradePrice(state.upgrades, upgrade.id),
      purchased: false
    }))
  ];
}

export function buyShopItem(state: SaveData, itemId: string): SaveData {
  const next = cloneState(state);
  const item = next.shop.items.find((candidate) => candidate.id === itemId);
  const price =
    item?.kind === "hand-upgrade" ? getFaceUpgradePrice(next.upgrades, item.refId as UpgradeId) : item?.price ?? 0;
  if (!item || item.purchased || next.run.money < price) {
    return next;
  }

  if (item.kind === "joker") {
    if (next.jokers.length >= 6 || next.jokers.includes(item.refId as JokerId)) {
      return next;
    }
    next.jokers.push(item.refId as JokerId);
  } else if (item.kind === "hand-upgrade") {
    applyUpgrade(next, item.refId as UpgradeId);
  } else {
    return next;
  }

  item.purchased = true;
  next.run.money -= price;
  next.log.unshift(makeLog(`Bought ${lookupName(item.kind, item.refId)} for $${price}.`, "good"));
  next.updatedAt = Date.now();
  return next;
}

export function buyDieUpgradeForFace(state: SaveData, itemId: string, faceValue: number): SaveData {
  const next = cloneState(state);
  const item = next.shop.items.find((candidate) => candidate.id === itemId);
  if (!item || item.kind !== "die-upgrade" || item.purchased || next.run.money < item.price) {
    return next;
  }

  next.upgrades.dieFaceBonuses[faceValue] = (next.upgrades.dieFaceBonuses[faceValue] ?? 0) + (item.bonus ?? 25);
  item.purchased = true;
  next.run.money -= item.price;
  next.log.unshift(makeLog(`Upgraded die ${faceValue} by +${item.bonus ?? 25} for $${item.price}.`, "good"));
  next.updatedAt = Date.now();
  return next;
}

export function buySpecialDieForSlot(state: SaveData, itemId: string, slotIndex: number): SaveData {
  const next = cloneState(state);
  const item = next.shop.items.find((candidate) => candidate.id === itemId);
  if (!item || item.kind !== "special-die" || item.purchased || next.run.money < item.price) {
    return next;
  }

  const dieId = item.refId as SpecialDieId;
  if (dieId === "basic") {
    return next;
  }
  const ownedCount = next.dice.types.filter((ownedDieId) => ownedDieId === dieId).length;
  if (ownedCount >= 2 || next.dice.types[slotIndex] === dieId) {
    return next;
  }

  next.dice.types[slotIndex] = dieId;
  next.dice.foresightNext = normalizeForesightNext(next.dice.foresightNext);
  next.dice.foresightNext[slotIndex] = null;
  next.dice.anchorFixed = normalizeAnchorFixed(next.dice.anchorFixed);
  next.dice.anchorFixed[slotIndex] = false;
  next.dice.chargedUsed = normalizeChargedUsed(next.dice.chargedUsed);
  next.dice.chargedUsed[slotIndex] = false;
  next.dice.disabled[slotIndex] = false;
  item.purchased = true;
  next.run.money -= item.price;
  next.log.unshift(makeLog(`Replaced die ${slotIndex + 1} with ${lookupName(item.kind, item.refId)} for $${item.price}.`, "good"));
  next.updatedAt = Date.now();
  return next;
}

function lookupName(kind: ShopItem["kind"], refId: JokerId | UpgradeId | SpecialDieId): string {
  if (kind === "joker") {
    return JOKERS.find((joker) => joker.id === refId)?.name ?? refId;
  }
  if (kind === "die-upgrade") {
    return "Die Upgrade";
  }
  if (kind === "special-die") {
    return SPECIAL_DICE.find((die) => die.id === refId)?.name ?? refId;
  }
  return UPGRADES.find((upgrade) => upgrade.id === refId)?.name ?? refId;
}

function applyUpgrade(state: SaveData, upgradeId: UpgradeId): void {
  const face = getUpgradeFace(upgradeId);
  state.upgrades.faceUpgradeLevels[face] = (state.upgrades.faceUpgradeLevels[face] ?? 0) + 1;
}

export function nextRound(state: SaveData): SaveData {
  const next = cloneState(state);
  if (!next.run.cleared) {
    return next;
  }

  next.flags.portraitCopiedJoker = choosePortraitCopy(next);
  const portraitCopyName = next.flags.portraitCopiedJoker
    ? JOKERS.find((joker) => joker.id === next.flags.portraitCopiedJoker)?.name ?? next.flags.portraitCopiedJoker
    : null;
  next.run.round += 1;
  next.run.targetScore = getTargetForRound(next.run.round);
  next.run.roundScore = 0;
  next.run.turnScore = 0;
  next.run.turnsLeft = getTurnLimit(next);
  next.run.turnNumber = 1;
  next.run.cleared = false;
  next.run.lastRewardBreakdown = [];
  next.run.currentBoss = getBossForRound(next.run.round);
  next.run.currentBossTone = getBossToneForRound(next.run.round);
  next.run.bossDescriptionIndex = randomBossDescriptionIndex(next.run.currentBoss);
  next.shop.open = false;
  next.shop.items = [];
  next.flags.bandAidUsesRound = 0;
  next.flags.feverCharges = 0;
  next.flags.successfulScoresThisTurn = 0;
  next.flags.hadFarkleRound = false;
  next.dice.disabled.fill(false);
  startNextTurn(next, true);
  next.log.unshift(
    makeLog(
      next.run.currentBoss
        ? `Round ${next.run.round} begins. Boss: ${BOSSES[next.run.currentBoss].name}.`
        : `Round ${next.run.round} begins.`,
      "neutral"
    )
  );
  if (portraitCopyName) {
    next.log.unshift(makeLog(`The Portrait copied ${portraitCopyName}.`, "good"));
  }
  next.updatedAt = Date.now();
  return next;
}
