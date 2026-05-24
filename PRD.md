# PRD: Dungeon Alea MVP

## 1. Product Summary

**Dungeon Alea** is a mobile-friendly PWA game that combines:

* **Farkle-style dice scoring**
* **Balatro-style passive ?�Joker??modifiers**
* **Roguelike round progression**
* **Risk/reward banking decisions**

The player rolls dice, selects scoring dice, decides whether to **Bank** points or **Roll** again, and uses Jokers to create powerful scoring engines.

---

## 2. Core Concept

The game is built around one decision:

**Bank the current score safely, or roll again for a higher score and risk losing the entire turn.**

Balatro-inspired Jokers modify dice rules, scoring, rerolls, Farkle risk, and multiplier growth.

---

## 3. MVP Scope

### Included

* 6 dice
* Farkle scoring rules
* Dice selection
* Bank / Roll decision
* Farkle failure
* Hot Dice
* Round target scores (enemies)
* Money
* Shop
* Joker system
* 5 Joker slots
* 10 MVP Jokers
* Score upgrades
* boss rounds
* Game over / run clear
* Local save using IndexedDB
* Mobile-friendly PWA UI
* Sound effects
* Special dice types

## 4. Platform

### Target

* Web
* Mobile-first PWA
* Installable on iOS / Android home screen

### Tech Requirements

* Vite-based web app
* PWA manifest
* Service worker
* Offline cache
* IndexedDB for local save
* Responsive mobile layout
* Touch-friendly controls

---

## 5. Game Structure

### Run

A run continues indefinitely until the player loses.

### Round

Each round has:

* Target score
* Maximum number of turns
* Optional boss modifier
* Shop after clearing

### Turn

A turn consists of:

1. Roll dice
2. Select scoring dice
3. Add selected score to turn score
4. Choose:

   * **Bank**
   * **Roll**
5. If Roll produces no scoring dice, trigger **Farkle**
6. If Bank reaches target score, clear round

---

## 6. Win / Lose Conditions

### Win

There is no final round. The goal is to survive as many rounds as possible.

### Lose

Fail to reach the round target within the turn limit.

---

## 7. Round Targets

| Round | Target Score | Turn Limit |
| ----: | -----------: | ---------: |
|     1 |        1,000 |          5 |
|     2 |        1,500 |          5 |
|     3 |        2,200 |          5 |
|     4 |        3,200 |          5 |
|     5 |        4,700 |          5 |
|     6 |        6,800 |          5 |
|     7 |        9,500 |          5 |
|     8 |       13,000 |          5 |

Values are initial balance placeholders for the first 8 rounds. After that, targets continue scaling upward by formula or tuning table.

---

## 8. Dice Rules

### Dice Count

The player starts each turn with **6 dice**.

### Dice States

Each die can be:

* Active
* Selected
* Locked
* Disabled

### Selection

The player manually selects scoring dice.

Selected dice are locked after confirming a Roll.

### Roll

Only unlocked dice are rolled.

### Hot Dice

If all 6 dice are used for scoring, all dice become available again and the player may continue rolling with 6 dice.

---

## 9. Farkle Rules

A **Farkle** happens when a roll produces no scoring dice.

### Result

* Current turn score becomes 0
* Round score remains unchanged
* Turn ends
* One turn is consumed

---

## 10. Base Scoring Table

| Combination    |           Score |
| -------------- | --------------: |
| Single 1       |             100 |
| Single 5       |              50 |
| Three 1s       |           1,000 |
| Three 2s       |             200 |
| Three 3s       |             300 |
| Three 4s       |             400 |
| Three 5s       |             500 |
| Three 6s       |             600 |
| Straight 1??   |           1,500 |
| Three Pairs    |           1,500 |
| Four of a Kind | Triple score ×2 |
| Five of a Kind | Triple score ×3 |
| Six of a Kind  | Triple score ×4 |

---

## 11. Score Calculation

Final selected score:

```text
Base Combo Score
+ Upgrade Bonuses
+ Joker Flat Bonuses
× Joker Multipliers
```

The MVP should apply scoring in a predictable order:

1. Detect valid combinations
2. Calculate base score
3. Apply score upgrades
4. Apply Joker effects
5. Add result to turn score

---

## 12. Money

Money is used in the shop.

### Starting Money

```text
$4
```

### Round Clear Reward

