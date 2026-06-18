import type {
  BossId,
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

function randomDiceValues(): number[] {
  return Array.from({ length: 6 }, randomDie);
}

function basicDiceTypes(): SpecialDieId[] {
  return Array(6).fill("basic");
}

function randomScoringDiceValues(
  _boss: BossId | null,
  discount: boolean,
  holdEm = false,
  activeMask: boolean[] = Array(6).fill(true)
): number[] {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const values = randomDiceValues();
    const active = values.filter((_, index) => activeMask[index]);
    if (hasAnyScoringDice(active, null, discount, holdEm)) {
      return values;
    }
  }

  const fallback = randomDiceValues();
  const firstActiveIndex = activeMask.findIndex(Boolean);
  if (firstActiveIndex >= 0) {
    fallback[firstActiveIndex] = 1;
  }
  return fallback;
}

function makeLog(text: string, tone: LogEntry["tone"] = "neutral"): LogEntry {
  return { id: makeId(), text, tone };
}

export function getJokerCount(state: SaveData, jokerId: JokerId): number {
  const ownedCount = state.jokers.includes(jokerId) ? 1 : 0;
  const copiedCount = state.flags.portraitCopiedJoker === jokerId ? 1 : 0;
  return ownedCount + copiedCount;
}

function hasJoker(state: SaveData, jokerId: JokerId): boolean {
  return getJokerCount(state, jokerId) > 0;
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

function tryWakeUp(state: SaveData): void {
  for (let attempt = 0; attempt < getJokerCount(state, "wake-up"); attempt += 1) {
    const inactiveDiceCount = state.dice.disabled.filter(Boolean).length;
    const bankedDiceCount = state.dice.locked.filter(Boolean).length;
    if (inactiveDiceCount + bankedDiceCount > 0 && Math.random() < 0.15) {
      state.dice.disabled.fill(false);
      state.dice.locked.fill(false);
      state.log.unshift(makeLog(`Wake Up reactivated ${inactiveDiceCount + bankedDiceCount} dice.`, "good"));
    }
  }
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

function getValuesUpgradeMultiplier(upgrades: UpgradeState, values: number[]): number {
  const uniqueValues = new Set(values);
  return [...uniqueValues].reduce((multiplier, value) => {
    const level = upgrades.faceUpgradeLevels?.[value] ?? 0;
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
  if (oneIndices.length < 2) {
    return 0;
  }

  const targetMultiplier = 4 ** snakeEyesCount;
  const upgradeMultiplier = getValuesUpgradeMultiplier(state.upgrades, [1]);
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

export function getBossForRound(round: number): BossId | null {
  const bossCycle: BossId[] = [
    "bone-croupier",
    "broken-cup",
    "dry-table",
    "tax-collector",
    "bitter-five",
    "heavy-bones",
    "poor-house"
  ];
  return bossCycle[Math.floor((round - 1) / 2) % bossCycle.length];
}

function randomBossDescriptionIndex(boss: BossId | null): number {
  return boss ? Math.floor(Math.random() * BOSSES[boss].descriptions.length) : 0;
}

function validBossDescriptionIndex(boss: BossId | null, index: number | undefined): number {
  return boss && Number.isInteger(index) && index !== undefined && index >= 0 && index < BOSSES[boss].descriptions.length
    ? index
    : randomBossDescriptionIndex(boss);
}

export function createInitialState(): SaveData {
  const now = Date.now();
  const currentBoss = getBossForRound(1);
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
      bossDescriptionIndex: randomBossDescriptionIndex(currentBoss),
      lastRewardBreakdown: []
    },
    dice: {
      values: randomScoringDiceValues(currentBoss, false),
      types: basicDiceTypes(),
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
      portraitCopiedJoker: null
    }
  };
}

export function migrateSave(save: SaveData | null): SaveData {
  if (!save) {
    return createInitialState();
  }

  const initial = createInitialState();
  const currentBoss = save.run.currentBoss ?? initial.run.currentBoss;
  const legacyFlags = save.flags as Partial<SaveData["flags"]> & { bandAidUsedRound?: boolean };
  return {
    ...createInitialState(),
    ...save,
    upgrades: {
      ...initial.upgrades,
      ...save.upgrades,
      faceUpgradeLevels: save.upgrades.faceUpgradeLevels ?? initial.upgrades.faceUpgradeLevels,
      dieFaceBonuses: save.upgrades.dieFaceBonuses ?? initial.upgrades.dieFaceBonuses
    },
    dice: {
      ...initial.dice,
      ...save.dice,
      types: save.dice.types ?? initial.dice.types,
      disabled: save.dice.disabled ?? initial.dice.disabled
    },
    run: {
      ...initial.run,
      ...save.run,
      totalScore: save.run.totalScore ?? save.run.roundScore ?? initial.run.totalScore,
      bossDescriptionIndex: validBossDescriptionIndex(currentBoss, save.run.bossDescriptionIndex),
      lastRewardBreakdown: save.run.lastRewardBreakdown ?? initial.run.lastRewardBreakdown
    },
    flags: {
      ...initial.flags,
      ...save.flags,
      bandAidUsesRound:
        save.flags.bandAidUsesRound ??
        (legacyFlags.bandAidUsedRound ? 1 : 0),
      portraitCopiedJoker: save.flags.portraitCopiedJoker ?? initial.flags.portraitCopiedJoker
    },
    version: SAVE_VERSION,
    updatedAt: Date.now()
  };
}

export function getScoringIndices(
  values: number[],
  locked: boolean[],
  _boss: BossId | null = null,
  discount = false,
  disabled: boolean[] = [],
  holdEm = false
): Set<number> {
  const indices = new Set<number>();
  const active = values.filter((_, index) => !locked[index] && !disabled[index]);

  if (
    (active.length === 6 && (straightScore(active, discount) > 0 || threePairsScore(active) > 0)) ||
    straightScore(active, discount) > 0 ||
    (holdEm && active.length === 5 && fullHouseScore(active) > 0)
  ) {
    values.forEach((_, index) => {
      if (!locked[index] && !disabled[index]) {
        indices.add(index);
      }
    });
    return indices;
  }

  const counts = countsFor(active);
  values.forEach((value, index) => {
    if (locked[index] || disabled[index]) {
      return;
    }
    if (value === 1 || value === 5 || counts[value] >= 3) {
      indices.add(index);
    }
  });
  if (holdEm && hasTwoPairs(active)) {
    values.forEach((value, index) => {
      if (!locked[index] && !disabled[index] && counts[value] === 2) {
        indices.add(index);
      }
    });
  }
  return indices;
}

export function hasAnyScoringDice(values: number[], _boss: BossId | null = null, discount = false, holdEm = false): boolean {
  if (
    (values.length === 6 && (straightScore(values, discount) > 0 || threePairsScore(values) > 0)) ||
    straightScore(values, discount) > 0 ||
    (holdEm && values.length === 5 && fullHouseScore(values) > 0)
  ) {
    return true;
  }
  if (holdEm && hasTwoPairs(values)) {
    return true;
  }

  const counts = countsFor(values);
  return counts.some(
    (count, value) =>
      count > 0 && (count >= 3 || value === 1 || value === 5)
  );
}

export function calculateSelectedScore(state: SaveData): ScoreBreakdown {
  const selectedValues = state.dice.values.filter((_, index) => state.dice.selected[index]);
  const selectedIndices = state.dice.values
    .map((value, index) => ({ value, index }))
    .filter((die) => state.dice.selected[die.index]);
  if (selectedValues.length === 0) {
    return { valid: false, score: 0, label: "Select scoring dice", multiplier: 1, flatBonus: 0 };
  }

  const discountStraight = hasJoker(state, "discount");
  const copiedDiscount = state.flags.portraitCopiedJoker === "discount";
  const copiedHoldEm = state.flags.portraitCopiedJoker === "hold-em";
  const counts = countsFor(selectedValues);
  let score = 0;
  const labels: string[] = [];
  let flatBonus = 0;
  let singleOneScoreAlreadyCounted = 0;
  const dieFaceBonusAppliedIndices = new Set<number>();

  const straight = selectedValues.length === 6 || discountStraight ? straightScore(selectedValues, discountStraight) : 0;
  const threePairs = selectedValues.length === 6 ? threePairsScore(selectedValues) : 0;
  const fullHouse = hasJoker(state, "hold-em") && selectedValues.length === 5 ? fullHouseScore(selectedValues) : 0;
  const twoPairValues = hasJoker(state, "hold-em")
    ? counts.map((count, value) => ({ count, value })).filter(({ count }) => count === 2).map(({ value }) => value)
    : [];

  if (straight > 0) {
    const smallStraightCopiedBonus = copiedDiscount && selectedValues.length === 5 ? 2 : 1;
    score += Math.round(straight * smallStraightCopiedBonus * getValuesUpgradeMultiplier(state.upgrades, selectedValues));
    labels.push("Straight");
  } else if (threePairs > 0) {
    score += Math.round(threePairs * getValuesUpgradeMultiplier(state.upgrades, selectedValues));
    labels.push("Three Pairs");
  } else if (fullHouse > 0) {
    score += Math.round(fullHouse * (copiedHoldEm ? 2 : 1) * getValuesUpgradeMultiplier(state.upgrades, selectedValues));
    labels.push("Full House");
  } else {
    if (twoPairValues.length === 2) {
      score += Math.round(800 * (copiedHoldEm ? 2 : 1) * getValuesUpgradeMultiplier(state.upgrades, twoPairValues));
      labels.push("Two Pairs");
      twoPairValues.forEach((value) => {
        counts[value] = 0;
      });
    }

    for (let value = 1; value <= 6; value += 1) {
        const count = counts[value];
        if (count >= 3) {
          const baseTriple = value === 1 ? 1000 : value * 100;
          const kindMultiplier = count === 3 ? 1 : count === 4 ? 2 : count === 5 ? 3 : 4;
        let kindScore = baseTriple * kindMultiplier;
        if (selectedIndices.some((die) => die.value === value && state.dice.types[die.index] === "heavy")) {
          kindScore = Math.round(kindScore * 2);
        }
        kindScore = Math.round(kindScore * getValuesUpgradeMultiplier(state.upgrades, [value]));
        score += kindScore;
        labels.push(`${count}x${value}`);
        counts[value] -= count;
      }
    }

    const singleOneScore = 100;
    const singleOneIndices = selectedIndices
      .filter((die) => die.value === 1)
      .slice(0, counts[1])
      .map((die) => die.index);
    singleOneScoreAlreadyCounted = singleOneIndices.reduce((sum, index) => {
      dieFaceBonusAppliedIndices.add(index);
      const faceBonus = state.upgrades.dieFaceBonuses[1] ?? 0;
      const bullseyeMultiplier = state.dice.types[index] === "bullseye" ? 3 : 1;
      const upgradeMultiplier = getValuesUpgradeMultiplier(state.upgrades, [1]);
      return sum + Math.round((singleOneScore + faceBonus) * bullseyeMultiplier * upgradeMultiplier);
    }, 0);
    score += singleOneScoreAlreadyCounted;
    if (counts[1] > 0) {
      labels.push(`${counts[1]} one${counts[1] > 1 ? "s" : ""}`);
      counts[1] = 0;
    }

    const singleFiveScore = 50;
    const singleFiveIndices = selectedIndices
      .filter((die) => die.value === 5)
      .slice(0, counts[5])
      .map((die) => die.index);
    score += singleFiveIndices.reduce((sum, index) => {
      dieFaceBonusAppliedIndices.add(index);
      return sum + Math.round((singleFiveScore + (state.upgrades.dieFaceBonuses[5] ?? 0)) * getValuesUpgradeMultiplier(state.upgrades, [5]));
    }, 0);
    if (counts[5] > 0) {
      labels.push(`${counts[5]} five${counts[5] > 1 ? "s" : ""}`);
      counts[5] = 0;
    }

    if (counts.some((count) => count > 0)) {
      return { valid: false, score: 0, label: "Invalid selection", multiplier: 1, flatBonus: 0 };
    }
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
    (sum, die) => sum + (dieFaceBonusAppliedIndices.has(die.index) ? 0 : state.upgrades.dieFaceBonuses[die.value] ?? 0),
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
    multiplier *= 1.5 ** overtimeCount;
  }
  const doubleOrNothingCount = getJokerCount(state, "double-or-nothing");
  if (doubleOrNothingCount > 0 && state.run.turnNumber === 1) {
    multiplier *= 2 ** doubleOrNothingCount;
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

  tryWakeUp(next);
  tryFaustianBargain(next);

  const allLocked = next.dice.locked.every((locked, index) => locked || next.dice.disabled[index]);
  if (allLocked) {
    next.dice.locked.fill(false);
    next.dice.selected.fill(false);
    next.dice.hotDice = true;
  }

  const firstRoll = next.dice.rollCount === 0;
  const needsScoringRoll = firstRoll || allLocked;
  next.dice.values = needsScoringRoll
    ? randomScoringDiceValues(
        next.run.currentBoss,
        hasJoker(next, "discount"),
        hasJoker(next, "hold-em"),
        next.dice.disabled.map((disabled) => !disabled)
      )
    : next.dice.values.map((value, index) =>
        next.dice.locked[index] || next.dice.disabled[index] ? value : randomDie()
      );
  next.dice.selected.fill(false);
  next.dice.rollCount += 1;
  next.dice.awaitingAction = true;
  next.updatedAt = Date.now();

  const active = activeValues(next.dice);
  if (
    !options.deferFarkle &&
    !hasAnyScoringDice(active, null, hasJoker(next, "discount"), hasJoker(next, "hold-em"))
  ) {
    return handleFarkle(next);
  }

  next.log.unshift(makeLog(`Roll ${next.dice.rollCount}: ${next.dice.values.join(" ")}`));
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
    hasJoker(next, "hold-em")
  );
  if (!scoringIndices.has(index)) {
    return next;
  }

  const active = activeValues(next.dice);
  const counts = countsFor(active);
  const clickedValue = next.dice.values[index];
  const wholeHandScore =
    straightScore(active, hasJoker(next, "discount")) > 0 ||
    (hasJoker(next, "hold-em") && active.length === 5 && fullHouseScore(active) > 0);
  const pairOnlyScore =
    ((active.length === 6 && threePairsScore(active) > 0) || (hasJoker(next, "hold-em") && hasTwoPairs(active))) &&
    clickedValue !== 1 &&
    clickedValue !== 5 &&
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

  const kindOnlyScore = clickedValue !== 1 && clickedValue !== 5 && counts[clickedValue] >= 3;
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
  const consumedFever = next.flags.feverCharges > 0;
  const hotDiceTriggered = next.dice.selected.every((selected, index) => selected || next.dice.locked[index] || next.dice.disabled[index]);
  const bloodyCount = next.dice.selected.filter((selected, index) => selected && next.dice.types[index] === "bloody").length;

  next.run.turnScore += breakdown.score;
  if (bloodyCount > 0) {
    next.run.turnScore = Math.round(next.run.turnScore * 1.2 ** bloodyCount);
  }
  next.dice.selected.forEach((selected, index) => {
    if (selected) {
      if (next.dice.types[index] === "glass") {
        next.dice.disabled[index] = true;
      } else {
        next.dice.locked[index] = true;
      }
      next.dice.selected[index] = false;
    }
  });

  if (hotDiceTriggered) {
    const feverCount = getJokerCount(next, "fever");
    if (feverCount > 0) {
      next.flags.feverCharges = Math.min(3, next.flags.feverCharges + feverCount);
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
    next.log.unshift(makeLog(`Bloody Die multiplied turn damage x${(1.2 ** bloodyCount).toFixed(2)}.`, "good"));
  }

  const spartaCount = getJokerCount(next, "sparta");
  if (spartaCount > 0 && activeBeforeSelection === 1) {
    next.run.turnScore *= 3 ** spartaCount;
    next.log.unshift(makeLog(`Sparta multiplied the turn score x${3 ** spartaCount}.`, "good"));
  }

  next.flags.successfulScoresThisTurn += 1;
  next.dice.awaitingAction = false;
  next.updatedAt = Date.now();
  if (consumedFever && !hotDiceTriggered) {
    next.flags.feverCharges -= 1;
  }
  return next;
}

function startNextTurn(state: SaveData, awaitingAction = false): SaveData {
  const previousTypes = state.dice.types ?? basicDiceTypes();
  const previousDisabled = state.dice.disabled ?? Array(6).fill(false);
  const disabled = previousTypes.map((type, index) => type === "glass" && previousDisabled[index]);
  state.dice = {
    values: awaitingAction
      ? randomScoringDiceValues(state.run.currentBoss, hasJoker(state, "discount"), hasJoker(state, "hold-em"), disabled.map((isDisabled) => !isDisabled))
      : randomDiceValues(),
    selected: Array(6).fill(false),
    locked: Array(6).fill(false),
    types: previousTypes,
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

  const wealthBonus = Math.min(5, Math.floor(state.run.money / 5));
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
  const unavailableJokers = new Set<JokerId>(["lucky-cash", "tax-refund", "just-one-more"]);
  const availableJokers = JOKERS.filter((joker) => !unavailableJokers.has(joker.id) && !state.jokers.includes(joker.id));
  const shuffledJokers = [...availableJokers].sort(() => Math.random() - 0.5).slice(0, 2);
  const portraitJoker = availableJokers.find((joker) => joker.id === "the-portrait");
  if (state.run.round === 1 && portraitJoker && !shuffledJokers.some((joker) => joker.id === "the-portrait")) {
    shuffledJokers[0] = portraitJoker;
  }
  const handUpgrades = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 2);
  const specialDice = [...SPECIAL_DICE].sort(() => Math.random() - 0.5).slice(0, 2);

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
      price: upgrade.price,
      purchased: false
    }))
  ];
}

export function buyShopItem(state: SaveData, itemId: string): SaveData {
  const next = cloneState(state);
  const item = next.shop.items.find((candidate) => candidate.id === itemId);
  if (!item || item.purchased || next.run.money < item.price) {
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
  next.run.money -= item.price;
  next.log.unshift(makeLog(`Bought ${lookupName(item.kind, item.refId)} for $${item.price}.`, "good"));
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

  next.dice.types[slotIndex] = dieId;
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
  next.run.round += 1;
  next.run.targetScore = getTargetForRound(next.run.round);
  next.run.roundScore = 0;
  next.run.turnScore = 0;
  next.run.turnsLeft = getTurnLimit(next);
  next.run.turnNumber = 1;
  next.run.cleared = false;
  next.run.lastRewardBreakdown = [];
  next.run.currentBoss = getBossForRound(next.run.round);
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
  next.updatedAt = Date.now();
  return next;
}
