---
id: filtering
title: Filtering
summary: Narrow any list of cards by colour, type, rarity, mana value or format.
since: 1.0.0
ui: [Filter, Clear, Done, Save]
use_cases:
  - id: stack-filters
    title: Narrow a list with several filters
    goal: Find every blue card legal in Modern.
    flow:
      - step: Open any list of cards, such as a set or search results.
      - step: Tap `Filter`.
        capture: filter-sheet
      - step: Choose Blue under Colour, then Modern under Format, and tap `Done`.
      - step: The list shows only matching cards, with the filters in a row above it.
        capture: result
  - id: save-filters
    title: Save a set of filters
    goal: Apply the same filters again later with one tap.
    flow:
      - step: With filters applied, tap `Save` and give them a name.
      - step: The saved set appears at the top of the filter sheet, ready to apply.
---
Filters narrow whatever list is on screen: a set, or search results. They stack, each narrowing
what the last one left, and they stay until removed, even when moving to another list.

New in 1.4.0: a set of filters can be saved under a name and applied again from the top of the
filter sheet.