| Condition                          | Reward |
| ---------------------------------- | -----: |
| Base clear reward                  |     $5 |
| Clear without Farkle               |    +$2 |
| Clear with 2× target score or more |    +$2 |

---

## 13. Shop

The shop appears after each cleared round.

### MVP Shop Items

| Item Type        | Count |
| ---------------- | ----: |
| Joker candidates |     3 |
| Score upgrade    |     1 |

### Actions

* Buy Joker
* Buy score upgrade
* Skip shop
* Proceed to next round

### Joker Price

| Rarity   | Price |
| -------- | ----: |
| Common   |    $3 |
| Uncommon |    $5 |
| Rare     |    $8 |

For MVP balance, all Jokers may initially cost **$5**.

---

## 14. Joker System

Jokers are passive rule modifiers.

### Rules

* Player has 5 Joker slots
* Jokers are bought in the shop
* Jokers apply automatically
* Duplicate Jokers are disabled in MVP
* Jokers may affect scoring, risk, rerolls, banking, or dice manipulation

---

## 15. MVP Jokers

| Joker        | Type            | Effect                                                     |
| ------------ | --------------- | ---------------------------------------------------------- |
| Lucky One    | Flat score      | Single 1 scores +50                                        |
| Sweet Five   | Flat score      | Single 5 scores +25                                        |
| Triple Maker | Combo score     | Any triple scores +200                                     |
| Greedy Mask  | Multiplier      | Each Roll in a turn increases turn multiplier by ×1.2      |
| Hot Hand     | Hot Dice        | After Hot Dice, next scoring result is ×2                  |
| Big Risk     | Risk multiplier | If the player rolls 3+ times before Banking, turn score ×2 |
| Safety Pin   | Defense         | First Farkle per round is ignored                          |
| Insurance    | Defense         | On Farkle, Bank 30% of current turn score                  |
| Reroll Charm | Control         | Once per turn, reroll one die                              |
| Flip Die     | Control         | Once per turn, change one die to `7 - value`               |

---

## 16. Score Upgrades

Score upgrades act like Balatro?�s Planet-card equivalent.

| Upgrade             | Effect             |
| ------------------- | ------------------ |
| One Upgrade         | Single 1 score +25 |
| Five Upgrade        | Single 5 score +25 |
| Triple Upgrade      | All triples +100   |
| Straight Upgrade    | Straight +500      |
| Three Pairs Upgrade | Three Pairs +500   |

---

## 17. Boss Rounds

Boss rounds are optional but included in MVP.

### Boss Timing

* Round 3
* Round 6
* Every 3 rounds after that

### MVP Boss Modifiers

| Boss          | Effect                       |
| ------------- | ---------------------------- |
| Dry Table     | Single 1s do not score       |
| Tax Collector | Banking reduces score by 20% |
| Broken Cup    | Maximum 2 Rolls per turn     |

Only one boss modifier is active per boss round.

---

## 18. Core Game State

```js
const state = {
  run: {
    round: 1,
    targetScore: 1000,
    roundScore: 0,
    turnScore: 0,
    turnsLeft: 5,
    money: 4,
    gameOver: false,
    cleared: false,
    currentBoss: null
  },

  dice: {
    values: [1, 5, 2, 3, 4, 6],
    selected: [false, false, false, false, false, false],
    locked: [false, false, false, false, false, false],
    rollCount: 0,
    hotDice: false
  },

  jokers: [],

  upgrades: {
    singleOneBonus: 0,
    singleFiveBonus: 0,
    tripleBonus: 0,
    straightBonus: 0,
    threePairsBonus: 0
  },

  shop: {
    items: []
  },

  meta: {
    bestRound: 1,
    totalRuns: 0
  }
};
```

---

## 19. Core Functions

```js
startRun()
startRound()
rollDice()
evaluateDice(values)
selectDie(index)
calculateSelectedScore()
confirmSelection()
bankScore()
handleFarkle()
applyJokers()
openShop()
generateShop()
buyShopItem(itemId)
nextRound()
checkRoundClear()
checkGameOver()
saveGame()
loadGame()
resetSave()
```

---

## 20. UI / UX Design Plan

## Design Goals

* Fast to understand
* One-handed vertical mobile play
* Clear risk/reward tension
* Large touch targets
* Minimal text during gameplay
* Strong score feedback



