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

function randomScoringDiceValues(boss: BossId | null, discount: boolean): number[] {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const values = randomDiceValues();
    if (hasAnyScoringDice(values, boss, discount)) {
      return values;
    }
  }

  return boss === "dry-table" ? [5, 2, 3, 4, 6, 2] : [1, 2, 3, 4, 6, 2];
}

function makeLog(text: string, tone: LogEntry["tone"] = "neutral"): LogEntry {
  return { id: makeId(), text, tone };
}

function hasJoker(state: SaveData, jokerId: JokerId): boolean {
  return state.jokers.includes(jokerId);
}

const HAND_UPGRADE_BASE_SCORES: Record<UpgradeId, number> = {
  "one-upgrade": 100,
  "five-upgrade": 50,
  "triple-upgrade": 200,
  "straight-upgrade": 1500,
  "three-pairs-upgrade": 1500
};

function getHandUpgradeBonusField(upgrades: UpgradeState, upgradeId: UpgradeId): number {
  if (upgradeId === "one-upgrade") {
    return upgrades.singleOneBonus;
  }
  if (upgradeId === "five-upgrade") {
    return upgrades.singleFiveBonus;
  }
  if (upgradeId === "triple-upgrade") {
    return upgrades.tripleBonus;
  }
  if (upgradeId === "straight-upgrade") {
    return upgrades.straightBonus;
  }
  return upgrades.threePairsBonus;
}

export function getHandUpgradeBonusAmount(upgrades: UpgradeState, upgradeId: UpgradeId): number {
  const currentScore = HAND_UPGRADE_BASE_SCORES[upgradeId] + getHandUpgradeBonusField(upgrades, upgradeId);
  return Math.floor(currentScore * 0.5);
}

function activeValues(dice: DiceState): number[] {
  return dice.values.filter((_, index) => !dice.locked[index]);
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

export function getTargetForRound(round: number): number {
  if (round <= TARGETS.length) {
    return TARGETS[round - 1];
  }

  const overflow = round - TARGETS.length;
  return Math.round(TARGETS[TARGETS.length - 1] * 1.35 ** overflow);
}

export function getBossForRound(round: number): BossId | null {
  return null;
}

export function createInitialState(): SaveData {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    run: {
      round: 1,
      targetScore: getTargetForRound(1),
      roundScore: 0,
      bossKillScore: 0,
      turnScore: 0,
      turnsLeft: TURN_LIMIT,
      turnNumber: 1,
      money: 4,
      gameOver: false,
      cleared: false,
      currentBoss: getBossForRound(1),
      lastRewardBreakdown: []
    },
    dice: {
      values: randomScoringDiceValues(getBossForRound(1), false),
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
      singleOneBonus: 0,
      singleFiveBonus: 0,
      tripleBonus: 0,
      straightBonus: 0,
      threePairsBonus: 0,
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
      bandAidUsedRound: false,
      feverCharges: 0,
      successfulScoresThisTurn: 0,
      hadFarkleRound: false
    }
  };
}

export function migrateSave(save: SaveData | null): SaveData {
  if (!save) {
    return createInitialState();
  }

  const initial = createInitialState();
  return {
    ...createInitialState(),
    ...save,
    upgrades: {
      ...initial.upgrades,
      ...save.upgrades,
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
      lastRewardBreakdown: save.run.lastRewardBreakdown ?? initial.run.lastRewardBreakdown
    },
    flags: {
      ...initial.flags,
      ...save.flags
    },
    version: SAVE_VERSION,
    updatedAt: Date.now()
  };
}

export function getScoringIndices(
  values: number[],
  locked: boolean[],
  boss: BossId | null = null,
  discount = false
): Set<number> {
  const indices = new Set<number>();
  const active = values.filter((_, index) => !locked[index]);

  if ((active.length === 6 && (straightScore(active, discount) > 0 || threePairsScore(active) > 0)) || straightScore(active, discount) > 0) {
    values.forEach((_, index) => {
      if (!locked[index]) {
        indices.add(index);
      }
    });
    return indices;
  }

  const counts = countsFor(active);
  values.forEach((value, index) => {
    if (locked[index]) {
      return;
    }
    if ((value === 1 && boss !== "dry-table") || (value === 5 && boss !== "bitter-five") || counts[value] >= 3) {
      indices.add(index);
    }
  });
  return indices;
}

