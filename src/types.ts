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
  | "overtime"
  | "hold-em"
  | "gold-mine"
  | "investment"
  | "golden-ratio"
  | "the-portrait"
  | "odd-choice"
  | "duality"
  | "wake-up"
  | "faustian-bargain";

export type UpgradeId =
  | "one-upgrade"
  | "two-upgrade"
  | "three-upgrade"
  | "four-upgrade"
  | "five-upgrade"
  | "six-upgrade";

export type SpecialDieId =
  | "basic"
  | "heavy"
  | "zombie"
  | "bullseye"
  | "glass"
  | "bloody"
  | "wild"
  | "foresight"
  | "scholar"
  | "anchor";

export type BossId =
  | "bone-croupier"
  | "dry-table"
  | "tax-collector"
  | "broken-cup"
  | "bitter-five"
  | "heavy-bones"
  | "poor-house";

export type BossTone = "base" | "blue" | "red" | "green" | "purple" | "gold" | "ashen";

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
  currentBossTone: BossTone;
  bossDescriptionIndex: number;
  lastRewardBreakdown: RewardBreakdownItem[];
}

export interface DiceState {
  values: number[];
  types: SpecialDieId[];
  foresightNext: Array<number | null>;
  anchorFixed: boolean[];
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
  faceUpgradeLevels: number[];
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
    bandAidUsesRound: number;
    feverCharges: number;
    successfulScoresThisTurn: number;
    hadFarkleRound: boolean;
    portraitCopiedJoker: JokerId | null;
    dualityStacks: {
      original: number;
      portrait: number;
    };
  };
}

export interface ScoreBreakdown {
  valid: boolean;
  score: number;
  label: string;
  multiplier: number;
  flatBonus: number;
}
