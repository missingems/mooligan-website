---
title: Search
id: search
feature: search
section: Cards
---
Where: the `Search` tab; ⌘F from anywhere → {#tab-bar}
- iPhone: the field under the title, the keyboard up as the tab opens
- iPad: one page, its field under the tabs
- Open Duo: the list beside what is picked — `Nothing Picked`

## The field {#search-field}
- `Cards and Sets` — type at least two letters
- Set chip — `in:` and a set's code or name, then Tab; everything found is from that set
- Keyword chips — e.g. `Type: Creature`, `Color: Red`, `Mana Value ≤ 3`, `Format: Modern`
- Scryfall's syntax — type it, e.g. `rarity:mythic`, `manavalue>=3`
- Backspace — remove the last chip
- Return — every card that matches → {#search-all}

## Keyword bar {#search-keyword-bar}
Where: over the keyboard, while the field is in use
- `Set` — `in:`
- `Type` — `type:`
- `Color` — `color:` → {#search-colour-pad}
- `Rules Text` — `oracle:`
- `Mana Value` — `manavalue:` → {#search-number-pad}
- `Rarity` — `rarity:`
- `Format` — `format:`
- `Identity` — `identity:`, colour identity → {#search-colour-pad}
- `Power`, `Toughness`, `Loyalty` → {#search-number-pad}
- `Ability` — `keyword:`, e.g. Flying
- `Kind` — `is:`, e.g. commander
- `Artist` — `artist:`
- Tab — make the value a chip
- Type a word — the keywords it leads to come first
- Tap a picked keyword — remove its chip

### Values {#search-values}
- `Type`: creature, instant, sorcery, artifact, enchantment, land, planeswalker, battle, legendary
- `Rarity`: common, uncommon, rare, mythic
- `Format`: standard, pioneer, modern, legacy, vintage, commander, pauper
- `Set`: every set, the one open under Browse first

### Number pad {#search-number-pad}
Where: `Mana Value`, `Power`, `Toughness`, `Loyalty`
- `<` `≤` `=` `≥` `>`
- `0`–`9`, delete, Tab
- Close — drop the keyword

### Colour pad {#search-colour-pad}
Where: `Color`, `Identity`
- W U B R G C — toggles, several at once
- `Color` — cards whose colours are all among those picked
- `Identity` — cards whose colour identity fits within them
- Delete, Tab, Close

## Results {#search-results}
- `<text> in <set>` — search within a set, first when you type a set's name
- `Recent Searches` with `Clear` — iPad, before you type
- `All Cards Matching "…"` — every card that matches → {#search-all}
- `Cards` — names as you type, with art and mana cost → {#search-printings}
- `Sets` — names that match → {#set-row}
- A spinner until the new rows land
- `Search Cards and Sets` — when nothing is typed

## What a result opens {#search-grid}
- A grid of cards, with `Sort` only → {#set-filter-sort}
- Tap a card → {#card-page}

### Every matching card {#search-all}
- `All Cards Matching "…"`, `… with …`, ` in <set>`
- A–Z by name; changes with the chips

### A card's printings {#search-printings}
- The card's name as the title
- Every printing, newest first; only the set's with a set chip

### A set's cards {#search-set}
- The set's grid, with `Sort` only → {#set-page}

## Examples {#search-examples}
- Red creatures, mana value 3 or less, legal in Modern: `Type` creature, `Color` R, `Mana Value` ≤ 3, `Format` modern, Return
- Mythics in a set: `in:fin`, `rarity:` mythic, Return
- A card in a set: type `fra swamp`, tap `swamp in …`
- Commander colours: `Identity` W U C, Tab
