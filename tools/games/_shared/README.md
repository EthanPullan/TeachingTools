# Shared game code — canonical sources

This suite ships **self-contained single-file tools** (no linked scripts — see
`STYLE_GUIDE.md` §0). So just like the design-token block, shared game code lives
here as a **canonical source** that is **inlined** into each game, and
**re-propagated** when it changes. Nothing here is fetched at runtime.

## `tournament.js` — single-elimination tournament mode

A dependency-free module that adds a "Tournament" flow to any **2-player** game:
choose 2–8 players, enter names, get a random single-elimination bracket (byes
auto-filled for non-powers-of-two), play each match in the host game, and record
results until a champion is crowned. It injects its own CSS (using the game's
design tokens) and a banner under the toolbar; the host game only reports who won.

### How a game uses it

1. Inline the whole file inside a `<script>` **before** the game's own script
   (the region is delimited by `/* <tournament-module> */ … /* </tournament-module> */`).
2. Add a toolbar button: `<button class="btn" id="tournamentBtn"><span class="ic">🏆</span>Tournament</button>`.
3. Configure it once, after the module loads:

   ```js
   Tournament.setup({
     game: 'Super Tic-Tac-Toe',
     sides: [ {name:'Blue (X)', color:'var(--x)'}, {name:'Red (O)', color:'var(--o)'} ],
     button: '#tournamentBtn',
     onMatchStart: function(a, b){ newGame(); }   // a → sides[0], b → sides[1]
   });
   ```

4. When a game ends, report the result (no-op unless a match is live):

   ```js
   Tournament.reportWinner(0);   // index into `sides` of the winning side
   Tournament.reportDraw();      // single-elim needs a winner → replays the match
   ```

### Currently inlined in

- `tools/games/tic-tac-toe/`
- `tools/games/super-tic-tac-toe/`
- `tools/games/drop-four/`

### Propagating a change

After editing `tournament.js`, replace the delimited region in each game above
with the new contents (the block between the `<tournament-module>` markers),
then re-verify. Keep every copy byte-identical to this source.
