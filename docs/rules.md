# Riftbound: The League of Legends TCG — Engine Implementation Rules Reference

**Primary source:** Official *Riftbound Core Rules*, Last Updated 2026-07-16 (PDF linked from
<https://playriftbound.com/en-us/rules-hub/>, CDN copy at
`https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/e9ac8e3d33e0f78cef296f5945aba7bc1313b086.pdf`).
Local copies: `/tmp/rbdata/off2.pdf` (Core Rules), `/tmp/rbdata/off1.pdf` (Tournament Rules 7/16/2026),
extracted text `/tmp/rbdata/core_body.txt`.
Rule numbers below (e.g. `§318`) refer to the Core Rules numbering.

Everything in sections 1–14 is taken directly from the official Core Rules. Section 15 lists what
could not be confirmed.

---

## 0. Two meta-rules that override everything

- **Golden Rule (§001):** card text supersedes rules text. When a card fundamentally contradicts
  the rules, the card wins.
- **Silver Rule (§002):** card text uses different terminology than rules text. Interpret card text
  *according to* these rules, not as if it were rules text.
- **"Can't beats Can" (§053):** effects that forbid supersede effects that permit. "Only"
  restrictions are absolute.
- **Impossible instructions (§054):** do as much as you can, ignore impossible instructions. A card
  whose instructions are all impossible is still *played and resolved*; nothing happens.
- **Zone ownership (§055):** a card may never be placed into a *non-Board* zone belonging to another
  player. If it would, it goes to its owner's corresponding zone instead. (Non-Board zones per
  player: Main Deck, Rune Deck, Trash, Hand, Chosen Champion zone, Banishment.)
- **Self-reference (§052):** units and legends say "I/me"; gear and spells say "this";
  battlefields say "here".
- **"Card" in card text means "Main Deck card"** (§051). Runes, legends and battlefields are *not*
  "cards" for card effects (they are cards for rules purposes).

---

## 1. Deck construction (§101–§103)

A player's "deck" = Main Deck + Rune Deck + Champion Legend + Battlefields.

### 1.1 Champion Legend (exactly 1)
- Placed in the **Legend Zone** at the start of the game; never leaves; cannot be moved/killed.
- Its domains define the deck's **Domain Identity**.
  - A single-domain card is legal in any identity containing that domain.
  - A multi-domain card is legal only if the identity contains **all** of its domains.
  - Effects may add cards to the deck ignoring domain; those cards count as within identity.

### 1.2 Main Deck — minimum 40 cards
- Contains Units, Gear, Spells (and the Chosen Champion).
- **Max 3 copies of the same *name***. Different subtitles = different names
  (e.g. 3× *Yasuo, Remorseful* + 3× *Yasuo, Windrider* is legal).
- A card's name is `"[Short Name], [Subtitle]"` for all purposes.
- **Chosen Champion** (exactly 1, taken out of the Main Deck at setup):
  - Must be a **champion unit** whose **champion tag matches the tag on your Champion Legend**.
  - Signature units are **not** champion units and cannot be the Chosen Champion.
  - Starts the game in the **Champion Zone** (public).
  - "Chosen Champion" during play means *any* Champion Unit with that same name, anywhere
    (deck, hand, trash, board) — not just the physical starting copy.
  - The Chosen Champion still counts against the 3-copy limit: you may run 2 more copies in the
    Main Deck.
- **Signature cards:** at most **3 total Signature cards** in the deck, all of which must carry the
  champion tag matching your Champion Legend. This is a sum across names, not per-name.
- **Unique** cards: only 1 copy of that name (§826). A Unique Signature card still counts toward the
  3-signature budget but is limited to 1 copy.
- Subject to format legality (ban list).

### 1.3 Rune Deck — exactly 12 rune cards
- Must be within the deck's Domain Identity.
- Shuffled separately, kept separate from the Main Deck.

### 1.4 Battlefields
- Count set by Mode of Play. **In 1v1 each player brings 3 battlefields**; no duplicate names.
- Subject to Domain Identity if applicable.

> **Engine note:** there is no separate "battlefield deck" that is drawn from. Battlefields are a
> fixed presented set; setup selects which ones enter the Battlefield Zone.

---

## 2. Zones / spaces (§105–§118)

### The Board (public)
| Zone | Notes |
|---|---|
| **Base** (one per player) | A **Location**. Holds permanents and runes that player controls, plus permanents attached to them. Public. |
| **Battlefield Zone** | Holds all battlefields in play. **Each battlefield is its own Location.** Public. |
| **Facedown Zone** | One per battlefield; **max occupancy 1 card** (can be modified). Only the controller of the battlefield may have cards there. If control of the battlefield is lost, cards there are removed in the next Cleanup. The zone is public; the facedown cards are **Private**. Facedown Zones are *not* Locations. |
| **Legend Zone** (one per player) | Holds the Champion Legend (a Game Object, not a permanent, not a Location). Champion Legend can never leave. Non-champion legends added by effects *may* leave, but only to Banishment. |

### Non-Board zones
| Zone | Privacy | Notes |
|---|---|---|
| **The Chain** | Public | Exists only while it holds items. Only one chain at a time. |
| **Trash** (per player) | Public | Unordered. Destination for killed/discarded cards, resolved spells, etc. |
| **Champion Zone** (per player) | Public | Chosen Champion starts here and may be played from here. It cannot be returned here by normal means; an effect returning it works only if the zone is empty. |
| **Main Deck Zone** (per player) | Order is **Secret** | |
| **Rune Deck Zone** (per player) | Order is **Secret** | |
| **Banishment** (per player) | Public, unordered | Cards removed from play "hard", or a temp holding area. |
| **Hand** (per player) | **Private** (count is public) | Unordered; can be targeted as a zone. |

Privacy levels (§128): **Secret** (no one may look), **Private** (only controller/owner),
**Public** (anyone). A player **cannot be compelled** to act on secret/private cards when the
instruction specifies a card type/quality — they may treat it as impossible (§128.6).

**Object identity (§124):** a Game Object that changes zones **to or from a Non-Board zone becomes a
new object**. All temporary modifications stop being tracked: damage cleared, counters removed,
granted keywords lost, statuses cleared. (Moving between Board locations does *not* reset it.)

Statuses a Game Object can have (§125, non-exhaustive): Attached, Attacking, Buffed, Banished,
Controlled, Defending, Empowered, Equipped, Exhausted, Facedown, Readied, Replaced, Revealed,
Stunned, plus applied Layer alterations.

---

## 3. Setup (§115) and 1v1 mode (§486)

### Setup procedure, in order
1. Each player puts their **Champion Legend** in the Legend Zone.
2. Each player puts their **Chosen Champion** in the Champion Zone.
3. Each player sets aside their **Battlefields** (Mode of Play dictates placement).
4. Each player **shuffles Main Deck and Rune Deck separately** and places them in their zones.
5. **Determine turn order** by any fair random method agreed by all players. Turn order is a
   repeating loop; the Mode of Play specifies how the First Player is determined; otherwise seating
   order proceeds clockwise from the First Player.
6. **Each player draws 4.**
7. **Mulligan, in turn order:** a player may choose **up to two** cards in hand, set them aside,
   **draw that many**, then **Recycle** (bottom of Main Deck) the set-aside cards. One mulligan
   round only, and it is a *partial* mulligan of at most 2 cards.
8. Play begins with the First Player.

### 1v1 (Duel) — §486
- 2 players, no teams, 1 opponent.
- **Victory Score: 8 points.**
- **Battlefield Count: 2.** Each player brings 3 battlefields; **each randomly selects 1**; the other
  two are removed from the game. The two selected battlefields are placed **simultaneously** into the
  Battlefield Zone. (Both battlefields are shared/neutral terrain — they start **Uncontrolled**.)
- Format: Best of 1.
- **First-turn adjustment: the player going second channels one extra rune during their first
  Channel Phase** (i.e. 3 instead of 2). The player going first still draws normally in a 2-player
  game (the "no draw on first turn" rule is only in 3+ player modes).