export function hasAnyScoringDice(values: number[], boss: BossId | null = null, discount = false): boolean {
  if ((values.length === 6 && (straightScore(values, discount) > 0 || threePairsScore(values) > 0)) || straightScore(values, discount) > 0) {
    return true;
  }

  const counts = countsFor(values);
  return counts.some(
    (count, value) =>
      count > 0 && (count >= 3 || (value === 1 && boss !== "dry-table") || (value === 5 && boss !== "bitter-five"))
  );
}

export function calculateSelectedScore(state: SaveData, options: { includeMomentum?: boolean } = {}): ScoreBreakdown {
  const selectedValues = state.dice.values.filter((_, index) => state.dice.selected[index]);
  const selectedIndices = state.dice.values
    .map((value, index) => ({ value, index }))
    .filter((die) => state.dice.selected[die.index]);
  if (selectedValues.length === 0) {
    return { valid: false, score: 0, label: "Select scoring dice", multiplier: 1, flatBonus: 0 };
  }

  const bossDryTable = state.run.currentBoss === "dry-table";
  const bossBitterFive = state.run.currentBoss === "bitter-five";
  const bossHeavyBones = state.run.currentBoss === "heavy-bones";
  const discountStraight = hasJoker(state, "discount");
  const counts = countsFor(selectedValues);
  let score = 0;
  const labels: string[] = [];
  let flatBonus = 0;

  const straight = selectedValues.length === 6 || discountStraight ? straightScore(selectedValues, discountStraight) : 0;
  const threePairs = selectedValues.length === 6 ? threePairsScore(selectedValues) : 0;

  if (straight > 0) {
    score += straight + state.upgrades.straightBonus;
    labels.push("Straight");
  } else if (threePairs > 0) {
    score += threePairs + state.upgrades.threePairsBonus;
    labels.push("Three Pairs");
  } else {
    for (let value = 1; value <= 6; value += 1) {
      const count = counts[value];
      if (count >= 3) {
        const baseTriple = value === 1 ? 1000 : value * 100;
        const kindMultiplier = count === 3 ? 1 : count === 4 ? 2 : count === 5 ? 3 : 4;
        let kindScore = bossHeavyBones ? Math.floor(baseTriple * kindMultiplier * 0.75) : baseTriple * kindMultiplier;
        if (count === 3 && hasJoker(state, "triplet")) {
          kindScore = Math.round(kindScore * 1.5);
        }
        if (selectedIndices.some((die) => die.value === value && state.dice.types[die.index] === "heavy")) {
          kindScore = Math.round(kindScore * 1.5);
        }
        score += kindScore + state.upgrades.tripleBonus;
        labels.push(`${count}x${value}`);
        counts[value] -= count;
      }
    }

    if (!bossDryTable) {
      const singleOneScore = 100 + state.upgrades.singleOneBonus;
      const singleOneIndices = selectedIndices
        .filter((die) => die.value === 1)
        .slice(0, counts[1])
        .map((die) => die.index);
      score += singleOneIndices.reduce(
        (sum, index) => sum + singleOneScore * (state.dice.types[index] === "bullseye" ? 3 : 1),
        0
      );
      if (counts[1] > 0) {
        labels.push(`${counts[1]} one${counts[1] > 1 ? "s" : ""}`);
        counts[1] = 0;
      }
    }

    if (!bossBitterFive) {
      score += counts[5] * (50 + state.upgrades.singleFiveBonus);
      if (counts[5] > 0) {
        labels.push(`${counts[5]} five${counts[5] > 1 ? "s" : ""}`);
        counts[5] = 0;
      }
    }

    if (counts.some((count) => count > 0)) {
      return { valid: false, score: 0, label: "Invalid selection", multiplier: 1, flatBonus: 0 };
    }
  }

  score += flatBonus;
  if (hasJoker(state, "snake-eyes") && selectedValues.filter((value) => value === 1).length >= 2) {
    score += 250;
  }
  if (hasJoker(state, "just-one-more") && state.dice.rollCount >= 3) {
    score += 300;
  }
  if (options.includeMomentum !== false && hasJoker(state, "momentum")) {
    score += (state.flags.successfulScoresThisTurn + 1) * 100;
  }
  score += selectedValues.reduce((sum, value) => sum + (state.upgrades.dieFaceBonuses[value] ?? 0), 0);
  let multiplier = 1;

  if (hasJoker(state, "greedy")) {
    multiplier *= 1.2 ** Math.max(0, state.dice.rollCount - 1);
  }
  if (state.flags.feverCharges > 0) {
    multiplier *= 2 ** Math.min(3, state.flags.feverCharges);
  }
  if (hasJoker(state, "overtime") && state.run.turnsLeft === 1) {
    multiplier *= 1.5;
  }
  if (hasJoker(state, "double-or-nothing") && state.run.turnNumber === 1) {
    multiplier *= 2;
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

  const allLocked = next.dice.locked.every(Boolean);
  if (allLocked) {
    next.dice.locked.fill(false);
    next.dice.selected.fill(false);
    next.dice.hotDice = true;
  }

  if (next.run.currentBoss === "broken-cup" && next.dice.rollCount >= 2) {
    next.log.unshift(makeLog("Broken Cup blocks further rolls this turn.", "bad"));
    return next;
  }

  const firstRoll = next.dice.rollCount === 0;
  next.dice.values = firstRoll
    ? randomScoringDiceValues(next.run.currentBoss, hasJoker(next, "discount"))
    : next.dice.values.map((value, index) => (next.dice.locked[index] ? value : randomDie()));
  next.dice.selected.fill(false);
  next.dice.rollCount += 1;
  next.dice.awaitingAction = true;
  next.updatedAt = Date.now();

  const active = activeValues(next.dice);
  if (!options.deferFarkle && !hasAnyScoringDice(active, next.run.currentBoss, hasJoker(next, "discount"))) {
    return handleFarkle(next);
  }

  next.log.unshift(makeLog(`Roll ${next.dice.rollCount}: ${next.dice.values.join(" ")}`));
  return next;
}

export function toggleDieSelection(state: SaveData, index: number): SaveData {
  const next = cloneState(state);
  if (next.run.gameOver || next.shop.open || next.dice.rollCount <= 0 || next.dice.locked[index]) {
    return next;
  }

  const scoringIndices = getScoringIndices(next.dice.values, next.dice.locked, next.run.currentBoss, hasJoker(next, "discount"));
  if (!scoringIndices.has(index)) {
    return next;
  }

  const active = activeValues(next.dice);
  const counts = countsFor(active);
  const clickedValue = next.dice.values[index];
  const straightOnlyScore = straightScore(active, hasJoker(next, "discount")) > 0 && clickedValue !== 1 && clickedValue !== 5;
  const pairOnlyScore =
    active.length === 6 &&
    threePairsScore(active) > 0 &&
    clickedValue !== 1 &&
    clickedValue !== 5 &&
    counts[clickedValue] === 2;

  if (straightOnlyScore || pairOnlyScore) {
    const shouldSelect = next.dice.values.some((_, diceIndex) => !next.dice.locked[diceIndex] && !next.dice.selected[diceIndex]);
    next.dice.selected = next.dice.selected.map((selected, diceIndex) =>
      next.dice.locked[diceIndex] ? selected : shouldSelect
    );
    return next;
  }

  const kindOnlyScore =
    (clickedValue !== 1 && clickedValue !== 5 && counts[clickedValue] >= 3) ||
    (next.run.currentBoss === "dry-table" && clickedValue === 1 && counts[clickedValue] >= 3);
  if (kindOnlyScore) {
    const matchingIndices = next.dice.values
      .map((value, diceIndex) => ({ value, diceIndex }))
      .filter((die) => !next.dice.locked[die.diceIndex] && die.value === clickedValue)
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

export function confirmSelection(state: SaveData, options: { includeMomentum?: boolean } = {}): SaveData {
  const next = cloneState(state);
  const breakdown = calculateSelectedScore(next, options);
  if (!breakdown.valid || breakdown.score <= 0) {
    return next;
  }

  const activeBeforeSelection = activeValues(next.dice).length;
  const consumedFever = next.flags.feverCharges > 0;
  const hotDiceTriggered = next.dice.selected.every((selected, index) => selected || next.dice.locked[index]);

  next.run.turnScore += breakdown.score;
  next.dice.selected.forEach((selected, index) => {
    if (selected) {
      next.dice.locked[index] = true;
      next.dice.selected[index] = false;
    }
  });

  if (hotDiceTriggered) {
    if (hasJoker(next, "fever")) {
      next.flags.feverCharges = Math.min(3, next.flags.feverCharges + 1);
    }
    if (hasJoker(next, "clean-sweep")) {
      next.run.turnScore += 500;
    }
    next.dice.hotDice = true;
    next.log.unshift(makeLog(`Hot Dice. ${breakdown.label} scored ${breakdown.score}.`, "good"));
  } else {
    next.log.unshift(makeLog(`${breakdown.label} scored ${breakdown.score}.`, "good"));
  }

  if (hasJoker(next, "sparta") && activeBeforeSelection === 1) {
    next.run.turnScore *= 3;
    next.log.unshift(makeLog("Sparta tripled the turn score.", "good"));
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
  state.dice = {
    values: awaitingAction
      ? randomScoringDiceValues(state.run.currentBoss, hasJoker(state, "discount"))
      : randomDiceValues(),
    selected: Array(6).fill(false),
    locked: Array(6).fill(false),
    types: state.dice.types ?? basicDiceTypes(),
    disabled: state.dice.disabled ?? Array(6).fill(false),
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
  const breakdown: RewardBreakdownItem[] = [
    {
      id: "base",
      label: "clear",
      description: "Base reward for beating the round.",
      amount: 4
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

  const turnBonus = Math.max(0, state.run.turnsLeft);
  if (turnBonus > 0) {
    breakdown.push({
      id: "turns",
      label: "turns",
      description: `${turnBonus} turn${turnBonus === 1 ? "" : "s"} left after clearing.`,
      amount: turnBonus
    });
  }

  const wealthBonus = Math.min(5, Math.floor(state.run.money / 5));
  if (wealthBonus > 0) {
    breakdown.push({
      id: "interest",
      label: "stash",
      description: "Bonus from money already held, capped at $5.",
      amount: wealthBonus
    });
  }

  if (state.run.currentBoss === "poor-house") {
    const currentTotal = breakdown.reduce((sum, item) => sum + item.amount, 0);
    if (currentTotal > 0) {
      breakdown.push({
        id: "poor-house",
        label: "Poor House",
        description: "Boss penalty reduces round clear rewards.",
        amount: -Math.min(2, currentTotal)
      });
    }
  }

  return breakdown;
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
  if (hasJoker(next, "big-risk") && next.dice.rollCount >= 4) {
    banked *= 2;
  }
  if (next.run.currentBoss === "tax-collector") {
    banked = Math.floor(banked * 0.8);
  }

  next.run.roundScore += banked;
  if (hasJoker(next, "lucky-cash") && banked >= 1000) {
    next.run.money += 1;
  }
  if (hasJoker(next, "tax-refund") && [500, 1000, 1500, 2000].includes(banked)) {
    next.run.money += 1;
  }
  if (hasJoker(next, "pocket-change") && banked < 300) {
    next.run.money += 1;
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

  if (hasJoker(next, "band-aid") && !next.flags.bandAidUsedRound) {
    next.flags.bandAidUsedRound = true;
    next.dice.values = next.dice.values.map((value, index) => (next.dice.locked[index] ? value : randomDie()));
    next.dice.selected.fill(false);
    next.dice.awaitingAction = false;
    next.log.unshift(makeLog("Band-aid ignored the first Farkle this round.", "good"));
    next.updatedAt = Date.now();
    return next;
  }

  if (hasJoker(next, "insurance") && next.run.turnScore > 0) {
    const insured = Math.floor(next.run.turnScore * 0.3);
    next.run.roundScore += insured;
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
  const availableJokers = JOKERS.filter((joker) => joker.id !== "lucky-cash" && !state.jokers.includes(joker.id));
  const shuffledJokers = [...availableJokers].sort(() => Math.random() - 0.5).slice(0, 2);
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
    if (item.refId === "deal") {
      next.run.turnsLeft += 1;
    }
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
  const bonus = getHandUpgradeBonusAmount(state.upgrades, upgradeId);
  if (upgradeId === "one-upgrade") {
    state.upgrades.singleOneBonus += bonus;
  } else if (upgradeId === "five-upgrade") {
    state.upgrades.singleFiveBonus += bonus;
  } else if (upgradeId === "triple-upgrade") {
    state.upgrades.tripleBonus += bonus;
  } else if (upgradeId === "straight-upgrade") {
    state.upgrades.straightBonus += bonus;
  } else if (upgradeId === "three-pairs-upgrade") {
    state.upgrades.threePairsBonus += bonus;
  }
}

export function nextRound(state: SaveData): SaveData {
  const next = cloneState(state);
  if (!next.run.cleared) {
    return next;
  }

  next.run.round += 1;
  next.run.targetScore = getTargetForRound(next.run.round);
  next.run.roundScore = 0;
  next.run.turnScore = 0;
  next.run.turnsLeft = TURN_LIMIT;
  next.run.turnNumber = 1;
  next.run.cleared = false;
  next.run.lastRewardBreakdown = [];
  next.run.currentBoss = getBossForRound(next.run.round);
  next.shop.open = false;
  next.shop.items = [];
  next.flags.bandAidUsedRound = false;
  next.flags.feverCharges = 0;
  next.flags.successfulScoresThisTurn = 0;
  next.flags.hadFarkleRound = false;
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
