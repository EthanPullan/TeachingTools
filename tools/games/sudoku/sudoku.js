/* Sudoku — main game logic.
   Kept in its own file (not inlined) as a deliberate exception to the suite's
   single-file rule, so the game's features stay readable. Loaded by index.html
   AFTER techniques/*.js (which register on window.SudokuTechniques).
   ──────────────────────────────────────────────────────────────────────── */
(function(){
  /* ============================================================
     Puzzle library — the "import" slot.
     These 24 boards were lifted straight from the uploaded PDF
     booklet (every one verified to have a single solution). New
     puzzles drop in here as {id, diff, givens, solution}; givens
     and solution are 81-char strings read left→right, top→bottom,
     with '0' for a blank.
     ============================================================ */
  const PUZZLES = [
    {id:'#50294', diff:'hard', givens:'000027000040000080000300601501009400090106020800000000007500000682030000100700008', solution:'918627534346915782275384691521879463793146825864253179437598216682431957159762348'},
    {id:'#99290', diff:'hard', givens:'004690005009000000208040700030418000000000000000000983000102600000500408076000200', solution:'314697825769825314258341796937418562685239147421756983843172659192563478576984231'},
    {id:'#206394', diff:'moderate', givens:'000800000006010000000000524000000000570004900008300600040000007000120000050906008', solution:'435892761726415389891763524964251873573684912218379645642538197389127456157946238'},
    {id:'#174454', diff:'moderate', givens:'600000007030200000000700000040300005800000960020006813408000020090080000070020590', solution:'652849137734251689189763452946318275813572964527496813468935721295187346371624598'},
    {id:'#132862', diff:'moderate', givens:'002900000083200000000008000008400000000031420070050008000000100060000090040010853', solution:'712963584983245671456178239128497365695831427374652918837529146561384792249716853'},
    {id:'#40295', diff:'moderate', givens:'000000100806500030007000020000096450700000061000800000001000200005630090040080000', solution:'352978146816524937497163528138796452729345861564812379671459283285631794943287615'},
    {id:'#116567', diff:'moderate', givens:'010000005067000000400003900750200006000004200000000300000000800200096040370010020', solution:'813942675967185432425763918754239186138654297692871354549327861281596743376418529'},
    {id:'#98416', diff:'hard', givens:'000090000682300500100700008045000000000000000000003072900200006010000083060040000', solution:'574698321682314597139725468745182639321976854896453172958231746417569283263847915'},
    {id:'#181821', diff:'moderate', givens:'000000050000010904000400060920000000800064000074080000030000080407900300000051040', solution:'342896157768513924195472863926135478813764295574289631231647589457928316689351742'},
    {id:'#16706', diff:'hard', givens:'004006000000000820006092000020004750580000600000001003900130000000000504000700000', solution:'254816379193457826876392415329684751581973642467521983945138267718269534632745198'},
    {id:'#132929', diff:'moderate', givens:'200006008000000000005000600000830900087004000000000500470008000060051302030060000', solution:'213946758698725413745183629156832947987514236324679581472398165869451372531267894'},
    {id:'#133177', diff:'moderate', givens:'000470001080031000904006050000020070270000008500040000400000000000003205001000869', solution:'632475981785931624914286753149328576273569418568147392456892137897613245321754869'},
    {id:'#91098', diff:'moderate', givens:'000500000015000000764090000002004500601000000070306000000000320007200850200803006', solution:'923547618815632974764198235392784561641925783578316492186459327437261859259873146'},
    {id:'#109344', diff:'moderate', givens:'200006317003200040000095000007000000000180090000000076015000000002009060000034080', solution:'259846317683271945741395628397462851564187293128953476415628739832719564976534182'},
    {id:'#224526', diff:'moderate', givens:'207000000500000400000006005704080200035020074100030000010070006000003020000104009', solution:'247395861596718432381246795764589213835621974129437658913872546458963127672154389'},
    {id:'#121055', diff:'moderate', givens:'020600030008000000000001090006200000152300406000007009000700010800030005403000000', solution:'921675834648923751537481692796214583152398476384567129265749318879136245413852967'},
    {id:'#61522', diff:'hard', givens:'500000000000000060040605100000003024090000800003001009010048052007060000980010000', solution:'569127348731894265842635197178953624495276813623481579316748952257369481984512736'},
    {id:'#118067', diff:'moderate', givens:'003000000000000049070508000000000000097425300068900000000009008000070902200006103', solution:'913764825685312749472598631324681597197425386568937214731259468846173952259846173'},
    {id:'#5388', diff:'moderate', givens:'080050900290000600300070000007000040000001080000609300000302000050000000004000018', solution:'786254931295183674341976852927835146463721589518649327879312465152468793634597218'},
    {id:'#55225', diff:'moderate', givens:'000000600100407000004010000400060803890000000020700100200000000030800705007100090', solution:'782395641169487532354612987475961823891253476623748159218579364936824715547136298'},
    {id:'#128766', diff:'moderate', givens:'001000008000001009870540020003000097527000000000406000700000000000800750002030806', solution:'491362578235781469876549321643258197527193684918476235784625913369814752152937846'},
    {id:'#105012', diff:'hard', givens:'300504006000103700508000000009000003000040900006001005001090234070000001000800000', solution:'327584196694123758518769342749258613185346927236971485851697234972435861463812579'},
    {id:'#102038', diff:'hard', givens:'000200093004000000000700501100040007080090010070005004600800000003000000042000750', solution:'567281493214539678938764521125648937486397215379125864651872349793456182842913756'},
    {id:'#50226', diff:'moderate', givens:'008000003000010607001063002583027004006000000400300000300051200060070000800002900', solution:'678294513234518697951763482583927164726145839419386725397851246162479358845632971'},
    // ── 1sudoku.com — Expert / Evil set (each verified to a single solution) ──
    {id:'#424395', diff:'expert', givens:'040060800000030024003800060300900000207000901000007008050003600170080000002090040', solution:'749265813618739524523814769385921476267348951491657238954173682176482395832596147'},
    {id:'#515983', diff:'evil', givens:'200408000560910000008050000071000600025607940009000350000060800000094036000803005', solution:'213478569564912783798356412471539628325687941689241357132765894857194236946823175'},
    {id:'#45153', diff:'expert', givens:'009600300000700008040080005052908000000040000000203860200070010300001000005009700', solution:'589614372623795148741382695152968437836147259974253861298476513367521984415839726'},
    {id:'#520367', diff:'evil', givens:'000000008005800030090107200036040500000601000001020870008406050010002400600000000', solution:'164235798725894631893167245236748519987651324451923876378416952519382467642579183'},
    {id:'#427141', diff:'expert', givens:'030060102020004000008100005000200060005706300060005000400001700000800090703050040', solution:'934568172521374986678129435817293564245786319369415827492631758156847293783952641'},
    {id:'#514165', diff:'evil', givens:'651007004003000000940000500000210007008506400400079000004000031000000900300400765', solution:'651397824823145679947682513596214387178536492432879156764958231215763948389421765'},
    {id:'#424975', diff:'expert', givens:'003047060040800000908030000020000604800000001301000020000010207000008090090720300', solution:'213547869647892513958631472529173684874265931361984725486319257732458196195726348'},
    {id:'#517637', diff:'evil', givens:'000017030700900400092340100900000580504000601017000003008093720005004009070120000', solution:'456817932731962458892345167923671584584239671617458293148593726265784319379126845'},
    {id:'#427371', diff:'expert', givens:'000400860000002570000300001007040950006000200042050700600007000038600000059001000', solution:'921475863463182579875369421187243956596718234342956718614597382738624195259831647'},
    {id:'#522167', diff:'evil', givens:'700100006010007230080053000094070003007409600100030740000320060068700050900005001', solution:'723184596415967238689253174294576813837419625156832749541328967368791452972645381'},
    {id:'#416373', diff:'expert', givens:'080100000009000005002963000904007000300000004000500206000412900400000700000009080', solution:'687145329139278645542963817954627138326891574718534296875412963491386752263759481'},
    {id:'#515035', diff:'evil', givens:'520304090300009007001000000100200084000000000860003002000000700200700005090108043', solution:'526374891348619527971825436159267384732481659864593172415932768283746915697158243'},
    {id:'#418878', diff:'expert', givens:'000000700600700090020010030002004078000503000540800600030090080080005004001000000', solution:'198352746653748291724619835312964578876523419549871623435296187287135964961487352'},
    {id:'#5838', diff:'evil', givens:'020085071400007000070100409002000000791503020003000000050300102100009000030041095', solution:'329485671415697238678132459542718963791563824863924517954376182187259346236841795'},
    {id:'#416732', diff:'expert', givens:'004010000600700008080004050502007100070000020001400805050100080900008007000040300', solution:'234815796695723418187964253542687139879351624361492875453176982916238547728549361'},
    {id:'#524430', diff:'evil', givens:'208009007070000580050200004800106400000030000007805006400001030061000040500900201', solution:'238459617974613582156278394895126473612734859347895126429561738761382945583947261'},
    {id:'#4126', diff:'expert', givens:'090003005000090020200700800087000010009070400040000970002006001010040000600800050', solution:'491283765768594123253761894387429516129675438546138972872956341915342687634817259'},
    {id:'#521051', diff:'evil', givens:'140060000508040690090100070002000000870000012000000900080004050039050706000080024', solution:'147569238528347691693128475912475863874693512365812947286734159439251786751986324'},
    {id:'#317629', diff:'hard', givens:'009002000310090000200160500900010084000000000170080006004071008000030012000800400', solution:'759342861316598247248167593965213784483756129172984356524671938897435612631829475'},
    {id:'#413560', diff:'expert', givens:'028005096900208000000000020070004000064000730000800050090000000000706002610400370', solution:'128375496943268517756941823579634281864152739231897654497523168385716942612489375'},
    {id:'#3731', diff:'hard', givens:'000540030600700000902010700000100004019020560700005000005070308000008002030091000', solution:'178542639653789241942613785526137894319824567784965123295476318461358972837291456'},
    {id:'#416604', diff:'expert', givens:'146008005720006000000000007002085000010000040000930200800000000000300098900800734', solution:'146798325723546981589123467692485173315267849478931256834679512257314698961852734'},
    {id:'#328796', diff:'hard', givens:'900300006507090000000801200040000000806000403000000050001906000000070908200005001', solution:'928347516517692384634851297742538169856219473193764852381926745465173928279485631'},
    {id:'#45075', diff:'expert', givens:'004001800610000000000004020000108703030020050908605000090700000000000045003500600', solution:'354271896612859437789364521425198763136427958978635214591746382267983145843512679'},
    // ── 12 diabolic puzzles (PDF, each verified; solver matches the printed solution) ──
    {id:'#D1', diff:'diabolic', givens:'000001074000800000000000006009007000800500300045600001010405639000009400060000150', solution:'286931574497856213153742986629317845871594362345628791712485639538169427964273158'},
    {id:'#D2', diff:'diabolic', givens:'070014090004020600000006000000000070050000400920060300001000000200090010403001706', solution:'672314598514928637839576142346189275158237469927465381781642953265793814493851726'},
    {id:'#D3', diff:'diabolic', givens:'700000090005010070000900380607003200200890100013002008001000000500080000000075006', solution:'728534691395618472146927385687153249254896137913742568471269853569381724832475916'},
    {id:'#D4', diff:'diabolic', givens:'000005700780060000400300009000008070060030000000072935005080406000000090000924000', solution:'639845712781269543452317869523498671967531284814672935195783426248156397376924158'},
    {id:'#D5', diff:'diabolic', givens:'700000010000000000012070080060490700080700000000006000000020095106000020204019008', solution:'738245916945861237612973584361498752489752361527136849873624195196587423254319678'},
    {id:'#D6', diff:'diabolic', givens:'000048051002050496000000000000002039301065020000000600500030000400001063200490000', solution:'739648251182753496654219378846172539371965824925384617517836942498521763263497185'},
    {id:'#D7', diff:'diabolic', givens:'002001067900603200000708300000109000006400020108000093003004000080000900260000008', solution:'832941567971653284654728319527139846396487125148562793713894652485276931269315478'},
    {id:'#D8', diff:'diabolic', givens:'000002000300600070000050001000813006500000000000060800603970510000005030020300000', solution:'819732465354681279267459381472813956586297143931564827643978512798125634125346798'},
    {id:'#D9', diff:'diabolic', givens:'000030506040019020020054019090000000201070000057000000004090302010060000305700000', solution:'189237546546819723723654819498523671231476985657981234874195362912368457365742198'},
    {id:'#D10', diff:'diabolic', givens:'000006500500100003410000009609805034000030096100000070000408000004000051000067000', solution:'982346517576189423413752689629875134745231896138694275357418962864923751291567348'},
    {id:'#D11', diff:'diabolic', givens:'000084090300020647200050008050003906048000000003002480000009000007000000000035200', solution:'176384592385921647294657138752843916948516723613792485531279864427168359869435271'},
    {id:'#D12', diff:'diabolic', givens:'040000000000083904002001830000600000500800402200005300090100020000040003000006500', solution:'348597261615283974972461835139624758567839412284715396493158627756942183821376549'},
  ];

  const $ = id => document.getElementById(id);
  const boardEl = $('board');

  /* ---------- precomputed unit lookups (peers for highlight + conflicts) ---------- */
  const rowOf = i => (i/9)|0, colOf = i => i%9;
  const boxOf = i => (((i/9)|0)/3|0)*3 + ((i%9)/3|0);
  const ROWS=[], COLS=[], BOXES=[];
  for(let u=0;u<9;u++){ ROWS.push([]); COLS.push([]); BOXES.push([]); }
  for(let i=0;i<81;i++){ ROWS[rowOf(i)].push(i); COLS[colOf(i)].push(i); BOXES[boxOf(i)].push(i); }
  // every cell a given cell "sees" (its row + column + box, minus itself)
  const PEERS = [];
  for(let i=0;i<81;i++){
    const s = new Set([...ROWS[rowOf(i)], ...COLS[colOf(i)], ...BOXES[boxOf(i)]]); s.delete(i);
    PEERS.push([...s]);
  }
  let reduceMotion=false; try{ reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(_){}

  /* ---------- state ---------- */
  let puzzle = null;              // current PUZZLES entry
  let cells  = [];               // 81 × {given, val(0-9), grey:Set, blue:Set, strike:Set}
  const selection = new Set();    // selected cell indices
  let anchor = -1;                // primary cell (drives peer / same-digit highlight)
  let mode = 'digit';             // 'digit' | 'grey' | 'blue' | 'strike'
  let diffFilter = 'all';
  let history = [];               // undo stack of board snapshots
  let solved = false;
  let paused = false;
  let highlightNum = 0;           // 1-9 → light up every match; 0 → off
  let techResult = null;          // current technique finding (cells/unit to highlight), or null

  /* ---------- build the board DOM once ---------- */
  const cellEls = [], valEls = [], noteSpanEls = [];
  for(let i=0;i<81;i++){
    const el = document.createElement('div');
    el.className = 'cell';
    if(colOf(i)%3===2) el.classList.add('br3');
    if(rowOf(i)%3===2) el.classList.add('bb3');
    el.dataset.i = i;
    const val = document.createElement('div'); val.className='val';
    const notes = document.createElement('div'); notes.className='notes';
    const spans = [];
    for(let n=0;n<9;n++){ const s=document.createElement('span'); notes.appendChild(s); spans.push(s); }
    el.appendChild(val); el.appendChild(notes);
    boardEl.appendChild(el);
    cellEls.push(el); valEls.push(val); noteSpanEls.push(spans);
  }

  /* build the 1-9 number pad */
  const padGrid = $('padGrid'); const numEls = [];
  for(let n=1;n<=9;n++){
    const b = document.createElement('button');
    b.className='num'; b.dataset.n=n;
    b.innerHTML = n + '<span class="left"></span>';
    b.addEventListener('click', ()=>pressNumber(n));
    padGrid.appendChild(b); numEls.push(b);
  }

  /* ---------- load / reset ---------- */
  function loadPuzzle(p){
    puzzle = p;
    cells = [];
    for(let i=0;i<81;i++){
      const g = p.givens[i] !== '0';
      cells.push({ given:g, val: g ? +p.givens[i] : 0, grey:new Set(), blue:new Set(), strike:new Set() });
    }
    selection.clear(); anchor = -1; history = []; solved = false; paused = false; highlightNum = 0;
    clearTech();
    setCover('none');
    resetTimer(); startTimer();
    syncPicker();
    render();
  }
  function restart(){ if(puzzle) loadPuzzle(puzzle); }

  // Pick a fresh random puzzle obeying the difficulty filter (avoid an instant repeat).
  function newPuzzle(){
    const pool = PUZZLES.filter(p => diffFilter==='all' || p.diff===diffFilter);
    let choices = pool.filter(p => p !== puzzle);
    if(!choices.length) choices = pool;
    loadPuzzle(choices[(Math.random()*choices.length)|0]);
  }

  /* ---------- snapshots for undo ---------- */
  function snapshot(){
    history.push(cells.map(c => ({ v:c.val, g:[...c.grey], b:[...c.blue], s:[...c.strike] })));
    if(history.length > 400) history.shift();
    updateUndo();
  }
  function undo(){
    if(!history.length) return;
    clearTech();
    const snap = history.pop();
    snap.forEach((sn,i)=>{ cells[i].val=sn.v; cells[i].grey=new Set(sn.g); cells[i].blue=new Set(sn.b); cells[i].strike=new Set(sn.s); });
    if(solved){ solved=false; setCover('none'); startTimer(); }
    render(); updateUndo();
  }
  function updateUndo(){ $('undoBtn').disabled = history.length===0; }

  /* ---------- conflicts (a digit repeated in a row, column or box) ---------- */
  function computeConflicts(){
    const bad = new Array(81).fill(false);
    const scan = unit => {
      const seen = {};
      for(const i of unit){ const v=cells[i].val; if(v){ (seen[v]=seen[v]||[]).push(i); } }
      for(const v in seen){ if(seen[v].length>1) seen[v].forEach(i=>bad[i]=true); }
    };
    for(let u=0;u<9;u++){ scan(ROWS[u]); scan(COLS[u]); scan(BOXES[u]); }
    return bad;
  }

  /* ---------- render everything from state ---------- */
  function render(){
    if(!cells.length) return;          // nothing to draw until a puzzle is loaded
    const bad = computeConflicts();
    const single = selection.size===1 ? anchor : -1;
    let peerSet=null;
    if(single>=0) peerSet = new Set([...ROWS[rowOf(single)], ...COLS[colOf(single)], ...BOXES[boxOf(single)]]);
    // the digit to light up (light yellow). highlightNum is kept in step with the selection
    // (see syncHighlight), so clicking a new cell always refreshes the highlight.
    const hl = highlightNum;
    // while Digit mode is active, the selection wash signals the count: exactly 2 → blue, 3+ → grey
    const selTint = mode==='digit' ? (selection.size===2 ? 'blue' : selection.size>2 ? 'grey' : '') : '';
    // technique highlight: the key cells, plus (faintly) the unit they live in
    const techCells = techResult ? new Set(techResult.cells) : null;
    const techUnit  = (techResult && techResult.unit) ? new Set(techResult.unit.cells) : null;

    let filled=0, conflictCount=0;
    for(let i=0;i<81;i++){
      const c = cells[i], el = cellEls[i];
      if(c.val) filled++;
      if(bad[i]) conflictCount++;

      const isSel = selection.has(i);
      el.classList.toggle('given', c.given);
      el.classList.toggle('has-val', c.val!==0);
      el.classList.toggle('bad', bad[i] && c.val!==0);
      el.classList.toggle('sel', isSel);
      el.classList.toggle('sel-blue', isSel && selTint==='blue');
      el.classList.toggle('sel-grey', isSel && selTint==='grey');
      el.classList.toggle('peer', peerSet ? (peerSet.has(i) && !isSel) : false);
      el.classList.toggle('hl-cell', hl>0 && c.val===hl && !selection.has(i));
      el.classList.toggle('tech', techCells ? techCells.has(i) : false);
      el.classList.toggle('tech-unit', techUnit ? (techUnit.has(i) && !techCells.has(i)) : false);

      if(c.val){
        valEls[i].textContent = c.val;
      }else{
        valEls[i].textContent = '';
        const spans = noteSpanEls[i];
        for(let n=1;n<=9;n++){
          const s = spans[n-1];
          const inB = c.blue.has(n), inS = c.strike.has(n), inG = c.grey.has(n);
          if(inB || inS || inG){
            s.textContent = n;
            // strike is an additive red slash on top of the colour, so even a blue note can be
            // struck out. Colour: blue stays blue; otherwise grey (dimmed when struck).
            let cls = inS ? (inB ? 'b' : 'dim') : (inB ? 'b' : 'g');
            if(inS) cls += ' struck';
            if(hl>0 && n===hl && !inS) cls += ' hl';   // struck (eliminated) notes never highlight
            s.className = cls;
          } else { s.textContent=''; s.className=''; }
        }
      }
    }

    // statusbar
    $('progress').textContent = filled + ' / 81';
    const conf = $('conflicts');
    conf.hidden = conflictCount===0;
    conf.textContent = conflictCount + (conflictCount===1?' conflict':' conflicts');

    // per-digit "remaining" counts on the pad
    const counts = new Array(10).fill(0);
    for(const c of cells) if(c.val) counts[c.val]++;
    for(let n=1;n<=9;n++){
      const left = 9 - counts[n];
      numEls[n-1].querySelector('.left').textContent = left>0 ? left : '✓';
      numEls[n-1].classList.toggle('done', left<=0);
    }
  }

  /* ---------- selection ---------- */
  // Tie the match-highlight to the selection: a single selected cell lights up its own
  // digit; any other selection state clears the highlight. This keeps clicking a new cell
  // from leaving a stale highlight stuck on the previous number.
  function syncHighlight(){ highlightNum = (selection.size===1) ? (cells[anchor].val || 0) : 0; }
  function selectOnly(i){ selection.clear(); selection.add(i); anchor=i; syncHighlight(); render(); }
  function addToSelection(i){ if(!selection.has(i)){ selection.add(i); anchor=i; syncHighlight(); render(); } }
  function clearSelection(){ selection.clear(); anchor=-1; syncHighlight(); render(); }
  // remove one cell from a multi-selection, leaving the rest (the count rules re-apply)
  function deselectCell(i){
    if(!selection.has(i)) return;
    selection.delete(i);
    if(anchor===i){ const rest=[...selection]; anchor = rest.length ? rest[rest.length-1] : -1; }
    syncHighlight(); render();
  }

  let dragging=false, dragMoved=false, downIdx=-1, downWasSelected=false;
  function cellFromPoint(x,y){
    const el = document.elementFromPoint(x,y);
    const cell = el && el.closest && el.closest('.cell');
    return cell ? +cell.dataset.i : -1;
  }
  boardEl.addEventListener('pointerdown', e=>{
    if(paused||solved) return;
    const cellEl = e.target.closest('.cell'); if(!cellEl) return;
    e.preventDefault();
    const idx = +cellEl.dataset.i;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    downIdx = idx; downWasSelected = selection.has(idx); dragMoved = false; dragging = true;
    // Pressing an already-selected ("coloured") cell doesn't change the selection yet: a plain
    // tap will un-select just that cell on release (the rest stay), while a drag from it extends.
    if(!downWasSelected){ if(additive){ addToSelection(idx); } else { selectOnly(idx); } }
    try{ boardEl.setPointerCapture(e.pointerId); }catch(_){}
  });
  boardEl.addEventListener('pointermove', e=>{
    if(!dragging) return;
    const idx = cellFromPoint(e.clientX, e.clientY);
    if(idx<0 || selection.has(idx)) return;
    if(cells[idx].val) return;            // a drag selects empty cells only — never a big-number cell
    // if the drag began on a lone big-number cell, drop it as soon as we reach an empty one
    if(!dragMoved && selection.size===1 && anchor>=0 && cells[anchor].val) selection.clear();
    dragMoved = true;
    addToSelection(idx);
  });
  function endDrag(e){
    // a tap (no drag) on an already-selected cell un-selects it, keeping the rest of the group
    if(dragging && !dragMoved && downWasSelected) deselectCell(downIdx);
    dragging=false;
    try{ boardEl.releasePointerCapture(e.pointerId); }catch(_){}
  }
  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', endDrag);

  /* ---------- entering digits & notes ---------- */
  function editableTargets(){ return [...selection].filter(i => !cells[i].given); }
  function typableTargets(){ return [...selection].filter(i => !cells[i].given && cells[i].val===0); }
  function setHighlight(n){ highlightNum = n; render(); }

  const NOTE_LAYERS = ['grey','blue','strike'];

  function pressNumber(n){
    if(paused || solved) return;
    clearTech();                         // a fresh action supersedes any technique hint
    const typable = typableTargets();    // empty, editable cells in the selection

    // Nothing to type into (empty selection, or only givens / filled cells) → use the
    // number as a highlighter: light up every cell and note holding this digit.
    if(!typable.length){ setHighlight(highlightNum===n ? 0 : n); return; }

    // In green/Digit mode the selection count chooses the action (mirrors the selection tint):
    // a single cell places a number, exactly 2 writes a blue note, 3+ writes a grey note.
    let act = mode;
    if(mode==='digit'){
      if(selection.size===2) act='blue';
      else if(selection.size>2) act='grey';
    }

    if(act==='digit'){
      snapshot();
      for(const i of typable){ cells[i].val=n; cells[i].grey.clear(); cells[i].blue.clear(); cells[i].strike.clear(); }
      // Cascade: each placed value clears that digit from the notes of every cell it sees, and
      // within ITS 3×3 box any cell whittled down to a single option is auto-completed — which
      // can in turn force more cells. The auto-fill is deliberately box-local; the note cleanup
      // still spans the full row/column/box so the rest of the board stays consistent.
      const removed = [];        // {cell,digit} peer notes cleared along the way (for the red flash)
      const autoFilled = [];     // cells the cascade completed (for the pop animation)
      const queue = [...typable];
      let guard = 0;
      while(queue.length && guard++ < 200){
        const c = queue.shift(), v = cells[c].val;
        for(const j of PEERS[c]){                          // full-peer note cleanup
          if(cells[j].val) continue;
          for(const L of NOTE_LAYERS){ if(cells[j][L].delete(v)) removed.push({cell:j, digit:v}); }
        }
        for(const d of BOXES[boxOf(c)]){                   // single-option auto-fill, box only
          if(cells[d].val) continue;
          const opts = cellOptions(d);
          if(opts.length!==1) continue;
          const fv = opts[0];
          if(PEERS[d].some(j => cells[j].val===fv)) continue;   // never auto-fill into a conflict
          cells[d].val = fv; cells[d].grey.clear(); cells[d].blue.clear(); cells[d].strike.clear();
          autoFilled.push(d); queue.push(d);               // its value may force more cells
        }
      }
      highlightNum = n;                   // the number you placed lights up across the board
      render();
      flashRemovedNotes(removed);
      animateAutoFills(autoFilled);
    }else{
      // Notes land only in empty cells, and never where a placed number already rules the
      // digit out. Toggle across the selection: if every target already has it, remove from
      // all; otherwise add it to every cell where the digit is still possible.
      const layer = act;   // 'grey' | 'blue' | 'strike'
      const possible = i => !PEERS[i].some(j => cells[j].val===n);
      const allHave = typable.every(i => cells[i][layer].has(n));
      if(allHave){
        snapshot();
        for(const i of typable) cells[i][layer].delete(n);
      }else{
        const addable = typable.filter(possible);
        if(!addable.length) return;     // nowhere it's possible → ignore the press
        snapshot();
        for(const i of addable) cells[i][layer].add(n);
      }
      // grey/blue notes light up that number across the board, like a placed digit;
      // a struck note is an elimination, so it doesn't.
      highlightNum = (layer==='strike') ? 0 : n;
      render();
    }
    checkSolved();
  }

  // A cell's candidate "options" = its grey notes that haven't been struck out.
  function cellOptions(d){ const o=[]; for(const x of cells[d].grey) if(!cells[d].strike.has(x)) o.push(x); return o; }

  // Briefly re-show just-removed notes (red, fading out) so the player sees them go.
  function flashRemovedNotes(list){
    if(reduceMotion || !list.length) return;
    for(const {cell:j, digit} of list){
      if(cells[j].val) continue;                  // cell was auto-filled later in the cascade
      const span = noteSpanEls[j][digit-1];
      span.textContent = digit; span.className = 'flash';
      const done = ()=>{
        span.removeEventListener('animationend', done);
        if(!cells[j].grey.has(digit) && !cells[j].blue.has(digit) && !cells[j].strike.has(digit)){
          span.textContent=''; span.className='';
        }
      };
      span.addEventListener('animationend', done);
    }
  }

  // Pop each auto-completed cell in, staggered by --ad, so a cascade reads in sequence.
  function animateAutoFills(list){
    if(reduceMotion || !list.length) return;
    list.forEach((d,k)=>{
      const el = cellEls[d];
      el.style.setProperty('--ad', (k*100)+'ms');
      el.classList.add('just-auto');
      const done = ()=>{ el.removeEventListener('animationend', done); el.classList.remove('just-auto'); el.style.removeProperty('--ad'); };
      el.addEventListener('animationend', done);
    });
  }

  function eraseSelected(){
    if(paused || solved) return;
    clearTech();
    const targets = editableTargets().filter(i => cells[i].val || cells[i].grey.size || cells[i].blue.size || cells[i].strike.size);
    if(!targets.length) return;
    snapshot();
    for(const i of targets){ cells[i].val=0; cells[i].grey.clear(); cells[i].blue.clear(); cells[i].strike.clear(); }
    highlightNum = 0;
    render();
  }

  // Fill every empty cell's GREY notes with its valid candidates (leaves blue & struck notes alone).
  function autoNote(){
    if(paused || solved) return;
    clearTech();
    snapshot();
    for(let i=0;i<81;i++){
      if(cells[i].val) continue;
      const used = new Set();
      for(const j of PEERS[i]) if(cells[j].val) used.add(cells[j].val);
      const g = new Set();
      for(let n=1;n<=9;n++) if(!used.has(n)) g.add(n);
      cells[i].grey = g;
    }
    highlightNum = 0;
    render();
  }

  /* ============================================================
     Solving techniques.
     Each technique's search lives in its own techniques/<id>.js file
     (loaded before this script) and registers itself on the global
     SudokuTechniques list. Here we just hand it the board and show
     the first example it finds — see techniques/README.md.
     ============================================================ */
  const TECHNIQUES = (window.SudokuTechniques || []).slice().sort((a,b)=>(a.order||99)-(b.order||99));

  // Build the read-only board model a technique searches: values + basic candidates + units.
  function buildTechCtx(){
    const values = cells.map(c=>c.val);
    const candidates = [];
    for(let i=0;i<81;i++){
      if(values[i]){ candidates.push(new Set()); continue; }
      const used = new Set();
      for(const j of PEERS[i]) if(values[j]) used.add(values[j]);
      const cand = new Set();
      for(let n=1;n<=9;n++) if(!used.has(n)) cand.add(n);
      candidates.push(cand);
    }
    const units = [];
    for(let r=0;r<9;r++) units.push({type:'row', index:r, cells:ROWS[r],  name:'row '+(r+1)});
    for(let c=0;c<9;c++) units.push({type:'col', index:c, cells:COLS[c],  name:'column '+(c+1)});
    for(let b=0;b<9;b++) units.push({type:'box', index:b, cells:BOXES[b], name:'box '+(b+1)});
    return { values, candidates, units, peers:PEERS, rowOf, colOf, boxOf,
             cellName:i=>'R'+(rowOf(i)+1)+'C'+(colOf(i)+1) };
  }

  function runTechnique(tech){
    closeTechMenu();
    if(paused || solved) return;
    let res = null;
    try{ res = tech.find(buildTechCtx()); }catch(e){ res = null; }
    techResult = res || null;
    clearSelection();              // move the player's own selection out of the way
    showTechPanel(tech, res);
    render();                      // paint the violet highlight
  }

  function showTechPanel(tech, res){
    const panel = $('techPanel');
    panel.hidden = false;
    panel.classList.toggle('empty', !res);
    // flip the card to the top of the board when the finding sits in the bottom rows,
    // so it never hides the very cells it's pointing at
    const rows = (res ? res.cells : []).map(i => (i/9)|0);
    panel.classList.toggle('at-top', rows.some(r=>r>=7) && !rows.some(r=>r<=1));
    if(!res){
      $('tpTitle').textContent = 'No ' + tech.name;
      $('tpText').textContent  = 'There’s no ' + tech.name + ' in the current position. Fill in a few more cells (or try another technique) and look again.';
    }else{
      $('tpTitle').textContent = res.title || tech.name;
      $('tpText').textContent  = res.explanation || '';
    }
  }
  function clearTech(){ techResult = null; $('techPanel').hidden = true; }

  /* ---------- techniques menu (popover) ---------- */
  function buildTechMenu(){
    const menu = $('techMenu'); menu.innerHTML = '';
    if(!TECHNIQUES.length){ $('techBtn').disabled = true; $('techBtn').title = 'No techniques loaded'; return; }
    TECHNIQUES.forEach((t,k)=>{
      const b = document.createElement('button');
      b.className = 'tech-item'; b.setAttribute('role','menuitem');
      const name = document.createElement('span'); name.className = 'ti-name';
      const num = document.createElement('span'); num.className = 'ti-num'; num.textContent = k+1;
      name.appendChild(num); name.appendChild(document.createTextNode(t.name));
      const sum = document.createElement('span'); sum.className = 'ti-sum'; sum.textContent = t.summary || '';
      b.appendChild(name); b.appendChild(sum);
      b.addEventListener('click', ()=>runTechnique(t));
      menu.appendChild(b);
    });
  }
  function openTechMenu(){ if(!TECHNIQUES.length) return; $('techMenu').hidden=false; $('techBtn').setAttribute('aria-expanded','true'); }
  function closeTechMenu(){ $('techMenu').hidden=true; $('techBtn').setAttribute('aria-expanded','false'); }

  /* ---------- win check (board full and free of conflicts) ---------- */
  function checkSolved(){
    for(const c of cells) if(!c.val) return;
    const bad = computeConflicts();
    if(bad.some(Boolean)) return;
    solved = true; stopTimer();
    setCover('solved');
  }

  /* ---------- mode switching ---------- */
  function setMode(m){
    mode = m;
    document.querySelectorAll('#modes .mode').forEach(b=>b.classList.toggle('active', b.dataset.mode===m));
    const pad = $('pad');
    pad.classList.toggle('m-grey', m==='grey');
    pad.classList.toggle('m-blue', m==='blue');
    pad.classList.toggle('m-strike', m==='strike');
    render();   // the Digit-mode selection tint depends on the active mode
  }
  $('modes').addEventListener('click', e=>{ const b=e.target.closest('.mode'); if(b) setMode(b.dataset.mode); });

  /* ============================================================
     Timer — counts up from 00:00, anchored to performance.now()
     so it never drifts. Pausing drops a frosted cover over the
     board so nobody can peek while the clock is stopped.
     ============================================================ */
  const timer = { elapsed:0, running:false, startAt:0 };
  let tickIv = null;
  const now = () => performance.now();
  function fmt(ms){
    const s = Math.floor(ms/1000);
    const h = (s/3600)|0, m = ((s%3600)/60)|0, sec = s%60;
    const p = x => String(x).padStart(2,'0');
    return h>0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
  }
  function renderTime(){ $('tval').textContent = fmt(timer.elapsed); }
  function tick(){ if(timer.running){ timer.elapsed = now() - timer.startAt; renderTime(); } }
  function startTimer(){
    if(timer.running || solved) return;
    timer.startAt = now() - timer.elapsed; timer.running = true;
    if(!tickIv) tickIv = setInterval(tick, 250);
    $('timer').classList.remove('paused');
    syncPauseBtn();
  }
  function stopTimer(){
    if(timer.running){ timer.elapsed = now() - timer.startAt; timer.running = false; }
    syncPauseBtn();
  }
  function resetTimer(){ timer.elapsed=0; timer.running=false; renderTime(); syncPauseBtn(); }
  function pauseGame(){
    if(solved) return;
    stopTimer(); paused = true;
    $('timer').classList.add('paused');
    setCover('pause');
    syncPauseBtn();
  }
  function resumeGame(){
    paused = false;
    $('timer').classList.remove('paused');
    setCover('none');
    startTimer();
    syncPauseBtn();
  }
  function togglePause(){ if(solved) return; paused ? resumeGame() : pauseGame(); }
  function syncPauseBtn(){
    const b = $('pauseBtn');
    b.classList.toggle('on', paused);
    b.innerHTML = paused ? '▶ <span class="desk">Resume</span>' : '⏸ <span class="desk">Pause</span>';
    b.title = paused ? 'Resume (P)' : 'Pause (P)';
  }
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden && timer.running && !solved) pauseGame(); });

  /* ---------- the pause / solved cover ---------- */
  function setCover(type){
    const cover = $('cover');
    cover.className = 'cover';
    if(type==='none'){ cover.innerHTML=''; return; }
    if(type==='pause'){
      cover.classList.add('show','pause');
      cover.innerHTML = `<div class="card">
        <div class="big"><span class="em">⏸</span> Paused</div>
        <div class="sub">The board is hidden. Tap to keep playing.</div>
        <div class="row"><button class="btn primary" id="resumeBtn"><span class="ic">▶</span>Resume</button></div>
      </div>`;
      cover.addEventListener('click', resumeOnCover);
      $('resumeBtn').addEventListener('click', e=>{ e.stopPropagation(); resumeGame(); });
    }else if(type==='solved'){
      cover.classList.add('show','solved');
      cover.innerHTML = `<div class="card">
        <div class="big"><span class="em">✓</span> Solved!</div>
        <div class="sub">${puzzle.diff[0].toUpperCase()+puzzle.diff.slice(1)} ${puzzle.id} · finished in <b>${fmt(timer.elapsed)}</b></div>
        <div class="row">
          <button class="btn primary" id="againBtn"><span class="ic">＋</span>New puzzle</button>
          <button class="btn" id="restart2Btn"><span class="ic">↺</span>Replay</button>
        </div>
      </div>`;
      $('againBtn').addEventListener('click', newPuzzle);
      $('restart2Btn').addEventListener('click', restart);
    }
  }
  function resumeOnCover(){ resumeGame(); }

  /* ---------- pickers / buttons ---------- */
  function syncPicker(){
    const sel = $('picker');
    if(!sel.options.length){
      // group by difficulty (easy → hard) for an easy "library" browse
      ['moderate','hard','expert','evil','diabolic'].forEach(diff=>{
        const og = document.createElement('optgroup');
        og.label = diff[0].toUpperCase()+diff.slice(1);
        PUZZLES.forEach((p,idx)=>{ if(p.diff===diff){
          const o=document.createElement('option'); o.value=idx;
          o.textContent = `${p.id} · ${diff}`; og.appendChild(o);
        }});
        sel.appendChild(og);
      });
    }
    sel.value = PUZZLES.indexOf(puzzle);
    // status badge
    const badge = $('puzBadge');
    badge.textContent = puzzle.diff;
    badge.className = 'badge ' + puzzle.diff;
    $('puzId').textContent = puzzle.id;
  }
  $('picker').addEventListener('change', e=>{ loadPuzzle(PUZZLES[+e.target.value]); });
  $('diffSeg').addEventListener('click', e=>{
    const b = e.target.closest('button[data-diff]'); if(!b) return;
    diffFilter = b.dataset.diff;
    document.querySelectorAll('#diffSeg button').forEach(x=>x.classList.toggle('active', x===b));
  });
  $('newBtn').addEventListener('click', newPuzzle);
  $('restartBtn').addEventListener('click', restart);
  $('eraseBtn').addEventListener('click', eraseSelected);
  $('undoBtn').addEventListener('click', undo);
  $('autoNoteBtn').addEventListener('click', autoNote);
  $('pauseBtn').addEventListener('click', togglePause);

  /* ---------- techniques menu wiring ---------- */
  buildTechMenu();
  $('techBtn').addEventListener('click', e=>{ e.stopPropagation(); $('techMenu').hidden ? openTechMenu() : closeTechMenu(); });
  $('tpClose').addEventListener('click', ()=>{ clearTech(); render(); });
  document.addEventListener('click', e=>{ if(!e.target.closest('.tech-wrap')) closeTechMenu(); });

  /* ---------- view options: hide red strikes · fade grey notes (pure CSS, no re-render) ---------- */
  $('struckBtn').addEventListener('click', ()=>{
    const showing = $('struckBtn').classList.toggle('on');
    boardEl.classList.toggle('hide-struck', !showing);
    $('struckBtn').textContent = showing ? 'Shown' : 'Hidden';
    $('struckBtn').setAttribute('aria-pressed', showing ? 'true' : 'false');
  });
  $('greySlider').addEventListener('input', e=>{
    boardEl.style.setProperty('--grey-op', (e.target.value/100).toFixed(2));
  });

  /* ---------- full screen ---------- */
  const fsBtn = $('fsBtn');
  function fsActive(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function toggleFs(){
    if(fsActive()){ (document.exitFullscreen||document.webkitExitFullscreen).call(document); }
    else { const el=document.documentElement; (el.requestFullscreen||el.webkitRequestFullscreen).call(el); }
  }
  function syncFs(){
    const on=fsActive();
    fsBtn.setAttribute('aria-pressed', on?'true':'false');
    const lab=fsBtn.querySelector('.fs-label'); if(lab) lab.textContent = on?'Exit full screen':'Full screen';
  }
  fsBtn.addEventListener('click', toggleFs);
  document.addEventListener('fullscreenchange', syncFs);
  document.addEventListener('webkitfullscreenchange', syncFs);

  /* ---------- keyboard (mirrors the on-screen controls, handy for testing) ---------- */
  function moveAnchor(dr,dc){
    let i = anchor<0 ? 40 : anchor;
    let r = Math.min(8, Math.max(0, rowOf(i)+dr));
    let c = Math.min(8, Math.max(0, colOf(i)+dc));
    selectOnly(r*9+c);
  }
  document.addEventListener('keydown', e=>{
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if(/INPUT|SELECT|TEXTAREA/.test(tag)) return;
    if(e.key==='p'||e.key==='P'){ togglePause(); return; }
    if(e.key==='f'||e.key==='F'){ toggleFs(); return; }
    if((e.ctrlKey||e.metaKey) && (e.key==='z'||e.key==='Z')){ e.preventDefault(); undo(); return; }
    if(paused||solved) return;
    if(e.key>='1' && e.key<='9'){ pressNumber(+e.key); return; }
    if(e.key==='Backspace'||e.key==='Delete'||e.key==='0'){ e.preventDefault(); eraseSelected(); return; }
    if(e.key==='d'||e.key==='D'){ setMode('digit'); return; }
    if(e.key==='g'||e.key==='G'){ setMode('grey'); return; }
    if(e.key==='b'||e.key==='B'){ setMode('blue'); return; }
    if(e.key==='s'||e.key==='S'){ setMode('strike'); return; }
    if(e.key==='a'||e.key==='A'){ autoNote(); return; }
    if(e.key==='ArrowUp'){ e.preventDefault(); moveAnchor(-1,0); }
    else if(e.key==='ArrowDown'){ e.preventDefault(); moveAnchor(1,0); }
    else if(e.key==='ArrowLeft'){ e.preventDefault(); moveAnchor(0,-1); }
    else if(e.key==='ArrowRight'){ e.preventDefault(); moveAnchor(0,1); }
    else if(e.key==='Escape'){ closeTechMenu(); if(techResult){ clearTech(); } clearSelection(); }
  });

  /* ---------- go ---------- */
  setMode('digit');
  loadPuzzle(PUZZLES[(Math.random()*PUZZLES.length)|0]);
})();