### 1v1 (Match) — §487
Same as Duel except battlefield selection is *chosen*, not random, and used battlefields are
retired between games of a Bo3/Bo5.

---

## 4. Turn structure (§306, §315–§318)

Order of phases each turn:

```
START OF TURN
  1. Awaken Phase
  2. Beginning Phase
       a. Beginning Step      ("at the start of Beginning Phase" effects)
       b. Scoring Step        (HOLD scoring)
  3. Channel Phase
  4. Draw Phase
MAIN PHASE
  (rune pool empties; "at the start of Main Phase" effects; free-form play,
   including any number of Showdowns/Combats)
ENDING PHASE
  a. Ending Step             ("at the end of turn" effects)
  b. Expiration Step         (Ending Special Cleanup: heal all, expire "this turn", empty pools)
NEXT PLAYER BECOMES TURN PLAYER
```

### 4.1 Awaken Phase (§315.1)
Outstanding task: **the Turn Player readies all Game Objects they control that are able to be
readied.** This includes units, gear, **runes**, and legends. (So yes: runes refresh every turn, at
the start of their controller's turn only.)

### 4.2 Beginning Phase (§315.2)
- **Beginning Step:** "at the start of Beginning Phase" triggers happen.
  (Note: `[Temporary]` kills its permanent at the start of the Beginning Phase, **before scoring**.)
- **Scoring Step:** *"The Turn Player **Holds** all Battlefields they Control."* This is the only
  scheduled scoring in the turn. See §7.

### 4.3 Channel Phase (§315.3)
- **The Turn Player channels 2 runes from their Rune Deck.** If fewer than 2 remain, channel as many
  as possible. (In 1v1, the second player channels 3 on their first turn only.)
- Runes are channeled **ready** by default.

### 4.4 Draw Phase (§315.4)
- The Turn Player **draws 1**. If the Main Deck is empty they **Burn Out** first, then still draw 1.

### 4.5 Main Phase (§316)
Outstanding tasks, in order:
1. **Each player's Rune Pool empties.** All unspent Energy and Power is lost.
2. "At the start of Main Phase" effects.

Then: no defined structure. The Turn Player may take any number of Discretionary Actions. Default
state is **Neutral Open**; only the Turn Player may play spells / activate abilities. Showdowns and
Combats occur here, produced by Cleanups (§318 steps 9–10).

The Main Phase ends when the Turn Player declares they are ending their turn.

### 4.6 Ending Phase (§317)
- **Ending Step:** "at the end of the turn" effects.
- **Expiration Step:** invoke an **Ending Special Cleanup**, i.e. a normal Cleanup (§318) with these
  inserted:
  - `3c. Heal all Units.` (all damage clears)
  - `3d. All "this turn" effects expire simultaneously.` (this is also where **Stunned** clears)
  - `3e. Each player's Rune Pool empties; unspent Energy and Power lost.`
  - Then: *if any items underwent the FEPR process, return to the start of the Expiration Step*
    (loop until stable).
- The next queued player becomes the Turn Player.

### 4.7 Additional turns (§735)
"Take a turn after this" inserts an Additional Turn into the turn queue immediately after the
current turn without altering base turn order. Multiple additional turns queue in creation order.

---

## 5. States, priority, focus (§307, §312)

Two orthogonal axes — **always exactly one of four states**:

| | Neutral (no showdown/combat) | Showdown (showdown or combat in progress) |
|---|---|---|
| **Open** (no chain) | Neutral Open — default; only Turn Player acts | Showdown Open — the player with **Focus** acts; needs `[Action]` or `[Reaction]` |
| **Closed** (chain exists) | Neutral Closed — only `[Reaction]` | Showdown Closed — only `[Reaction]` |

- **Priority** = the exclusive right to take Discretionary Actions. At most one player has it.
  Limited Actions can be taken without priority when instructed.
- A player receives priority when: (a) Neutral Open during **their** Main Phase; (b) Showdown State
  and they gain Focus; (c) Closed State, all pending items finalized, and they control the next item
  on the chain; (d) Closed State, they're next in turn order, and the priority holder passes.
- **Focus** = permission to act during a **Showdown Open** state. At most one player has it. Gaining
  Focus also grants Priority. Passing Priority *retains* Focus. You cannot act on Focus without also
  holding Priority. **In a Neutral State no one has Focus.**

---

## 6. Resources: Energy, Power, Runes (§162–§165, §429, §430)

### 6.1 The two resource types
- **Energy** — generic, no domain, no type. Pays the numeric part of a cost (the numeral in the
  upper-left cost element).
- **Power** — has a Domain. Pays the symbol part of a cost (symbols listed vertically in the cost
  element). Some Power is Universal (`[A]`) and pays any domain.

### 6.2 Runes
- Rune is a card type, kept in the 12-card Rune Deck. A rune is **not a Main Deck card**, therefore
  **not a permanent**, even though it stays on the board.
- Every **Basic Rune** (Fury/Calm/Mind/Body/Chaos/Order Rune) has exactly two abilities:
  - `[E]: [Reaction] — Add [1].` (exhaust → 1 Energy)
  - `Recycle this: [Reaction] — Add [C].` (recycle → 1 Power of **that rune's** domain)
- **Recycling a rune puts it on the bottom of the Rune Deck** (§416). That is the rune-deck cycle:
  runes spent for Power leave the board and return to the bottom of the Rune Deck, where they can
  be channeled again later.
- Runes enter ready by default when channeled (§430.2).
- Runes are readied during your Awaken Phase along with everything else you control.
- **Both rune abilities carry `[Reaction]`**, so runes can be tapped/recycled for resources at any
  time a cost must be paid — including mid-resolution and during an opponent's turn (§429.2, §444).

### 6.3 Channel (§430)
- Channel = take N runes from the **top of the Rune Deck** and put them **on the board (in base)**.
- Default state: ready. Effects may specify "channel exhausted".
- **Channel 2 per turn** from the Channel Phase; additional channels only from card effects. There
  is no per-turn cap other than what effects provide.
- If the Rune Deck is short, channel as many as possible (no Burn Out from running out of runes).

### 6.4 Rune Pool (§165)
- Conceptual pool of unspent Energy and Power. `Add` puts resources into it.
- **Empties at the start of each player's Main Phase and at the end of each player's turn.**
  Unspent resources are lost.
- `Add` abilities (triggered/activated) **resolve immediately on finalization** and do not pass
  Priority or Focus (§429.1). Spells that Add linger on the chain normally.

### 6.5 Symbols and shorthands (§135.2.d)
| Shorthand | Meaning |
|---|---|
| `[1]`, `[2]`, … | That much **Energy** |
| `[E]` | **Exhaust** this permanent (cost). *Older documents wrote this as `[T]`.* |
| `[M]` | **Might**. *Older documents wrote this as `[S]`.* |
| `[A]` | **Power of any Domain** (rainbow swirl). As a cost, payable by any domain's Power; when Added, spendable on any domain's Power cost. |
| `[C]` | **Power matching this card's own Domain.** Not printed as a symbol — rules shorthand. On a domainless card, `[C]` is processed as `[A]`. On a multi-domain card, any of its domains. |
| `[>]` | Separator: the keyword before it modifies the ability/instruction after it. Used for dependent keywords (`[Legion][>]`, `[Level 3][>]`, `[Empowered][>]`), keyworded triggers (`[Deathknell][>]`), and permissive keywords (`[Action][>]`, `[Reaction][>]`). |

### 6.6 Domains (§134)
| Domain | Color | Shorthand | Symbol |
|---|---|---|---|
| Fury | red | `[R]` | circle with three projecting points |
| Calm | green | `[G]` | leaf |
| Mind | blue | `[B]` | sun-and-moon |
| Body | orange | `[O]` | blocky diamond |
| Chaos | purple | `[P]` | hexagon with swirls |
| Order | yellow | `[Y]` | angular winged symbol |

> **Note for the requester:** `[P]` is **Chaos**, not "Power". "Power" generically is `[A]`/`[C]`
> or a specific domain symbol.

---

## 7. Scoring and winning (§193, §467–§471)

### 7.1 Victory
- **Victory Score is 8 by default; 8 in 1v1.** (11 in 2v2.)
- **A player wins if, in a Cleanup, they have points ≥ Victory Score AND more points than any other
  player** (§193.3 / §318 step 1). Ties at/over the score = no winner yet; play continues.
- Points can never go below 0; a loss of points at 0 does nothing and triggers nothing.
- A player also wins if an effect says so, or if they are the only player left.

### 7.2 The two Scoring methods (§469)
**Scoring** = gaining a point by seizing or maintaining control of a battlefield. Every Score is
also a "gain points" event.

1. **Conquer** — a player **gains Control** of a battlefield they have not yet Scored this turn.
   Happens at the end of a Showdown or at the Establish Control step of Combat.
2. **Hold** — a player **maintains Control** of a battlefield they have not yet Scored this turn,
   during **their Beginning Phase → Scoring Step**.

**A player may only Score a given battlefield once per turn, by either method (§469.2).**
So in 1v1 (2 battlefields) the maximum points *from scoring* in one turn is **2**
(e.g. Hold one + Conquer the other, or Conquer both). Additional points may still come from card
effects and from opponents burning out.

### 7.3 Scoring resolution (§471)
When a player Scores:
1. They **gain up to one point** (subject to the Final Point rule below).
2. **Score triggers fire at that battlefield**: Conquer abilities on a Conquer, Hold abilities on a
   Hold. These can fire at most once per battlefield per turn per player.

**Final Point rule (§471.2.c):** when a player tries to gain a point **through a Conquer** while
their current point total is **≥ VictoryScore − 1** (i.e. 7+ in 1v1):
- If they have **Scored every battlefield this turn**, they gain the Final Point.
- Otherwise, **they draw a card instead of gaining the point.**

Points gained from non-Conquer sources are explicitly *not* subject to this restriction.

### 7.4 Other point sources (§193.2)
- Spells / triggered / activated abilities that say "gain N points".
- **Burn Out**: when an opponent burns out, they choose an opponent to gain 1 point.

### 7.5 Burn Out (§431)
Triggered when a player must move more cards out of their Main Deck than it contains
(draw, burn, mill). Sequence:
1. Perform as much of the action as possible.
2. **Recycle their entire Trash into their Main Deck** (randomized).
3. **Choose an opponent to gain 1 point.**
4. Complete the remainder of the original action.

Looking at / revealing more cards than the deck has does **not** cause a Burn Out.
Repeated burn-outs with an empty trash hand out a point each time; points from the 2nd burn-out
onward **cannot be prevented or replaced**, and a win from such a point happens **immediately**
without waiting for a Cleanup.

---

## 8. Units, locations, movement, combat/showdowns

### 8.1 Units (§141–§147)
- A unit has **Might** (`[M]`), zero or more **Tags**, a Location (its Base or a Battlefield).
- **Units enter the board EXHAUSTED by default** (§144.3) — modified by `Accelerate` or "I enter
  ready" replacement effects.
- Units can have damage marked; **Lethal Damage** = nonzero marked damage **≥ Might** (§142.4).
  Might < 0 is treated as 0 for references and combat damage summing, but the true value is used for
  arithmetic.
- Damage is healed at exactly two times (§143.3): **the Ending Phase of each player's turn** and
  **a Combat Cleanup**.
- Unit Activated Abilities can be used **only on the controller's turn, in an Open State, not during
  a Showdown** (§146) — unless the ability has `[Action]`/`[Reaction]`.
- **Multi-type objects (§178):** if a Game Object is a Unit, regardless of its other types, it has
  Might, can take damage, enters exhausted, can be played to any valid location, and is *not*
  recalled to base in Cleanup step 5. If it is a Rune, it recycles to the Rune Deck.

### 8.2 Playing units — where they go (§355.2)
When playing a unit, choose the location as part of "Make Relevant Choices":
- **Valid by default: your Base, or a Battlefield you control.**
- Effects (`Ambush`, `Hidden`, Baron Pit, etc.) can extend valid locations.
- **Gear** can only be played to your **Base** unless an effect says otherwise, and enters **ready**
  (§148, §149). Unattached non-unit gear found at a battlefield is **Recalled** to base in the next
  Cleanup.

### 8.3 Standard Move (§144.4)
Inherent ability of every unit:
- **Cost: exhaust the unit.** Effect: move it.
- Usable only **during your Main Phase**, in an **Open State**, **never during a Showdown or
  Combat**, never during a Closed State.
- Legal destinations by default: **Base → a Battlefield**, or **Battlefield → your Base**.
  `Ganking` adds **Battlefield → Battlefield**.
- Multiple units may standard-move **simultaneously** as one game action: same destination required,
  origins may differ, exhaust costs paid simultaneously.
- Cannot move to a battlefield that already has units from 2 *other* players, or where a combat
  involving 2 other players is ongoing (relevant in multiplayer only).

### 8.4 Movement generally (§445–§454)
- Moving is **instantaneous**, **does not use the chain, and cannot be reacted to**.
- Defined by Origin and Destination (both Locations).
- A **Recall** (permanent relocated to its Base without being a Move) is *not* a Move and does not
  trigger move triggers. Recalls cannot be blocked by movement restrictions and don't alter
  damage/statuses.
- **After a Move completes, perform a Cleanup.**
- A move whose destination becomes illegal instead **Recalls** the unit.

### 8.5 Control of a battlefield (§188)
- A battlefield is **Controlled by exactly one player, or Uncontrolled**. Binary.
- **Contested** is a temporary status: applied to a battlefield when a unit whose controller does
  **not** control that battlefield moves to / becomes present at it (and the battlefield is not
  already Contested). Contested persists through a Showdown/Combat until control is established.
  Card effects **cannot currently reference** Contested.
- Control is established by having units at the battlefield **at the end of a Showdown or Combat**.
- Outside combat, a player keeps control as long as they have units there.
- If you have no units there and the turn is in an Open State with no showdown/combat there, you
  **lose control in the following Cleanup**.
- Controlling a battlefield means controlling its abilities. An **Uncontrolled** battlefield's
  abilities are put on the chain and choices made by the **Turn Player**; its "you" refers to no one,
  so player-directed instructions are ignored.

### 8.6 Cleanup (§318) — the engine's central state-machine step
A Cleanup becomes an Outstanding Task after: a transition to/from Open or Closed state; a transition
between phases; a Pending item added to the chain; a Pending item becoming Finalized; a chain item
leaving the chain; any Game Objects entering/leaving the board; any status change; **a Move
completing**.

While a Cleanup runs, chain items cannot be finalized or resolved, and priority/focus are not
passed. While chain items resolve, no Cleanup happens (it queues). Cleanups repeat until one runs
with no state change.

**Cleanup steps, in order:**
1. If a player has points ≥ Victory Score and more than any opponent → **that player wins**.
2. Assign/remove **Attacker / Defender** designations on units if a Combat is in progress.
   Units at the combat battlefield with no designation gain their controller's designation; units
   with the wrong designation swap; units *not* at the combat battlefield lose designations.
3. Handle outstanding board state:
   - **3a.** Units with Lethal Damage that have `Deathknell` / self-death triggers put those triggers
     on the chain as Pending Items now, noting their location/attributes.
   - **3b.** All units with Lethal Damage are killed and put in their owners' trashes.
   - *(3c/3d/3e are inserted by Special Cleanups — see Combat Cleanup and Ending Cleanup.)*
4. Players **lose control** of controlled battlefields with no units of theirs, if the turn is in an
   Open State and no showdown/combat is ongoing there.
5. **Recall** all unattached non-unit Gear and non-unit Runes at battlefields, and all permanents and
   runes in bases other than their controller's. **Remove Hidden cards from battlefields not
   controlled by the same player** → owner's Trash.
6. **Mark a Showdown as Staged** at each battlefield that Contested was applied to. It stays staged
   while contested and units of the applying player are present.
7. **Mark a Combat as Staged** at each Contested battlefield that has units of *opposing* players.
   - **7a.** If opposing units are no longer both present before it opens, it stops being staged.
8. **Remove Contested** from battlefields with no units of the applying player and no
   showdown/combat ongoing. If that leaves units at an uncontested battlefield their controller
   doesn't control, their controller applies Contested to it.
9. If the state is **Neutral Open** and ≥1 Showdown is staged **without** a staged Combat, the Turn
   Player **chooses one** of those battlefields; a **Showdown begins** there.
10. If the state is **Neutral Open** and ≥1 Combat is staged, the Turn Player **chooses one**;
    **Combat begins** there.
    - **10a.** If the state is **Showdown Open** and a Combat is staged where a Non-Combat Showdown
      is ongoing, that Showdown **becomes a Combat Showdown**.

### 8.7 Showdowns (§341)
A **Showdown** is a structured window of opportunity where players alternate playing cards/abilities
that have `[Action]` or `[Reaction]`.

- **Non-Combat Showdown**: triggered when a player moves to a battlefield that has **no opposing
  units** (an empty or solely-own-controlled-but-not-controlled battlefield) and it becomes
  Contested. It is a stand-alone phase, **not** a Combat.
- **Combat Showdown**: the first step of a Combat (opposing units present).
- A Non-Combat Showdown becomes a Combat Showdown if opposing units arrive (handled in Cleanup 10a).

Flow:
- As a Showdown begins, **the player who applied Contested gains Focus** (this is the Attacker).
- The Focus holder may either **play one legally-timed card/ability** (which opens a chain; when
  the chain empties, Focus passes to the next player in turn order) or **Pass**.
- **If all players pass Focus in sequence with no play, the Showdown closes.**
- **Focus does NOT pass** when the chain opened from a **triggered ability** or from an **Add
  ability** (§341.4.a). This is why the combat-trigger chain doesn't hand Focus around.

**Non-Combat Showdown resolution (§341.6.b):** if only one player's units remain at the battlefield
and that player doesn't already control it, **they establish Control** — and that is a **Conquer**
if they haven't scored that battlefield this turn.

### 8.8 Combat (§459–§466)

**Trigger:** a Combat occurs when a Cleanup occurs, the chain is empty, a Combat is **Staged** at a
battlefield, and no Showdown/Combat is ongoing at any *other* battlefield. Combat is Staged when
units of **two opposing players** are at a battlefield but the steps of combat haven't begun.

**A Combat can only occur between exactly two players.** In 1v1 that's always both players.

**Multiple showdowns/combats per turn are explicitly supported:** each Move → Cleanup → staging →
the Turn Player picks which staged Showdown/Combat opens first, one at a time.

#### Step 1 — The Combat Showdown Step (§464)
Tasks, in order:
1. **Start of combat / start of showdown effects.**
2. **Establish Attacker and Defender.**
   - **Attacker = the player whose unit(s) applied the Contested status to the battlefield.**
   - **Defender = the player who did not.**
   - Both players and all their units at the contested battlefield gain the corresponding
     **Attacker / Defender designation** now. Units arriving later gain the designation in the
     Cleanup after the action that brought them.
3. **The Attacker gains Focus.** (If a showdown was already ongoing, whoever has Focus keeps it.)
4. Put any resulting **triggered abilities on the Combat Chain**: the Attacker (Focus holder) first,
   then all non-Defender players in turn order, then the Defender.
   - If a combat chain was created, the state **Closes**; otherwise the Combat Showdown continues
     with the state Open.
5. Play proceeds on the chain / in the showdown as normal until the showdown closes.

#### Step 2 — The Combat Damage Step (§465)
Only if **both attacking and defending units remain**:
1. **Sum the Might of all Attacking Units.** **Sum the Might of all Defending Units.**
   (Stunned units contribute **0** to this sum — §423.1.d.)
2. **Starting with the Attacker**, each player **assigns** damage equal to their summed Might among
   the *other* player's units.
   - Assigning is **not** dealing. All assigned damage is **Dealt simultaneously** at the end.
   - **Lethal-first rule:** a unit must be assigned **lethal damage in full** before any damage is
     assigned to a different unit.
   - **No over-assignment:** you cannot assign more than the minimum needed for lethal, unless no
     other units remain to assign to.
   - Replacement effects that would apply to the damage (Prevent, doubling) are **applied at
     assignment time**, not again on dealing. Prevent raises the amount needed to be "lethal".
   - **Ordering keywords** (`Tank` first, `Backline` last) are mandatory restrictions. If a unit has
     contradictory requirements, the assigner picks **one** to satisfy.
   - A unit that **cannot be dealt damage** is exempt from mandatory assignment; no amount is lethal
     for it.
3. **Deal damage to each unit equal to what was assigned.**
4. **Skip the FEPR process and cancel outstanding tasks; proceed to the Resolution Step.**

#### Step 3 — The Resolution Step (§466)
1. **Perform a Combat Cleanup** — a Special Cleanup (§318) with these inserted:
   - `3c. Heal all Units.` (all damage clears after deaths are processed in 3a/3b)
   - `3d. Recall Attackers present at the Battlefield if Defenders are still present.`
     — **this is the "attacker loses / bounces home" rule.**
2. **Determine Combat Result** (after resolving the chain from damage + the cleanup):
   - A player **won** the combat if they had a designation and are the **only** player with units
     remaining there.
   - A player **lost** if they had a designation and are the only player with **no** units remaining.
   - Units inherit their controller's result.
   - **"No Result"** if units were recalled in step 3d, **or both players have units present**, **or
     neither player has units present**.
     - If No Result *and* both players still have units → **stage a Showdown and a Combat at this
       battlefield again** (i.e. it repeats).
3. **Establish Control:** if no Showdown/Combat is staged here, the player with units remaining
   **establishes Control** if they didn't already have it; clear the Contested status; if no units
   remain from anyone, the battlefield becomes **Uncontrolled**; remove Hidden cards not sharing a
   controller with the battlefield.
   - **Establishing Control here is a Conquer** if that player hasn't scored this battlefield this
     turn. It need not be the player who applied Contested.
4. **Combat ends:** remove Attacker/Defender designations from all units and players; "at end of
   combat" effects; all "this combat" effects expire simultaneously.

#### 8.8.1 How ties / "the attacker bounces" work in practice
There is no explicit "compare totals, higher wins" rule. Outcomes emerge from the damage math:
- Attackers assign `sum(attacker Might)` and defenders assign `sum(defender Might)` **simultaneously**
  using lethal-first, no-overkill assignment.
- **Whoever still has units at the battlefield after deaths is the winner.**
- **§466.1 `3d`: if attackers are still present AND defenders are still present, the attackers are
  Recalled to base.** This is the concrete "mutual survival → attacker retreats" rule, and it
  produces **No Result** (no conquer, defender keeps control).
- **Mutual wipe** (neither has units) → **No Result**, battlefield becomes Uncontrolled.
- **"Tie"** is formally defined (§739.3.a) as: units controlled by different players located at the
  combat battlefield during **step 3d of the combat cleanup** — i.e. exactly the case that recalls
  the attackers.

---

## 9. The Chain (stack) — §327, §332–§338

- The **Chain** is a Non-Board zone that exists **only while it holds items**. Only one chain exists
  at a time; anything played while it exists joins it.
- Chain items are **Pending** until the "Check Legality" step of playing, then **Finalized**.
- The chain existing = the turn is **Closed**. By default **nothing** can be played in a Closed state
  except `[Reaction]`.

### 9.1 HOT FEPR
Whenever actions incur tasks: **H**andle **O**utstanding **T**asks; then **F**inalize, **E**xecute,
**P**ass, **R**esolve.

- **Step 1: Finalize.** The controller of the **oldest Pending** item completes the steps of playing
  it until it is Finalized or leaves the chain. **Finalizing does not pass priority.** Items finalize
  in the order they were appended.
  - **If, after finalizing, that item is a Unit, a Gear, or an ability that Adds resources, it
    RESOLVES IMMEDIATELY** → jump to Step 4.
  - If more Pending items remain → return to Step 1.
  - Otherwise, the controller of the **next item on the chain** gains Priority → Step 2.
- **Step 2: Execute.** The priority holder may play a legally-timed card/ability (creating new
  Pending items → back to Step 1), or **pass priority**.
- **Step 3: Pass.** If **all players have passed in sequence without adding anything**, go to Step 4.
  Otherwise priority passes to the next player in turn order → Step 2.
- **Step 4: Resolve.** **The newest Finalized chain item resolves**, in full (LIFO).
  - If the chain is now empty → Open State. **If this happened during a Showdown and the chain was
    NOT initiated by a triggered ability or an Add ability, Focus passes to the next player.**
  - If Pending items remain → Step 1. If not, the controller of the newest item gains priority →
    Step 2.

### 9.2 Resolution atomicity (§159)
While a spell or ability is resolving, **no other chain item can be finalized or resolved**, not even
triggers created by that resolution. Finish resolving completely, then handle chain items/tasks.

### 9.3 Timing permissions summary
| Card/ability | Default timing |
|---|---|
| Spell (no keyword) | Your turn, Main Phase, **Neutral Open**, not during a showdown |
| Unit / Gear | Same as above (units enter exhausted; gear to base, ready) |
| Activated ability of a unit/gear/legend/battlefield | Controller's turn, **Open State**, **not during a Showdown** |
| `[Action]` card/ability | Adds: during **Showdowns**, on **any player's turn** (Showdown Open) |
| `[Reaction]` card/ability | Adds everything Action grants, **plus any Closed State on any player's turn** (i.e. true instant speed / responds on the chain) |
| Triggered abilities | Go on the chain in Open **or** Closed states, on any player's turn |
| Rune abilities (`[E]: Add [1]` / `Recycle: Add [C]`) | `[Reaction]`, plus usable any time a cost must be paid, resolving immediately |

**There is no separate "Focus" keyword** — Focus is the showdown turn-token. The instant-speed
equivalent is `[Reaction]`.

---

## 10. Card types and key stats

| Type | Zone at start | Permanent? | Notes |
|---|---|---|---|
| **Legend** (Champion Legend) | Legend Zone | No | One per deck, in play from turn 0, sets Domain Identity + champion tag. Can have Passive, Triggered, and Activated abilities. Can be targeted. Cannot be killed or moved. **No printed "level up" mechanic** — progression is via the `Level N` dependent keyword driven by XP, which any card can carry. |
| **Unit** | Main Deck / Champion Zone | Yes | Has **Might**. Enters exhausted. Has the Standard Move inherent ability. Can be killed by lethal damage. |
| **Champion Unit** (supertype `Champion`) | Main Deck / Champion Zone | Yes | Supertype applies only to units; matters for deckbuilding (Chosen Champion must be a champion unit whose champion tag matches the legend). **No "champion tax" exists in the rules** — champions are ordinary units at their printed cost. |
| **Signature** (supertype) | Main Deck | depends on type | Any card type. Max 3 per deck, all matching your legend's champion tag. Cannot be the Chosen Champion. |
| **Gear** | Main Deck | Yes | Enters **ready**, to your **Base** only by default. Can be killed. Can have the **Equipment** tag (→ Effect Text + Might Bonus, `Equip` / `Quick-Draw`). Unattached non-unit gear at a battlefield gets recalled. |
| **Spell** | Main Deck | No | Resolves top-to-bottom, then goes to owner's Trash. `Action`/`Reaction` are intrinsic properties, not executable text. |
| **Rune** | Rune Deck | **No** (not a Main Deck card) | 12 per deck. Channeled, not played. Recycles to the Rune Deck. |
| **Battlefield** | Battlefield Zone | No | Established at setup; never played, moved, or killed. Is a **Location**. Can have Passive/Triggered/Activated abilities. Can be targeted. Can be "occupied" (has a unit), "uncontrolled" (no controller), "open" (both). |
| **Token** | Created on the board or the Chain | per type | Not cards. Cannot become cards; cards cannot become tokens. No cost (treated as 0) and no domain unless appended by a Layer effect. If put into any non-board zone other than the chain, it **ceases to exist**. Inherits its type's recycle destination. |

**Card anatomy (§132–§140):** Cost (upper left: Energy numeral + Power symbols) · Name (+subtitle)
· Category/supertype/type/tags · Domain(s) (lower right) · Rules Text · Effect Text (below rules
text; **inactive unless attached**, then appended to the top-most card) · Might Bonus (lower right,
e.g. `+2`; **applies only while attached**; ignored if the host has no Might) · Flavor Text ·
Illustration.

**Named tokens defined in the rules (§185.3):**
1 `[M]` Recruit (tag Recruit) · 3 `[M]` Sprite with Temporary (tag Fae) · 2 `[M]` Sand Soldier
(Shurima) · 3 `[M]` Mech (Mech) · **Gold** gear token (`[Reaction][>] Kill this, [E]: Add [A]`) ·
0 `[M]` Reflection · 1 `[M]` Bird (Bird tag, `Deflect`) · **Brush** battlefield token · **Baron Pit**
battlefield token ("Units can move here from anywhere") · 1 `[M]` Tentacle (Bilgewater) ·
0 `[M]` Shadow Clone.

---

## 11. Keyword glossary (§800–§830) — complete as of 2026-07-16

Every keyword below is a *referenceable characteristic* (cards can check "has X").
Format shown is the on-card format.

| Keyword | Type | Exact functional text | Stacking |
|---|---|---|---|
| **Accelerate** | Unit optional additional cost | "As you play me, you may pay `[1][C]` as an additional cost. If you do, **I enter ready**." Power must match one of the unit's domains; domainless → `[A]`. Generates a **delayed replacement effect** — the unit never enters exhausted, so "becomes ready" triggers do **not** fire. Only payable while playing; no function on board. | Redundant |
| **Action** | Permissive | Cards: "This can be played during showdowns on any player's turn." Abilities: "…activated during showdowns on any player's turn." Purely permission; doesn't change any instruction. Playing a unit with Action still obeys location rules. | n/a |
| **Reaction** | Permissive | Grants everything Action grants, **plus** Cards: "This can be played during Closed States on any player's turn"; Abilities: same for activation. | n/a |
| **Assault X** | Passive (Units) | "While I am an **attacker**, I have +X `[M]`." X omitted = 1. Applies while the unit holds the Attacker designation. | **Sums** |
| **Shield X** | Passive (Units) | "While I am a **defender**, I have +X `[M]`." X omitted = 1. | **Sums** |
| **Tank** | Passive (Units) | "I must be assigned **lethal damage before** any other unit with the same controller as me that does not have Tank, during the Combat Damage step." | Redundant |
| **Backline** | Passive (Units) | "I must be assigned **lethal damage after** any other unit with the same controller as me that does not have Backline, during the Combat Damage step." | Redundant |
| **Deathknell** | Triggered (Permanents) | `[Deathknell][>] [Effect]` = "When I die, [Effect]." Trigger is the permanent being **killed and sent to the Trash**; if the death is replaced (e.g. recall), the trigger is **removed from the chain**. The trigger goes on the chain as Pending **before** the card moves to the trash (Cleanup step 3a), noting its location/attributes. | Each instance triggers **separately** |
| **Deflect X** | Passive (Permanents) | "Spells and abilities an opponent controls that target me cost an amount of **Power** equal to X more to play, as an additional cost, **for each time they choose me**." The Power may be of **any domain**. This is a **Mandatory Additional Cost**. X omitted = 1. | **Sums** |
| **Ganking** | Passive (Units) | "I may move to a battlefield **from another battlefield** with a standard move." Adds a Standard Move destination only; no extra activation, no cost change. | Redundant |
| **Hidden** | Prerequisite keyword (Spells, Units, Gear) | "While this card is in your hand or Champion Zone **on your turn during an Open State**, you may pay `[A]` to **hide** this facedown at a battlefield you control that doesn't already have a facedown card there, for as long as you control that battlefield. **Beginning on the next turn**, this gains `[Reaction]` and you may **play this ignoring its base cost**." Hiding is not playing and opens no chain; playing from facedown does. Hidden permanents must be played **to that battlefield** (overrides the gear-to-base rule); targets of a hidden spell / hidden play-effect must be chosen at that battlefield unless the targeting restriction makes that impossible. A card with Hidden may always just be played normally instead. | Redundant |
| **Ambush** | Passive (Units) | "I may be played to a battlefield where **you control Units**" and "I have `[Reaction]` as long as I'm being played to a battlefield where you control Units." Used as a verb = "play with Ambush's permissions". If no friendly units remain at the chosen location before finalization completes, Ambush's permission is void. | Redundant |
| **Legion** | **Dependent keyword** | `[Legion][>] [Text]` = "**If you have played another card this turn**, this card gains '[Text]'." Satisfied by any one other card **finalized** by you this turn (a countered card still counts as finalized). All Legion instances a player controls are satisfied by a single card. | — |
| **Level N** | **Dependent keyword** | `[Level N][>] [Text]` = "While you have **N or more XP**, this card gains '[Text]'." Re-evaluated if the controller changes. | — |
| **Empowered** | **Dependent keyword** | `[Empowered][>] [Text]` = "While I have the **Empowered** status, this card gains '[Text]'." A `[Empowered][>] When I become Empowered…` trigger is active and fires at the moment it becomes Empowered. | — |
| **Empower [Cost]** | Activated ability (permanents & legends) | "`[Cost]`: **Empower this.** Play only if not Empowered." Source is not a target. Empowered is a binary status. | Multiple = multiple separate abilities |
| **Temporary** | Triggered (Permanents) | "At the start of this permanent's controller's **Beginning Phase, before scoring, kill this**." | Redundant (triggers once) |
| **Vision** | Triggered (Permanents) | "When this is played, **predict**." Trigger = the permanent entering the board. | Multiple instances trigger **separately** |
| **Hunt X** | Triggered (Units) | "When I **Conquer or Hold**, my controller gains **X XP**." X omitted = 1. | **Sums** |
| **Equip [Cost]** | Activated ability keyword (Gear with tag Equipment) | "`[Cost]`: **Attach this gear to a unit you control**." The chosen unit **is a target** and becomes the Top-Most Card. Completing the attach makes that unit **Equipped**. | Multiple = multiple separate abilities |
| **Quick-Draw** | Triggered + Permissive (Gear with Equip) | "`[Reaction]`" and "When you play this, **attach it to a unit you control**." | No effect beyond the first |
| **Weaponmaster** | Triggered (Units) — Play Effect | "When you play me, you may choose a card you control with the **Equipment** tag. Necessary portions of its rules text are no longer Inactive. **Pay the cost of its Equip ability, reduced by `[A]`**, to attach it to this unit." Costs use the Equip cost *as modified*. Doesn't activate the Equip ability. No function on board. | Multiple instances trigger separately |
| **Repeat [Cost]** | Optional additional cost (Spells & Abilities) | "You may pay `[Cost]` as an additional cost as you play this. If you do, **execute the instructions of this chain item one additional time during resolution**." Choices for the extra execution are made at the normal Make-Relevant-Choices step and may differ. Regardless of repeats, the card is **Played once**. | Each instance payable separately, each once |
| **Flow [Cost]** | Passive (Spells) | "You may **play this from your trash for its Flow cost**. Then **banish it**." (The banish is a delayed replacement: if it would leave the chain after finalization and leaving wasn't instructed by its own text, banish instead.) Flow does not change timing permissions, only the zone it may be played from. Multiple Flow instances → controller picks which cost. | — |
| **Unique** | Deck-construction constraint | Only **one copy of that name** in a deck. A Unique Signature card still counts against the 3-Signature cap. No gameplay effect. | — |

> **Keywords that do NOT exist in Riftbound:** *Genesis, Hallowed, Last Breath, Overwhelm,
> Deathtouch* (confirmed absent from the 2026-07-16 Core Rules; these are Legends of Runeterra /
> MTG terms). "Last Breath" is **Deathknell** here. "Stun" and "Buff" are **game actions**, not
> keywords. "Mighty" is a **description** (Might ≥ 5), not a keyword.

---

## 12. Game actions (§410–§444) — exact semantics

| Action | Definition / engine notes |
|---|---|
| **Draw** | Take from the top of the Main Deck to hand. Limited action. Over-draw → draw as many as possible, **Burn Out**, then draw the rest. |
| **Exhaust** | Rotate 90°. Already-exhausted objects **cannot** be exhausted again (as a cost, that means the cost can't be paid). Symbol `[E]`. |
| **Ready** | The inverse. Already-ready objects cannot be readied. All your objects ready in your Awaken Phase. |
| **Recycle** | Put card(s) from a zone on the **bottom** of the corresponding deck. Main Deck cards → Main Deck; runes → Rune Deck. Always to that card's **owner's** deck. Multiple simultaneous recycles to the Main Deck are placed in **random order**; to the Rune Deck in the **owner's chosen order**. "Recycle X from [zone]" does **not** target. |
| **Deal** (damage) | Mark damage on units. Only **positive integers** are valid damage; 0 damage means nothing is dealt (and "when I take damage" doesn't trigger). Sources matter for attribution; combat damage's source is the opposing units. |
| **Heal** | Clear damage. Happens automatically at end of turn (Ending Cleanup 3c) and in the Combat Cleanup (3c). |
| **Play** | Put a card on the chain and finalize it. By default only from **hand or Champion Zone**. A Discretionary Action normally; a Limited Action when an effect makes you play something. |
| **Move** | Change Location on the board. Instantaneous, **no chain, not reactable**. Triggers a Cleanup on completion. |
| **Recall** | Relocate a permanent to its Base **without it being a Move**. Doesn't trigger move triggers, can't be blocked by move restrictions, preserves damage/statuses. |
| **Hide** | Place a card facedown at a battlefield you control. Discretionary; **does not open a chain**. Enabled by `Hidden`. |
| **Discard** | Hand → own trash without executing text. Discard as many as possible; excess ignored. |
| **Stun** | Binary status. A stunned unit **contributes 0 Might in the Combat Damage Step** but still needs damage ≥ its **full Might** to die. Cannot be stunned twice. **Clears in Ending Cleanup step 3d.** |
| **Reveal** | Present a card from a private/secret zone. The card **stays in its zone**. Revealed state lasts for the duration specified, else until the spell/ability finishes resolving. Voluntarily showing your hand is **not** revealing. |
| **Counter** | Negate a chain item; it does nothing and goes to the trash. A countered card was **not "played"** for play-triggers, but **was "finalized"** (so it still satisfies `Legion` and "cards played this turn" cost checks). Costs are **not refunded**. |
| **Buff** | Place a **Buff counter** on a unit. **Max one buff per unit.** Each buff gives **+1 Might**. Buffs are counters (not targetable), vanish when the unit leaves play, and are not retained in the Champion Zone. "Buff a unit" on an already-buffed unit does nothing and doesn't trigger "when you buff". Buffs can be **spent** (removed) as a cost — only from units you control. |
| **Banish** | Move a card to Banishment. **Not** a subset of Kill or Discard. |
| **Kill** | A permanent going from the board to the trash. **Active kill** = by instruction/cost; **Passive kill** = from Lethal Damage or another state, processed in Cleanup 3b. Deathknell-style triggers go on the chain *before* the card hits the trash. |
| **Add** | Put Energy/Power into your Rune Pool. Triggered/activated Add abilities **resolve immediately on finalization** and do not pass priority or focus. Add abilities with `[Reaction]` can be used **any time resources must be paid**, even mid-resolution and with no priority. |
| **Channel** | Rune Deck top → board. Ready by default. |
| **Burn Out** | See §7.5. It is a **Replacement Effect**. |
| **Double** | Increase a numeric attribute by its current value (snapshot amount, for the stated duration). |
| **Swap** | Reverse two numeric values by applying an increase to one and a decrease to the other equal to their difference. |
| **Attach / Detach** | Link/unlink cards. The Top-Most Card gains all attached cards' **Effect Text** (appended to its rules text) and **Might Bonuses**; attached cards' own **Rules Text becomes Inactive**. Attached cards keep their types/tags, can be targeted, can have a different controller, move with the host, and have independent exhausted/stunned/etc. states. |
| **Predict X** | Look at the top X of your Main Deck, recycle any number, put the rest back on top in any order. X omitted = 1. **Never causes a Burn Out.** |
| **Prevent** | "Prevent the next X [source] damage that would be dealt to [unit] this turn." A **delayed replacement effect** tracking a **Prevent Value** per unit, decremented as it absorbs damage. Damage fully prevented counts as **not dealt at all**. `Prevent All` = infinite; no damage is ever lethal against it. Prevent is applied during **combat damage assignment**, raising the amount needed for lethal. |
| **Replace** | Create a token in place of another card/token, **inheriting all of its effects and statuses**; the replaced card goes to Banishment (marked "Replaced", not "Banished"). Can be "swapped back". |
| **Create** | Produce a new Game Object directly into a zone (permanents → any legal board location; spells → chain; runes → base; legends → Legend Zone; battlefields → Battlefield Zone). |
| **Burn X** | Move X cards from the top of the Main Deck to the trash. Can cause Burn Out. |
| **Empower / Disempower** | Apply/remove the binary Empowered status. |
| **Skip** | Replace an event or a turn procedure (turn/phase/step/substep) **with nothing**. Nothing that would trigger on it triggers. It is a Replacement Effect. |
| **Pay** | Remove a resource from your Rune Pool. If you decline while paying a card/ability's costs, **the whole play is undone**. |

---

## 13. Abilities, triggers, timing words (§360–§398)

Five ability structures: **Passive**, **Replacement**, **Activated**, **Triggered**, **Delayed**
(plus **Reflexive** triggers and **Linked** abilities).

### 13.1 Recognition
- **Passive:** statements of fact ("I get +1 `[M]` while…", "Friendly Yordles at my battlefield have
  Shield"). Conditional with "if"/"while". Active only on the board unless the text self-describes
  another zone (e.g. "Play me only during an opponent's turn", `[Legion][>] You may play me from
  your trash for [3][C]`). Cost-altering passives apply from **any zone the card can be played from**.
- **Replacement:** identified by "as", "would", or "instead". Applied **before** the event occurs.
  A given replacement effect may be applied **only once per event** (and to the events that replaced
  it). Multiple replacements on the same event → **the controller of the affected object chooses the
  order** (affected player chooses if a player; Turn Player chooses for an uncontrolled battlefield).
  "Once each turn" / "N times each turn" replacements track applications.
- **Activated:** `Cost : Effect` (a colon). Card text calls this "use" or "play". **Only on the
  controller's turn, in an Open State**, unless it has `[Action]`/`[Reaction]`. Goes on the chain,
  can be responded to, resolves like a spell.
- **Triggered:** "**When** [event]", "**At** [point in the turn]", or "**the [Nth] time** [event]".
  Trigger phrases needn't start a sentence. A conditional clause **immediately after** the trigger
  condition is part of the **condition** (checked when the condition is fulfilled); a conditional
  elsewhere is part of the **effect** (checked on resolution).
- **Reflexive:** "Do this:" / "Do one of the following:" — creates *new* chain items when its
  condition is met. "Do this N times" adds it N times.
- **Delayed:** any ability type restricted to a specified window of time ("at the end of this turn",
  "the next time X would Y this turn"). Executes regardless of whether its source is still on the
  board. If its window has already passed when it would be generated, it is never generated.

### 13.2 Named trigger categories (§383.4) — each is a distinct engine hook
| Name | Wording | Fires when |
|---|---|---|
| **Play Effect** | "When you play me…" (units) / "When you play this…" (gear) | Added to the chain as Pending **after** the permanent is finalized and enters the board |
| **Targeting Effect** | "When you choose me…" / "When you choose a [X]…" | After a spell/ability that **targets** the object is finalized |
| **Conquer Effect** | "When I conquer…" / "When you conquer…" | On the Conquer scoring, from units present at the conquer, or from anything referencing the conquering player. **Fires even if the point gain is negated or replaced.** |
| **Hold Effect** | "When I hold…" / "When you hold…" | On the Hold scoring during the Beginning Phase, same structure. **Fires even if the point gain is negated/replaced.** |
| **Attack Trigger** | "When I attack…" / "When you attack…" | When the unit/player gains the **Attacker** designation **for the first time in that combat** (checked once per combat, even if the designation is gained and lost repeatedly) |
| **Defend Trigger** | "When I defend…" / "When you defend…" | Same, for the **Defender** designation |

Effects may instruct a player to "**activate** the conquer/hold/play effects of X": re-check those
triggers' conditions as if the named part were fulfilled.

### 13.3 Trigger mechanics
- Trigger conditions are evaluated **after** the inciting event has been processed.
- An object whose trigger is active in a zone triggers if it **enters that zone at the same time**
  its condition is met; it does **not** trigger if it **leaves** that zone simultaneously with its
  condition being met.
- Triggers can go on the chain in **Open or Closed** states on **any player's turn**.
- Simultaneous triggers: each player orders their own; **starting with the Turn Player and
  proceeding in turn order**.
- "**You may**" as the **first part** of the effect = the decision is made **during finalization**;
  declining removes it from the chain and it is treated as **never having triggered**. "You may"
  later in the effect = decided **on resolution** (the trigger is always finalized).
- A **cost within instructions** at the very start of a trigger's effect is its **base cost** and must
  be paid to finalize it (e.g. `[Deathknell][>] Recycle me to ready your runes` — "recycle me" is the
  base cost). Costs later in the effect are paid on resolution.
- "The Nth time" triggers: if the condition is met multiple times simultaneously, the controller
  picks one instance; the ability triggers **once**.
- Declining to pay a triggered ability's cost during Pay Costs removes it from the chain — **this is
  not a counter**.

### 13.4 Playing a card — the 6 steps (§349, mirrored by §398 for abilities)
1. **Move the card from its zone to the Chain.** This **closes** the state. It is now Pending.
   (If something is resolving or tasks are outstanding, finish those first.)
2. **Make relevant choices**: "as I'm played" choices; **optional additional costs**; the **location**
   for a unit (default: your base or a battlefield you control); modes; move destinations; and all
   **targets**. Choices cannot be changed later. You may not make choices that deterministically
   lead to an illegal state later.
3. **Determine Total Cost**: apply base-cost modifications ("for [Cost]", "ignoring its cost" → set
   to 0) → additional costs (mandatory, then chosen optional) → cost **increases** → **discounts**
   (component discounts before total-cost discounts; each discount's minimum applies only to itself)
   → total-cost modifications. Energy/Power can't go below 0. **An optional additional cost counts as
   "paid" if you chose to pay it, even if a discount reduced it to 0.**
4. **Pay the costs** (Energy + Power + non-standard costs in any order). `[Reaction]` Add abilities
   may be used *here*. Costs replaced by replacement effects still count as paid.
5. **Check legality**: targets legal; costs paid; the result wouldn't create an illegal state; the
   card has the right timing permission (`[Action]` if it opened a Showdown Closed state;
   `[Reaction]` if it's going onto an existing chain). **If any check fails, the entire process is
   undone and the action is cancelled.**
6. **Finish finalizing.** Permanents **leave the chain and enter the board immediately** (units
   exhausted at the chosen location; non-unit gear ready at base); their passives go live and their
   rules text executes top-to-bottom. Spells **linger on the chain** as Finalized items and resolve
   later, then go to the owner's Trash.

**Cost references (§204.6):** effects that need to know a *card's* cost always use the **printed or
copied** cost, ignoring increases/decreases/ignores. Effects that need an *ability's* cost use its
**base** cost, ignoring alterations (unless the effect says otherwise).

### 13.5 Targeting (§355.6–§355.14) — condensed
- Choosing a specific game object = **targeting**, unless one of the exceptions applies.
- Valid target = on the board / on the chain / a player / a zone / explicitly in another zone, AND
  meets all restrictions, AND is not the spell/ability itself.
- **NOT a target** when: it's in a non-public zone (hand); it's only a targeting restriction for
  another choice ("kill a unit **at a battlefield**"); it's only part of a cost, trigger condition,
  or replacement effect; it's selected programmatically by criteria ("kill **all** units"); it's
  chosen by another player; or it's in an instruction a player "**must**" complete.
  Public zones: Battlefield Zones, Bases, Trashes, Legend Zones, Champion Zones, Facedown Zones.
- **Mistargeting on resolution:** the spell still resolves; illegal targets are simply unaffected and
  their instructions ignored. A target that left to/from a **non-board zone** is permanently illegal
  (new object). Checking info on an illegal target returns **null** and dependent calculations are
  ignored. **Linked instructions** ("Kill a unit. **Its** controller draws 2") require the earlier
  instruction to have executed.

---

## 14. Layers (§477) — characteristic calculation order

Apply repeatedly until stable; each effect applies exactly once per full pass sequence.

1. **Trait-Altering**: Name, Super Type, Type, Tags, **Controller**, **Cost**, **Domain**,
   **Might assignment** ("Might becomes 4"), **copy effects**.
   Copyable traits: Name, Super Type, Type, Tags, Cost, Domain, Rules Text.
2. **Ability-Altering**: Keywords, passive abilities, appending/removing rules text, and appending
   the **Effect Text of attached cards**.
3. **Arithmetic**: Might, Energy Cost, Power Cost. **Increases first, then decreases.**
   Attached cards' **Might Bonuses** apply here.
   Non-passive arithmetic effects with a cap/floor are **snapshotted** at application time; passive
   abilities are not snapshotted.
   You cannot increase an attribute by a negative amount (increase by 0 instead).

Within a layer: **dependency** first (apply the depended-on effect, then immediately the dependent
one); if no dependency can be established, **timestamp order**. Inactive text loses its timestamp and
gets a new one when it becomes active again.

**Other calculated concepts:**
- **Mighty** (§711): a unit "is Mighty" while its **Might ≥ 5**. On the board, current Might; in
  non-board zones, printed Might. "Becomes Mighty" = crossing from <5 to ≥5.
- **Bonus Damage** (§712): a positive additive property granted to Deal actions. Multiple instances
  sum and apply once. Applies **per target** on multi-target deals, and increases the pool for split
  damage (which can increase the number of legal split targets). Doesn't apply if no damage was dealt.
- **XP** (§728): a player-level resource, publicly tracked, gained/spent, not a game object, not
  targetable, unbounded, not shared between teammates. Drives `Level N` and `Hunt X`.
- **Counters** (§741): game objects on board objects; **not targetable**; spending requires
  controlling the object; counters leaving without moving to another object cease to exist; objects
  moving to a non-board zone lose all counters.
- **Inactive** (§720): text that is ignored entirely — doesn't trigger, apply, or activate. The card
  still *has* the keyword for reference/eligibility purposes. Rules Text is never inactive by
  default; **Effect Text is inactive unless attached**; attached cards' Rules Text is inactive.
- **Untargetability** (§751): "can't be chosen by [category] spells and abilities". Becoming
  untargetable after being targeted causes mistargeting on resolution; becoming targetable again
  restores legality.
- **Special terms** (§739): *friendly* = shared controller (or teammates); *enemy* = opposing
  controllers; *alone* = no other friendly units at the same location; *one on one* = it and the
  enemy unit at the same location are both alone; *in combat* = at a battlefield with an ongoing
  combat **and** holding a combat designation; *tie* = units of different players at the combat
  battlefield during step **3d** of the Combat Cleanup.

---

## 15. UNCERTAIN / could not confirm

1. **Final Point via Hold.** §471.2.c words the Final Point restriction **only** for Conquer
   ("When a player tries to Gain a Point through a **Conquer**, and their current Point Total is 1
   point from the Victory Score or higher…"), and §471.2.b.1 explicitly exempts non-Conquer point
   sources. The 2v2 section (§489.8.g) likewise says "when scoring the Final Point **from Conquer**".
   **Best guess: Holding at 7 points in 1v1 does award the 8th point without the "score every
   battlefield" requirement.** This is surprising enough that it's worth a second look at a judge
   FAQ before shipping; it's the single highest-impact ambiguity for a 1v1 engine.

2. **Combat "who wins" by Might comparison.** There is no rule that compares total Might and declares
   a winner. The result falls entirely out of simultaneous lethal-first damage assignment plus the
   `3d` attacker-recall rule. I could not find any additional tiebreak text. **Best guess: implement
   exactly as written (assign → deal → cleanup → 3d recall → who's left).**

3. **Who owns which battlefield in 1v1.** §486 says the two selected battlefields "are placed
   simultaneously in the Battlefield Zone" and battlefields are **Owned** by a player (§171.1), but
   there is no rule making a player start in control of the battlefield they brought.
   **Best guess: both battlefields start Uncontrolled and are contestable by either player**, which
   is consistent with §191.4's treatment of uncontrolled battlefields and with the Conceding rules
   (§652) that remove "the Battlefield they contributed".

4. **Exact per-turn channel cap.** The rules give the Channel Phase's 2 and allow effects to channel
   more; no explicit cap is stated. **Best guess: no cap beyond available effects and the 12-card
   Rune Deck.**

5. **Whether a "battlefield deck" exists.** The prompt asked about one; the rules describe
   battlefields only as a presented set included in your deck (3 in 1v1). There is no shuffled
   battlefield deck. High confidence.

6. **`[S]` / `[T]` shorthands.** §135.2.d explicitly says `[M]` (Might) replaced the older `[S]`, and
   `[E]` (Exhaust) replaced the older `[T]`. Older community/card text may still use `[S]`/`[T]` —
   **map them to `[M]` and `[E]` respectively** when parsing older card data.

7. **Keywords with no rules entry.** *Genesis, Hallowed, Last Breath, Overwhelm* appear nowhere in
   the 2026-07-16 Core Rules; a full-text search found zero hits. **Best guess: they don't exist in
   Riftbound** (they are LoR/MTG terms; "Last Breath" ≈ **Deathknell**). The 800-series glossary is
   closed and complete as of that date: Accelerate, Action, Assault, Deathknell, Deflect, Ganking,
   Hidden, Legion, Reaction, Shield, Tank, Temporary, Vision, Equip, Quick-Draw, Repeat,
   Weaponmaster, Ambush, Hunt, Level, Unique, Backline, Empower, Empowered, Flow.

8. **Set-specific keywords released after 2026-07-16** (e.g. anything from the Radiance preview
   season referenced on the news hub) are not in this document. Re-check the Rules Hub for a newer
   Core Rules revision before locking the keyword table.

9. **Ban list** (as of 2026-09-18, Constructed): cards *Called Shot, Ekko Recurrent, Draven
   Vanquisher, Fight or Flight, Scrapheap, Stealthy Pursuer, Stacked Deck*; battlefields *The Arena's
   Greatest, Aspirant's Climb, Dreaming Tree, Obelisk of Power, Reaver's Row*. (2v2 additionally bans
   the legend *Master Yi, Wuju Bladesman*.) Source: playriftbound.com Rules Hub — relevant only if
   you enforce format legality.
