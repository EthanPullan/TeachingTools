# Compound Naming — build plan

> A brief for the AI that will build `tools/compound-naming/index.html` and the small
> changes it needs in `tools/bingo/index.html`. Read this whole file, `CLAUDE.md` and
> `STYLE_GUIDE.md` first. Then read the Bingo tool's code: you will reuse its format and
> patterns. When the work is finished, delete this file.
>
> **Goal:** a generator that makes as many chemical-naming questions as a teacher wants:
> name ↔ formula for ionic (binary, multivalent, polyatomic) and covalent compounds. Each
> question set comes with decoys built from real student mistakes. The first use is
> **sending a ready-made game to Bingo**: the card shows `NaCl`, the slide shows
> “Sodium chloride”. Later the same engine can drive practice and worksheet modes.

---

## 0. Before you write any code: ask the owner

The owner's rule is to **ask, not assume**. These questions are still open. Ask them first,
in one batch. If you are running unattended, use the **default** and write down the
assumption in your final report.

| # | Question | Default if unattended |
|---|---|---|
| 1 | Directions: formula on the card and name on the slide, or the reverse too? | Both, chosen per game. Formula on the card is the default. |
| 2 | Spelling: *aluminum* or *aluminium*, *sulfate* or *sulphate*, *cesium* or *caesium*? | *Aluminum, sulfate, cesium.* This matches `tools/periodic-table`. |
| 3 | Which ions? Ask the owner for **their curriculum's ion chart** (BC?) and use it exactly. | The table in §4.2, marked “confirm”. |
| 4 | Multivalent extras: copper(I)? mercury(I) as Hg₂²⁺? | Include Cu⁺. Leave out Hg₂²⁺ in v1. |
| 5 | Acetate written `CH3COO` or `C2H3O2`? | `CH3COO`. |
| 6 | Covalent vowel dropping: *pentoxide* or *pentaoxide*, *monoxide* or *monooxide*? | Drop the vowel before “oxide” only: monoxide, pentoxide, tetroxide. |
| 7 | Covalent common names (water, ammonia, methane) as well? | No. Prefix names only. |
| 8 | Phosphorus oxides: P₂O₅ “diphosphorus pentoxide” or P₄O₁₀ “tetraphosphorus decoxide”? | Both, as separate compounds. |
| 9 | Acids and hydrates? | Out of scope for v1. |
| 10 | How should names look on slides: “Sodium chloride” or “sodium chloride”? | Capitalise the first letter only. |

---

## 1. Decisions already made (by the owner)

- **Separate tool**, not a mode inside Bingo. It sends its output to Bingo.
- **Hand-off: browser storage first, JSON file as the backup** (§6).
- **Hard-code the rules and the ion tables, not a fixed list of compounds.** Ionic compounds are
  *generated* (practically unlimited). Covalent compounds come from a **curated list** of real
  molecules, because their formulas can't be worked out from charges. A generator would invent
  compounds that don't exist.
- **The generator makes the decoys** and sends them with their mistake notes. Bingo already
  stores and shows those notes.
- House rules: one self-contained HTML file, works offline by double-click, no CDNs, fonts or
  network requests, and the `STYLE_GUIDE.md` tokens inlined.

---

## 2. What the teacher sees (one page)

Toolbar: brand “Compound Naming”, linking back to the home page. Main area in three parts:

1. **Options**
   - **Compound types** (checkboxes): Binary ionic · Multivalent (Roman numerals) ·
     Polyatomic ions · Covalent (prefixes). Each shows how many different compounds it can
     make with the current ions, e.g. “Binary ionic: 132 possible”.
   - **Direction** (segmented): *Formula on the card* (the slide shows the name) /
     *Name on the card* (the slide shows the formula).
   - **How many**: default 30. Warn below 24, the number of squares on a 5×5 card with FREE.
   - **Mix**: split evenly across the ticked types. A per-type count is optional, so don't
     build it unless it is asked for.
   - **Decoys**: how many (default 10) and on/off.
2. **The set** (a table): #, name, formula (rendered with subscripts), type, and a note
   (“Fe is 3+ here”). Each row has 🔒 lock, ↻ replace with another of the same type, and × remove.
   **New set** re-rolls every unlocked row. Below the table is the decoy list: each decoy with
   its mistake, ↻ and ×.
3. **Send**
   - **Send to Bingo** (primary): see §6.
   - **Download .json** (backup, always visible): the same payload as a file Bingo can import.
   - Optional: **Copy as text**, one `name | formula` line per question, for pasting into
     Bingo's question box.

