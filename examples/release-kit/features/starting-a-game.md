---
id: starting-a-game
title: Starting a game
summary: Set up a life counter for everyone at the table.
since: 1.0.0
ui: [Play, Start]
use_cases:
  - id: two-player-game
    title: Start a two-player game
    goal: Play a game of Standard with a friend, the phone flat between you.
    flow:
      - step: Open the `Play` tab.
      - step: Choose 2 players and 20 life.
      - step: Tap `Start`. The screen splits into two seats facing opposite ways.
        capture: seats
    notes: Choosing Commander sets every seat to 40 life.
---
The life counter for a game in person. Before it starts, it asks how many are playing (two to six)
and the starting life (20 for most formats, 40 for Commander). Each player gets a seat, turned to
face them, so the phone can lie flat in the middle of the table. It remembers the last choice.
