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
    description: "Exactly 3 selected dice score x2.",
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
    description: "On Farkle, give 50% of current damage.",
    price: 5
  },
  {
    id: "my-bad",
    name: "My bad",
    type: "Control",
    description: "A non-scoring die rerolls itself.",
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
    description: "Two 1s score x4.",
    price: 5
  },
  {
    id: "clean-sweep",
    name: "Clean Sweep",
    type: "Hot Dice",
    description: "Gain +$2 after Hot Dice.",
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
    description: "Bank after 3 or fewer rolls to gain +$1.",
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
  },
  {
    id: "hold-em",
    name: "Hold'em",
    type: "Combo rule",
    description: "Add Two Pairs and Full House.",
    price: 5
  },
  {
    id: "gold-mine",
    name: "Gold Mine",
    type: "Economy",
    description: "Gain +$2 when clearing a round.",
    price: 5
  },
  {
    id: "investment",
    name: "Investment",
    type: "Economy",
    description: "Receive double interest.",
    price: 5
  },
  {
    id: "golden-ratio",
    name: "Golden Ratio",
    type: "Multiplier",
    description: "All scoring x1.6.",
    price: 5
  },
  {
    id: "the-portrait",
    name: "The Portrait",
    type: "Copy",
    description: "Copies one owned Joker each round.",
    price: 5
  },
  {
    id: "wake-up",
    name: "Wake Up",
    type: "Recovery",
    description: "15% chance to reactivate all dice.",
    price: 5
  },
  {
    id: "faustian-bargain",
    name: "Bargain",
    type: "Turn economy",
    description: "7% chance to spend $1 and gain +1 turn.",
    price: 5
  }
];

export const UPGRADES: UpgradeDefinition[] = [
  { id: "one-upgrade", name: "one", description: "multiply 2.", price: 7 },
  { id: "two-upgrade", name: "two", description: "multiply 2.", price: 2 },
  { id: "three-upgrade", name: "three", description: "multiply 2.", price: 2 },
  { id: "four-upgrade", name: "four", description: "multiply 2.", price: 2 },
  { id: "five-upgrade", name: "five", description: "multiply 2.", price: 4 },
  { id: "six-upgrade", name: "six", description: "multiply 2.", price: 3 }
];

export const SPECIAL_DICE: SpecialDieDefinition[] = [
  {
    id: "heavy",
    name: "Heavy dice",
    description: "If it's in triple or better, x2.",
    price: 5,
    image: assetPath("/dice-heavy.png")
  },
  {
    id: "zombie",
    name: "Zombie",
    description: "Prevents one Farkle.",
    price: 5,
    image: assetPath("/dice-zombie.png")
  },
  {
    id: "bullseye",
    name: "Bull's Eye",
    description: "Single 1 score is tripled.",
    price: 5,
    image: assetPath("/dice-bullseye.png")
  },
  {
    id: "glass",
    name: "Glass",
    description: "When scored x5 the damage then breaks.",
    price: 7,
    image: assetPath("/dice-glass.png")
  },
  {
    id: "bloody",
    name: "Bloody",
    description: "When scored x1.2 turn damage.",
    price: 6,
    image: assetPath("/dice-bloody.png")
  }
];

export const BOSSES: Record<BossId, { name: string; descriptions: string[] }> = {
  "bone-croupier": {
    name: "Bone Croupier",
    descriptions: [
      "He deals a mean hand for someone missing all his fingers.",
      "Every roll is a bone-us round to him.",
      "He keeps an ace up his sleeve. It may be a rib.",
      "His poker face is permanently attached.",
      "He says the odds are in his bones.",
      "No pulse, no nerves, no mercy.",
      "He rattles when the table gets tense.",
      "He has never folded. His joints will not allow it.",
      "The house edge is mostly sharpened bone.",
      "Tip the dealer, or he may collect a finger."
    ]
  },
  "dry-table": {
    name: "Dustbone Dealer",
    descriptions: [
      "The table is dusty. The dealer is dustier.",
      "He has been waiting so long the cards became fossils.",
      "Every bet comes with a complimentary cough.",
      "He shuffles cards and several centuries of dust.",
      "The table was cleaned once. He filed a complaint.",
      "He calls that gray cloud his lucky atmosphere.",
      "Nobody knows whether he is bluffing or just dehydrated.",
      "His best hand is a full dust.",
      "He deals slowly. Archaeology takes time.",
      "Please do not sneeze near the jackpot."
    ]
  },
  "tax-collector": {
    name: "Vampire Tithe",
    descriptions: [
      "He prefers his payments warm and slightly terrified.",
      "Your winnings are subject to a small blood fee.",
      "He only works the graveyard shift.",
      "The house always takes a cut. He takes two.",
      "He promises the bite is tax deductible.",
      "Late payments accrue interest and puncture marks.",
      "He has excellent taste and terrible table manners.",
      "Your wallet is not the only thing feeling light.",
      "He cannot enter your account without an invitation.",
      "He calls it withholding. You call it blood loss."
    ]
  },
  "broken-cup": {
    name: "Cupbone Brute",
    descriptions: [
      "He broke the cup, the table, and most of the house rules.",
      "He rolls dice by threatening them.",
      "His strategy is simple: hit the problem until it scores.",
      "The cup was stronger before he picked it up.",
      "He believes subtlety is a kind of weak punch.",
      "His lucky charm is property damage.",
      "The dealer asked him to shake the cup, not the building.",
      "Every roll sounds like a renovation project.",
      "He has a soft spot. Nobody has found it.",
      "The house banned him. He broke back in."
    ]
  },
  "bitter-five": {
    name: "Bitter Acolyte",
    descriptions: [
      "Still furious that five only scores fifty.",
      "He prayed for sixes and received character development.",
      "Every single five feels personal.",
      "His faith is strong. His rolls are not.",
      "He chants until the dice feel guilty.",
      "He considers luck a poorly managed department.",
      "The temple rejected his request to ban Farkles.",
      "He has forgiven nobody, especially the dice.",
      "His sermons end with a strongly worded reroll.",
      "He came seeking enlightenment and found another five."
    ]
  },
  "heavy-bones": {
    name: "Iron Prior",
    descriptions: [
      "All armor, no indoor voice.",
      "His dice rolls require structural reinforcement.",
      "He calls every bet a crusade.",
      "The armor is polished. The manners are not.",
      "He kneels only when the floor gives way.",
      "His poker face comes with a visor.",
      "He brought faith, steel, and no sense of proportion.",
      "Even his small talk lands heavily.",
      "The table groans before he places a bet.",
      "He believes luck should wear a helmet."
    ]
  },
  "poor-house": {
    name: "Vault Hierophant",
    descriptions: [
      "Your money would look much better in his vault.",
      "He has taken a sacred vow of other people's poverty.",
      "Every coin is a donation if he says it solemnly enough.",
      "His blessings come with processing fees.",
      "The vault is holy. Withdrawals are heresy.",
      "He can smell loose change through solid stone.",
      "His collection plate has a combination lock.",
      "He promises your money will find a higher purpose.",
      "The sermon is free. Leaving is expensive.",
      "He worships compound interest and locked doors."
    ]
  }
};
