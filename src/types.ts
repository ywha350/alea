export type JokerId =
  | "triplet"
  | "greedy"
  | "big-risk"
  | "band-aid"
  | "insurance"
  | "my-bad"
  | "just-one-more"
  | "sparta"
  | "fever"
  | "lucky-cash"
  | "deal"
  | "discount"
  | "snake-eyes"
  | "clean-sweep"
  | "momentum"
  | "tax-refund"
  | "pocket-change"
  | "double-or-nothing"
  | "overtime";

export type UpgradeId =
  | "one-upgrade"
  | "five-upgrade"
  | "triple-upgrade"
  | "straight-upgrade"
  | "three-pairs-upgrade";

export type SpecialDieId = "basic" | "heavy" | "zombie" | "bullseye";

export type BossId =
  | "bone-croupier"
  | "dry-table"
  | "tax-collector"
  | "broken-cup"
  | "bitter-five"
  | "heavy-bones"
  | "poor-house";

export interface JokerDefinition {
  id: JokerId;
  name: string;
  type: string;
  description: string;
  price: number;
}

export interface UpgradeDefinition {
  id: UpgradeId;
  name: string;
  description: string;
  price: number;
}

export interface SpecialDieDefinition {
  id: Exclude<SpecialDieId, "basic">;
  name: string;
  description: string;
  price: number;
  image: string;
}

export interface RunState {
  round: number;
  targetScore: number;
  totalScore: number;
  roundScore: number;
  bossKillScore: number;
  turnScore: number;
  turnsLeft: number;
  turnNumber: number;
  money: number;
  gameOver: boolean;
  cleared: boolean;
  currentBoss: BossId | null;
  lastRewardBreakdown: RewardBreakdownItem[];
}

export interface DiceState {
  values: number[];
  types: SpecialDieId[];
  disabled: boolean[];
  selected: boolean[];
  locked: boolean[];
  rollCount: number;
  hotDice: boolean;
  canRerollSingle: boolean;
  canFlipSingle: boolean;
  awaitingAction: boolean;
}

export interface UpgradeState {
  singleOneBonus: number;
  singleFiveBonus: number;
  tripleBonus: number;
  straightBonus: number;
  threePairsBonus: number;
  dieFaceBonuses: number[];
}

export interface ShopItem {
  id: string;
  kind: "joker" | "die-upgrade" | "hand-upgrade" | "special-die";
  refId: JokerId | UpgradeId | SpecialDieId;
  price: number;
  purchased: boolean;
  bonus?: number;
}

export interface LogEntry {
  id: string;
  text: string;
  tone?: "good" | "bad" | "neutral";
}

export interface RewardBreakdownItem {
  id: string;
  label: string;
  description: string;
  amount: number;
}

export interface MetaState {
  bestRound: number;
  totalRuns: number;
}

export interface SaveData {
  version: number;
  createdAt: number;
  updatedAt: number;
  run: RunState;
  dice: DiceState;
  jokers: JokerId[];
  upgrades: UpgradeState;
  shop: { items: ShopItem[]; open: boolean };
  meta: MetaState;
  log: LogEntry[];
  flags: {
    bandAidUsedRound: boolean;
    feverCharges: number;
    successfulScoresThisTurn: number;
    hadFarkleRound: boolean;
  };
}

export interface ScoreBreakdown {
  valid: boolean;
  score: number;
  label: string;
  multiplier: number;
  flatBonus: number;
}