## Visual Art Direction
세로형 모바일 게임 UI
상단에는 전체 화면 너비를 차지하는 긴 상태 바가 있으며, 좌측에는 “Score” 라벨, 중앙에는 큰 숫자로 현재 점수가 표시된다.

그 아래 메인 정보 패널에는:

* 좌측: 적 캐릭터 초상화 박스
* 우측: 캐릭터 설명, 능력, 상태를 표시하는 직사각형 설명창
* 설명창 하단: 체력을 나타내는 가로형 프로그레스 바

중앙 영역에는 3개의 균등한 크기의 정사각형 정보 박스가 가로로 배치된다:

1. 돈
2. 누적 데미지
3. 남은 턴 수 

하단 메인 플레이 구역은 가로형 테이블 구조:

* 상단 행: 보유 아이템 슬롯
* 하단 행: 여러 개의 주사위 슬롯이 나열됨
* 각 칸은 분리된 테두리를 가지며 전략 보드게임 느낌
* 여러 주사위 결과와 자원 상태를 한눈에 볼 수 있도록 구성
* 아이템보다 주사위가 강조됨

최하단에는 액션 버튼 2개:

* 좌측: Roll (주사위 굴리기)
* 우측: Attack (공격 실행)

스타일 방향:

 A retro dark-fantasy roguelike dice game interface, styled like a pixel-art casino dungeon. Deep moss-green felt
  table, worn wood-and-bronze UI panels, parchment-ivory dice, gold and ember-orange highlights, muted cream text,
  chunky black pixel borders, layered arcade HUD, glowing scoring zones, relic and charm cards, pixelated fantasy item
  icons, dramatic vignette lighting, subtle radial glow, rich tactile materials, high-contrast readable layout, 90s
  arcade RPG meets tabletop gambling aesthetic, polished 2D game UI mockup, crisp pixel-art details with modern screen
  composition

## UX Rules

### Dice

* Tap die to select / deselect
* Selected dice show strong outline
* Locked dice appear dimmed
* Non-scoring dice cannot be selected
* Scoring dice are highlighted
* Farkle result should be visually obvious


## 22. Mobile Layout

### Requirements

* Portrait-first layout
* No hover-only interactions

---

## 23. PWA Requirements

### Manifest

Include:

* App name
* Short name
* Icons
* Start URL
* Display mode: standalone
* Theme color
* Background color
* Portrait orientation preferred

### Service Worker

Cache:

* App shell
* JS bundle
* CSS
* Icons
* Static assets

### Offline Behavior

* Game should load offline after first visit
* Save should work offline
* No network dependency for MVP

---

## 24. IndexedDB Save Plan

Use IndexedDB for local persistence.

### Save Key

```text
main
```

### Save Data

Persist:

* Current run state
* Dice state
* Jokers
* Upgrades
* Money
* Current shop
* Meta stats
* Save version
* Created / updated timestamps

### Required Save Functions

```js
loadSave()
writeSave(state)
deleteSave()
createInitialState()
migrateSave(save)
```

### Save Timing

Save after:

* Roll
* Bank
* Farkle
* Shop purchase
* Round clear
* Next round
* Game over

---

## 25. MVP Build Phases

### Phase 1: Core Farkle Loop

Goal: prove the basic game is fun.

Includes:

* Dice rolling
* Dice selection
* Scoring
* Bank
* Roll
* Farkle
* Hot Dice
* Round target
* Game over

### Phase 2: Balatro Layer

Goal: add build-making.

Includes:

* Jokers
* Joker slots
* Shop
* Money
* Score upgrades

### Phase 3: Run Structure

Goal: make it replayable.

Includes:

* Infinite run progression
* Boss rounds
* IndexedDB save
* PWA install/offline support
* Basic meta stats

---

## 26. Success Criteria

The MVP is successful if:

* A run can continue indefinitely until the player loses
* Bank/Roll decisions feel meaningful
* Farkle feels risky but fair
* Jokers change player behavior
* Shop choices affect strategy
* The game works well on mobile
* The game can be installed as a PWA
* Progress persists locally through IndexedDB

---

## 27. Final MVP Definition

```text
A mobile-first PWA dice roguelike where the player rolls 6 dice, selects scoring dice, Banks points or Rolls again, risks losing turn points through Farkle, survives endlessly escalating rounds, buys Jokers and score upgrades from shops, and builds a scoring engine through passive rule modifiers saved locally with IndexedDB.
```

https://www.pixellab.ai/create?tool=create_m_xl_image