Keep the tool's own state (options, the current set, locks) in `localStorage` under
`compoundnaming.v1.*`. Wrap every read and write in try/catch.

---

## 3. Chemistry rules (the engine, pure functions)

Put all of this in one `/* <compound-core> */ … /* </compound-core> */` block with no DOM
code, as Bingo does, so it can be tested in Node.

### 3.1 Ionic formulas
- Cation charge `c`, anion charge `a` (as a positive number). With `g = gcd(c, a)`:
  cation count = `a / g`, anion count = `c / g`.
- A count of 1 is left out. A **polyatomic ion with a count above 1 goes in brackets**:
  `Ca(OH)2`, `(NH4)2SO4`, `Al2(SO4)3`.
- **Never reduce inside a polyatomic ion**, and never reduce a diatomic cation such as Hg₂²⁺
  if the owner adds it.
- Write formulas as **plain ASCII** (`Al2(SO4)3`). Subscripts are added only when they are
  shown (§5).

### 3.2 Ionic names
- Cation name, a space, then the anion name: “sodium chloride”, “ammonium sulfate”.
- **Multivalent metals:** a Roman numeral for the charge, in brackets, straight after the
  metal with no space: “iron(III) chloride”, “copper(I) oxide”.
- Monatomic anions end in *-ide*: chloride, oxide, sulfide, nitride, phosphide, bromide,
  iodide, fluoride, selenide.

### 3.3 Covalent (curated list)
- A hand-checked list of about 50–80 **real** molecules, each stored as
  `{ formula, name }`, written out in full. Don't build covalent names at run time, but **do**
  check them at test time with the prefix rules:
  - mono-, di-, tri-, tetra-, penta-, hexa-, hepta-, octa-, nona-, deca-
  - leave out *mono-* on the first element
  - drop vowels per question 6
- Starting list. **Check every entry** against a reliable source before including it, and
  record that source in a comment:
  - Carbon: CO, CO₂, CS₂, CCl₄
  - Nitrogen: NO, NO₂, N₂O, N₂O₃, N₂O₄, N₂O₅, NF₃, NCl₃
  - Sulfur and selenium: SO₂, SO₃, SF₄, SF₆, SeO₂
  - Phosphorus: PCl₃, PCl₅, P₂O₅ / P₄O₁₀ (question 8)
  - Silicon and boron: SiO₂, SiCl₄, BF₃, BCl₃
  - Halogens and xenon: Cl₂O, Cl₂O₇, OF₂, ClF₃, BrF₅, IF₇, XeF₄, XeF₆
- Show the teacher how many covalent compounds there are, e.g. “Covalent: 34 compounds”.
  That pool is the limit for this type.

### 3.4 Rules for picking a set
- No repeats. Two different questions must never have the same formula or the same name.
- Spread across the ticked types, and within a type across different ions. Avoid ten
  chlorides in a row.
