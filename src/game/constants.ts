import { assetPath } from "./asset";
import type { BossId, JokerDefinition, SpecialDieDefinition, UpgradeDefinition } from "../types";

export const TARGETS = [1000, 1500, 2200, 3200, 4700, 6800, 9500, 13000];
export const TURN_LIMIT = 5;
export const SAVE_KEY = "main";
export const SAVE_VERSION = 1;

export const JOKERS: JokerDefinition[] = [
  {
    id: "triplet",
    name: "Triplet",
    type: "Combo score",
    description: "Any triple scores x1.5.",
    price: 5
  },
  {
    id: "greedy",
    name: "Greedy",
    type: "Multiplier",
    description: "Each roll multiplies scoring by x1.2.",
    price: 5
  },
  {
    id: "big-risk",
    name: "Big Risk",
    type: "Risk multiplier",
    description: "4+ rolls to double the damage.",
    price: 5
  },
  {
    id: "band-aid",
    name: "Band-aid",
    type: "Defense",
    description: "First Farkle per round is ignored.",
    price: 5
  },
  {
    id: "insurance",
    name: "Insurance",
    type: "Defense",
    description: "On Farkle, give 30% of current damage.",
    price: 5
  },
  {
    id: "my-bad",
    name: "My bad",
    type: "Control",
    description: "Every roll a random non-scoring die rerolls itself.",
    price: 5
  },
  {
    id: "just-one-more",
    name: "Just One More",
    type: "Roll bonus",
    description: "After 3+ rolls, gain +300 damage.",
    price: 5
  },
  {
    id: "sparta",
    name: "Sparta",
    type: "Risk multiplier",
    description: "If last one die scores, X3",
    price: 5
  },
  {
    id: "fever",
    name: "Fever",
    type: "Hot Dice",
    description: "After hot dice, x2 damage.",
    price: 5
  },
  {
    id: "lucky-cash",
    name: "Lucky Cash",
    type: "Economy",
    description: "When 1000+ damage, +$1.",
    price: 5
  },
  {
    id: "deal",
    name: "Deal",
    type: "Turn economy",
    description: "Start each round with +1 turn.",
    price: 5
  },
  {
    id: "discount",
    name: "Discount",
    type: "Combo rule",
    description: "Now small straigts count.",
    price: 5
  },
  {
    id: "snake-eyes",
    name: "Snake Eyes",
    type: "Combo score",
    description: "If two 1s are in a roll, +250.",
    price: 5
  },
  {
    id: "clean-sweep",
    name: "Clean Sweep",
    type: "Hot Dice",
    description: "Gain +500 points after Hot Dice.",
    price: 5
  },
  {
    id: "momentum",
    name: "Momentum",
    type: "Scaling",
    description: "Each roll adds 20% damage.",
    price: 5
  },
  {
    id: "tax-refund",
    name: "Tax Refund",
    type: "Economy",
    description: "Damage 500, 1000, 1500, 2000 to gain +$1.",
    price: 5
  },
  {
    id: "pocket-change",
    name: "Pocket Change",
    type: "Economy",
    description: "Every damage under 300 gives +$1.",
    price: 5
  },
  {
    id: "double-or-nothing",
    name: "Double or Not",
    type: "Risk multiplier",
    description: "The first score is doubled.",
    price: 5
  },
  {
    id: "overtime",
    name: "Overtime",
    type: "Turn economy",
    description: "On the final turn, damage x1.5.",
    price: 5
  }
];

export const UPGRADES: UpgradeDefinition[] = [
  { id: "one-upgrade", name: "One Upgrade", description: "Single 1 score x1.5 from its current value.", price: 4 },
  { id: "five-upgrade", name: "Five Upgrade", description: "Single 5 score x1.5 from its current value.", price: 4 },
  { id: "triple-upgrade", name: "Triple Upgrade", description: "Triple bonus x1.5 from its current value.", price: 4 },
  { id: "straight-upgrade", name: "Straight Upgrade", description: "Straight score x1.5 from its current value.", price: 4 },
  {
    id: "three-pairs-upgrade",
    name: "Three Pairs Upgrade",
    description: "Three pairs score x1.5 from its current value.",
    price: 4
  }
];

export const SPECIAL_DICE: SpecialDieDefinition[] = [
  {
    id: "heavy",
    name: "Heavy Die",
    description: "If it's in triple or better, x1.5.",
    price: 5,
    image: assetPath("/dice-heavy.png")
  },
  {
    id: "zombie",
    name: "Zombie Die",
    description: "If left active, prevents one Farkle.",
    price: 5,
    image: assetPath("/dice-zombie.png")
  },
  {
    id: "bullseye",
    name: "Bull's Eye",
    description: "Single 1 score is tripled.",
    price: 5,
    image: assetPath("/dice-bullseye.png")
  }
];

export const BOSSES: Record<BossId, { name: string; description: string }> = {
  "bone-croupier": { name: "Bone Croupier", description: "A skeletal opponent with no special rule." },
  "dry-table": { name: "Dustbone Dealer", description: "A skull opponent with no special rule." },
  "tax-collector": { name: "Vampire Tithe", description: "A vampire opponent with no special rule." },
  "broken-cup": { name: "Cupbone Brute", description: "A brute opponent with no special rule." },
  "bitter-five": { name: "Bitter Acolyte", description: "An acolyte opponent with no special rule." },
  "heavy-bones": { name: "Iron Prior", description: "An armored opponent with no special rule." },
  "poor-house": { name: "Vault Hierophant", description: "A vault keeper opponent with no special rule." }
};
