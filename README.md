# Teaching Tools

Small, single-file classroom tools for teachers — each one runs in your browser,
works offline, and can be downloaded on its own.

### ▶︎ [Open the site](https://ethanpullan.github.io/TeachingTools/)

<https://ethanpullan.github.io/TeachingTools/>

## Tools

| Tool | What it does |
| --- | --- |
| [Seating Chart Generator](https://ethanpullan.github.io/TeachingTools/tools/seating-chart/) | Drag-and-drop room, keep-apart / keep-together rules, seatmate rotation, print |
| [Class Timer](https://ethanpullan.github.io/TeachingTools/tools/timer/) | Countdown & stopwatch with fun fullscreen backgrounds |
| [Class Board](https://ethanpullan.github.io/TeachingTools/tools/class-board/) | Corkboard with sticky notes, checklists, calendar & day countdown |
| [Name Wheel](https://ethanpullan.github.io/TeachingTools/tools/name-wheel/) | Spin to pick a name — pulls from your shared Class Lists, no repeats |
| [Name Caller](https://ethanpullan.github.io/TeachingTools/tools/name-caller/) | Pull a name out of a hat — pulls from your shared Class Lists, no repeats |
| [Movie Picker](https://ethanpullan.github.io/TeachingTools/tools/movie-picker/) | Cinema board with a ballot, votes and a weighted draw |
| [Multiplication Chart](https://ethanpullan.github.io/TeachingTools/tools/multiplication-chart/) | n × n times table with row/column highlight, fullscreen for the board, and print |
| [Science Graph Maker](https://ethanpullan.github.io/TeachingTools/tools/science-graph-maker/) | Graphs for science tests: line, bar (incl. dual-axis combo), scatter, coordinate, histogram, box plot, pie and number-line with best-fit lines, equations, shapes, error bars, log scales and alternate-version generator — paste data, hide things for a question version, export a question + answer-key pair (PNG 300 DPI / SVG), readability check, annotations, real-size grids, large print, presets, recent graphs, CSV import, click-to-plot, copy image, print sheets, black-and-white friendly |
| [Math Graph Maker](https://ethanpullan.github.io/TeachingTools/tools/math-graph-maker/) | Coordinate-plane graphs and number lines for math tests (number lines: inequalities in inequality / interval / set notation, integer hops, sign charts, blank boxes, double and vertical lines, fraction and decimal setups). Also transformations (translate, reflect, rotate, dilate with the image following the original), symmetry, area and perimeter by counting, Pythagorean squares, distance and midpoint, circles, a graph-paper generator (square, dot and isometric paper, or several practice grids per page), and data displays (bar, line, circle, pictograph, histogram, dot plot, stem-and-leaf, box plot and scatter plot with best-fit line) built from a data list, with frequency tables, statistics and misleading-graph options for critique questions. Test tools: multiple-choice questions with plausible wrong graphs made from real student mistakes (shuffled, answer letter in the key), sketch questions, exam look, calculator window, variants with different numbers, a look shared across a test, and arrows, notes and lettered regions. Coordinate plane: labelled points (filled or open), polygons and segments, equations in any form (y = mx + b, point-slope, standard, x = 4, f(x) = x² − 4) with intercepts, slope triangles, tables of values with blank cells, parallel/perpendicular lines, intersections, guide lines and the vertical line test, one- or four-quadrant grids with square cells, axes with arrows and letters, real minus signs and italic variables — type, paste from a spreadsheet, or click and drag on the graph; hide things for a question version (scaffold levels and answer lines), export a question + answer-key pair (PNG 300 DPI / SVG), grids locked to a real size (1 cm squares), large print, photocopy-safe, black-and-white friendly |

### Daily

Live boards that refresh from the internet but cache the last update, so they
still open and look right offline.

| Tool | What it does |
| --- | --- |
| [Daily Update](https://ethanpullan.github.io/TeachingTools/tools/daily-update/) | Today's weather with an "outdoor day?" call (pick any place) **and** NASA's Astronomy Picture of the Day, in one board |

### Games

| Game | What it does |
| --- | --- |
| [Tic-Tac-Toe](https://ethanpullan.github.io/TeachingTools/tools/games/tic-tac-toe/) | Tap to play, auto X / O, scoreboard — built for the smart board |
| [Super Tic-Tac-Toe](https://ethanpullan.github.io/TeachingTools/tools/games/super-tic-tac-toe/) | The ultimate 81-square version with forced boards |
| [Balloon Pop](https://ethanpullan.github.io/TeachingTools/tools/games/balloon-pop/) | Word-guessing game with a hidden entry and on-screen keys |
| [Dice](https://ethanpullan.github.io/TeachingTools/tools/games/dice/) | Felt tray, d4–d20 + d100, roll a pool with an auto total |
| [Farkle](https://ethanpullan.github.io/TeachingTools/tools/games/farkle/) | Two-player press-your-luck dice on a felt tray |
| [Tavern Dice](https://ethanpullan.github.io/TeachingTools/tools/games/tavern-dice/) | Loaded-dice wagering with a badge shop, two players |

## About

- **Class Lists.** Save your rosters once on the home page and every name tool
  (Name Caller, Name Wheel, Seating Chart) picks them up automatically. They're
  kept on your device only — each tool also runs on its own and takes names by hand.
- **One file per tool.** Inline CSS/JS, no CDNs, no web fonts, no network — open
  the `index.html` by double-click and it just works, online or off.
- **Static site.** Served straight from the repo root with GitHub Pages.
- **Design system.** Shared tokens and components live in
  [`STYLE_GUIDE.md`](STYLE_GUIDE.md).
- **Building the math graph tool?** Read
  [`docs/MATH_GRAPH_MAKER_HANDOFF.md`](docs/MATH_GRAPH_MAKER_HANDOFF.md) first: it records what
  worked, what broke, and what wasn't verified while building the Science Graph Maker.