- Use a seeded random number generator (copy Bingo's `makeRng` / `shuffle`), so a set can be
  reproduced while testing. **New set** uses a new seed.

---

## 4. Data (hard-coded tables)

### 4.1 Elements
Only the names and symbols that are needed. `tools/periodic-table/index.html` has a
generated `RAW` table (`number symbol name mass category ions`). **Copy** the names from it
(tools don't share files), so the spelling matches. Don't take charges from its “common ions”
column: it is a reference list, not a curriculum chart (it lists copper as 2+ only, for
example). Charges come from §4.2.

### 4.2 Ions (default list: confirm with the owner's chart, question 3)
- **Fixed-charge cations:** Li⁺ Na⁺ K⁺ Rb⁺ Cs⁺ · Be²⁺ Mg²⁺ Ca²⁺ Sr²⁺ Ba²⁺ · Al³⁺ · Zn²⁺ ·
  Ag⁺ · NH₄⁺ (polyatomic)
- **Multivalent cations:** Fe²⁺/³⁺ · Cu⁺/²⁺ · Co²⁺/³⁺ · Ni²⁺/³⁺ · Pb²⁺/⁴⁺ · Sn²⁺/⁴⁺ ·
  Mn²⁺/⁴⁺ · Cr²⁺/³⁺ · Au⁺/³⁺ · Ti³⁺/⁴⁺ (confirm every one)
- **Monatomic anions:** F⁻ Cl⁻ Br⁻ I⁻ · O²⁻ S²⁻ Se²⁻ · N³⁻ P³⁻
- **Polyatomic anions:**
  - OH⁻, CN⁻
  - NO₃⁻, NO₂⁻
  - SO₄²⁻, SO₃²⁻, HSO₄⁻
  - PO₄³⁻, HPO₄²⁻, H₂PO₄⁻
  - CO₃²⁻, HCO₃⁻
  - ClO⁻, ClO₂⁻, ClO₃⁻, ClO₄⁻
  - MnO₄⁻, CrO₄²⁻, Cr₂O₇²⁻
  - CH₃COO⁻ (question 5)
- **Type tags:** “Binary ionic” uses fixed-charge cations with monatomic anions. “Multivalent”
  uses multivalent cations with any anion. “Polyatomic” means at least one polyatomic ion, with
  a fixed-charge cation, so it doesn't overlap Multivalent. Write these tags down in the code.

---

## 5. Decoys: the mistake catalogue

Each decoy is `{ answer, mistake, source }`. `source` is the question it comes from. Make
decoys for the **card side**: formula decoys when formulas are on the cards, name decoys when
names are.

**Formula decoys** (for the name “X”):
| Mistake | Example | Note to write |
|---|---|---|
| Charges not balanced | calcium chloride → `CaCl` | “calcium chloride: charges not balanced” |
| Crossed over but not reduced | calcium oxide → `Ca2O2` | “…: subscripts not reduced” |
| Wrong Roman-numeral charge | iron(III) chloride → `FeCl2` | “…: used Fe²⁺ instead of Fe³⁺” |
| Roman numeral used as a subscript | iron(III) chloride → `Fe3Cl` | “…: wrote the III as a subscript” |
| Missing brackets | calcium hydroxide → `CaOH2` | “…: forgot the brackets around OH” |
| *-ite* / *-ate* mix-up | sodium sulfate → `Na2SO3` | “…: sulfite instead of sulfate” |
| Prefix ignored (covalent) | carbon dioxide → `CO` | “…: ignored the di- prefix” |
| Charges used on a covalent compound | dinitrogen tetroxide → … | “…: balanced charges as if ionic” |

**Name decoys** (for the formula “Y”): the wrong Roman numeral (“iron(II) chloride”), an
-ite/-ate swap, a missing prefix (“nitrogen oxide” for NO₂), prefixes on an ionic compound
(“calcium dichloride”), no Roman numeral on a multivalent metal (“iron chloride”).

**Rules for decoys:**
- A decoy must **never equal any answer in the set**, using the same matching as Bingo (§7).
  This matters because a decoy can be a real compound (FeCl₂). If iron(II) chloride is
  also a question in the set, that FeCl₂ can't be a decoy.
- No two decoys are the same, and none has a value that is already taken.
- Prefer variety: different mistakes from different questions. Never more than 2 decoys
  from one question.
- Skip mistakes that don't apply. A charge of 1 has nothing to balance, and covalent
  compounds have no Roman numerals.

---

## 6. Sending to Bingo (browser storage first, JSON as the backup)

### 6.1 The payload: Bingo's existing draft format, plus one field
```json
{
  "format": "teachingtools-bingo-draft",
  "title": "Naming: ionic and covalent",
  "formulas": true,
  "source": "compound-naming",
  "items":  [ { "question": "Sodium chloride", "answer": "NaCl" } ],
  "decoys": [ { "answer": "CaCl", "mistake": "calcium chloride: charges not balanced" } ]
}
```
Bingo already reads `format`, `title`, `items`, and `decoys` with `mistake`. The new field is
`formulas: true`, which turns on Bingo's formula mode (§7). For *name on the card*, the
questions are formulas and the answers are names. Send `formulas: true` in that direction
too, so the slides show subscripts.

### 6.2 Browser storage (primary)
1. Write `localStorage['teachingtools.handoff.v1'] =
   { id, to:'bingo', from:'compound-naming', createdAt, payload }`. `id` is a random string.
   Read it back to make sure the write worked.
2. Go to `../bingo/index.html#handoff=<id>` in the same tab. The generator autosaved its own
   state first.
3. When Bingo loads, it checks for `#handoff=`. It reads the key and accepts it only if the
   `id` matches, `to === 'bingo'`, and it is less than 24 hours old. Then it shows its normal
   **Import questions** dialog (`offerDraft`), with **Start a new game** as the main button.
4. After a successful import Bingo **removes the key**, and clears the hash with
   `history.replaceState`, so a reload doesn't import it again.

### 6.3 Backup (JSON)
- If storage is blocked, or the read-back fails, the generator **downloads the .json
  automatically**. It then explains: “Open Bingo → Import… → choose this file.”
- If Bingo finds `#handoff=` but no matching key, it shows: “The questions didn't arrive. This
  can happen when the tools are opened as files. In Compound Naming, press **Download .json**,
  then use **Import…** here.” Then it clears the hash.
- **I'm not sure about this, so test it:** whether two tools opened from files (`file://`)
  share `localStorage` depends on the browser. It works on GitHub Pages (same origin). Test
  Chrome/Edge and Firefox both from files and served over http. Report what you find. The
  backup path must work everywhere.

---

## 7. Changes to Bingo (small and general)

In `tools/bingo/index.html`. Every change must keep the core pure (inside `<bingo-core>`) and
the Node tests passing.

1. **Formula mode:** a per-game setting, `game.formulas` (boolean).
   - Add it to `blankGame` and `normalizeGame`.
   - Show it on Setup as a checkbox: “Answers and questions are chemical formulas”.
   - It is set from the payload's `formulas`, through `readDraft` and then `offerDraft`.
2. **Showing formulas:** when formula mode is on, a digit straight after a letter or `)`
   becomes a subscript (`CaCl2` → CaCl₂, `Al2(SO4)3` → Al₂(SO₄)₃). Charges use the existing
   `^` (`Fe^3+`). Names with Roman numerals have no such digits, so they are unaffected.
   - Apply it in `renderAnswer`, in `renderMath` for questions, and when sizing card text in
     `answerShape` (subscripts count as narrow).
   - Without formula mode, nothing changes. Check that the existing tests still pass.
3. **Matching formulas:** in formula mode, text answers are compared after removing `_` and
   spaces, so `CaCl_2`, `CaCl2` and `CaCl 2` are the same. **Case still matters**: `Co` (cobalt)
   is not `CO` (carbon monoxide). Change `normText` / `valueInfo` through an option, not
   globally.
4. **Receiving the hand-off:** read `#handoff=` on startup (§6.2), and show the backup message
   when it fails.
5. **Ready-made list:** add a card for the generator. Give a `BANK` entry an optional
   `link: '../compound-naming/index.html'`. A card with a link shows **Open the generator**
   instead of **Use this game**.
6. **Name-on-the-card games:** long names should go on 4×4 cards. When the payload sets
   `formulas` and the answers are names, start the new game at 4×4 (`set.size`). Check that
   “iron(III) chloride” fits on 5×5 and 4×4 cards in print.

---

## 8. Testing (no test framework in the repo; keep scripts in the scratchpad, don't commit them)

1. **Engine, in Node:** extract the `<compound-core>` block.
   - A **hand-checked table of at least 40 compounds** (name ↔ formula) covering every rule:
     - brackets: `Al2(SO4)3`, `(NH4)3PO4`
     - Roman numerals: iron(III) oxide → `Fe2O3`, lead(IV) oxide → `PbO2`
     - reduced subscripts: tin(IV) oxide → `SnO2`
     - acetate, dichromate, and every curated covalent compound
   - Every generated compound converts both ways (formula ↔ name) without loss.
   - A set never repeats a formula or a name, and the same seed gives the same set.
   - Decoys never equal an answer in the set, and every decoy's mistake is really what its
     note says.
   - Every type, alone and mixed, can make 30 (or reports a lower maximum honestly).
2. **Bingo, in Node:** formula rendering, matching (`CaCl_2` = `CaCl2`, `Co` ≠ `CO`), and that
   the existing core tests still pass.
3. **End to end, in Playwright** (pre-installed; see the environment notes):
   - Generator: choose types, check the set, **Send to Bingo**, the import dialog, a new game,
     **Make cards**, cards showing CaCl₂ with subscripts, present mode showing the name,
     Check a card explaining a decoy, and printing.
   - Run it over http (`python3 -m http.server`) **and** from `file://`, and check the backup
     path from file.
4. Phone width, `prefers-reduced-motion`, and no network requests.

---

## 9. Build order (put each step on `main` once it works; see `CLAUDE.md`)

1. Ask the §0 questions. Build the engine and data, with the Node tests.
2. The generator page: options, set table, lock/replace/remove, and Download .json.
3. Bingo: formula mode, showing formulas, matching, then receiving the hand-off.
4. Send to Bingo (browser storage), the backup messages, and the generator card in Bingo's
   ready-made list.
5. A home-page card for Compound Naming, next to the Periodic Table.
6. **Later, not now:** practice and worksheet modes that reuse the engine (flashcards, a
   printable worksheet with an answer key). Mention this to the owner; don't build it.
