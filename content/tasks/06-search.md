---
title: Search
id: search
feature: search
section: Cards
---
Find any card or set by name, then narrow it down by type, colour, cost, rarity, format and more.

## The search field {#search-field} [screen]
Where: the magnifying glass at the end of the tab bar → {#tab-bar}
The keyboard comes up as you open Search.
- `Cards and Sets` — type part of a card's or a set's name; results start after two letters → {#search-results}
- The keyword bar above the keyboard — add filters → {#search-keyword-bar}
- Return — every card that matches → {#search-all}
- ⓧ in the field — clear it

### Chips {#search-chips}
- Each filter you add becomes a chip in the field, e.g. `Type: Creature`, `Mana Value ≤ 3`
- Several chips narrow the search together: every card must match them all
- Backspace — remove the last chip
- Tap a chip's keyword in the bar again — remove that chip
- A second type or colour joins the first, e.g. `Type: Legendary Creature`
- A second rarity, mana value or format replaces the first

### Searching within a set {#search-in-set}
- Type `in:` and the set's code or name, then pick the set — it becomes the first chip
- Everything found is then from that set; the field reads `Cards`
- Or type the set's code and a card's name, e.g. `fra swamp`, then tap `swamp in …`
- The set open in Browse is offered first
- Delete the set chip — search every set again

## The keyword bar {#search-keyword-bar}
Where: above the keyboard, whenever the search field is in use
A row of filters. Scroll it sideways for more.
- Tap a keyword — it goes into the field; then type or pick its value
- Start typing a word — the keywords it could be move to the front, e.g. `col` brings `Color`
- Tab, at the end of the bar — turn the value into a chip; greyed out until there's a value
- While you type one keyword's value, the others are greyed out
- Tap the keyword you're typing — cancel it

### The keywords {#search-keywords}
- `Set` — one set's cards → {#search-in-set}
- `Type` — creature, instant, sorcery, artifact, enchantment, land, planeswalker, battle or legendary
- `Color` — the card's colours → {#search-colour-pad}
- `Rules Text` — words in the card's text, e.g. draw a card
- `Mana Value` — the total mana cost → {#search-number-pad}
- `Rarity` — common, uncommon, rare or mythic
- `Format` — legal in standard, pioneer, modern, legacy, vintage, commander or pauper
- `Identity` — colour identity, for Commander decks → {#search-colour-pad}
- `Power`, `Toughness`, `Loyalty` — a number → {#search-number-pad}
- `Ability` — a keyword ability, e.g. flying, trample
- `Kind` — a kind of card, e.g. commander, permanent, spell
- `Artist` — the artist's name

### Picking a value {#search-values}
- Type, Rarity, Format, Color and Identity — their values are listed under the field; tap one
- Each value has its icon — a type's symbol, a rarity's colour, a format's mark
- Set — every set is listed, the one open in Browse first, then the newest; type to narrow it
- Rules Text, Ability, Kind and Artist — type the value, then Tab

### Number pad {#search-number-pad}
Where: `Mana Value`, `Power`, `Toughness`, `Loyalty`
It takes the keyboard's place.
- `<` fewer than, `≤` at most, `=` exactly, `≥` at least, `>` more than
- `0` to `9`
- Delete — the last thing typed
- Tab — done, e.g. `Mana Value ≤ 3`; with no sign, it means exactly
- ✕ — cancel this keyword

### Colour pad {#search-colour-pad}
Where: `Color`, `Identity`
It takes the keyboard's place.
- White, Blue, Black, Red, Green, Colourless — tap to switch on; several at once; each lights up in its colour
- `Color` — cards whose colours are all among those picked: Red alone is mono-red; Red and Green is red, green or red-green
- `Identity` — cards whose colour identity fits within those picked: what a commander of those colours can play
- Colourless — adds colourless cards; on its own, colourless cards only
- Delete — the last colour; Tab — done; ✕ — cancel

## Results {#search-results}
Under the field, as you type.
- `swamp in Final Fantasy` — first, when you've typed a set: search that set → {#search-in-set}
- `All Cards Matching "…"` — every card that matches; with chips, e.g. `All Cards with Type: Creature` → {#search-all}
- `Cards` — card names as you type, each with its art and mana cost → {#search-printings}
- `Sets` — sets whose names match, as in Browse → {#set-page}
- A spinner — still looking
- `Search Cards and Sets` — before you've typed anything
- Nothing but `All Cards…` — no names matched, or no connection

### Every matching card {#search-all}
- A grid of every card that matches, A to Z
- Its title says what you searched, e.g. `All Cards with Type: Creature, Color: Red`
- `Sort` — change the order → {#set-filter-sort}
- Tap a card → {#card-page}

### A card's printings {#search-printings}
- Every printing of the card, newest first
- With a set chip — only that set's printings
- Tap one → {#card-page}

## How to {#search-recipes}

### Red creatures, 3 mana or less, legal in Modern {#recipe-red-creatures}
1. Tap `Type`, then `creature`.
2. Tap `Color`, tap red, then Tab.
3. Tap `Mana Value`, tap `≤` and `3`, then Tab.
4. Tap `Format`, then `modern`.
5. Press Return.

### Every mythic in a set {#recipe-mythics}
1. Type `in:` and the set's code, e.g. `in:fin`, and pick the set.
2. Tap `Rarity`, then `mythic`.
3. Press Return.

### One card, in one set {#recipe-card-in-set}
1. Type the set's code and the card's name, e.g. `fra swamp`.
2. Tap `swamp in …` at the top.
3. Tap the card's name.

### Cards for your commander's colours {#recipe-commander}
1. Tap `Identity`.
2. Tap your commander's colours, then Tab.
3. Add more chips, or press Return.

### Cards that say something {#recipe-rules-text}
1. Tap `Rules Text`.
2. Type the words, e.g. draw a card.
3. Press Tab, then Return.
