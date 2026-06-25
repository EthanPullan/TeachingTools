/* ============================================================================
   Tournament mode — canonical, dependency-free single-elimination module.

   CENTRAL SOURCE OF TRUTH. This suite keeps no linked scripts (every tool is a
   self-contained single file — see STYLE_GUIDE §0), so each 2-player game
   INLINES this block verbatim inside its own <script>. When this file changes,
   re-propagate it into every game that uses it (npm-free: see README in this
   folder). The marker comments below delimit the inlined region.

   A game wires it up once, after this has defined window.Tournament:

     Tournament.setup({
       game: 'Super Tic-Tac-Toe',
       sides: [ {name:'Blue', color:'var(--x)'}, {name:'Red', color:'var(--o)'} ],
       button: '#tournamentBtn',                 // toolbar button that opens it
       onMatchStart: function(a, b){ newGame(); } // a→sides[0], b→sides[1]
     });

   When a game ends, the game reports the result (no-ops unless a match is live):

     Tournament.reportWinner(0|1);   // index into `sides` of the winning side
     Tournament.reportDraw();        // replays the current match
============================================================================ */
/* <tournament-module> */
(function(){
  if(window.Tournament) return;

  var cfg = null;        // game config from setup()
  var T   = null;        // active tournament, or null
  var bannerEl = null, overlayEl = null, modalEl = null;
  var pendingCount = 0;  // chosen player count on the setup step

  /* ---------- styles (injected once; reuses each game's design tokens) ---------- */
  var CSS =
  '.tm-banner{display:flex;align-items:center;gap:12px 16px;flex-wrap:wrap;flex:none;'
    +'padding:9px 20px;background:var(--accent-soft);border-bottom:1px solid var(--line);font-size:14px;}'
  +'.tm-banner[hidden]{display:none;}'
  +'.tm-title{font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:12px;'
    +'color:var(--accent-deep);display:inline-flex;align-items:center;gap:6px;white-space:nowrap;}'
  +'.tm-vs{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;font-weight:600;color:var(--ink);}'
  +'.tm-dot{width:12px;height:12px;border-radius:50%;display:inline-block;vertical-align:-1px;'
    +'box-shadow:inset 0 -2px 2px rgba(0,0,0,.28),inset 0 1px 1px rgba(255,255,255,.4);}'
  +'.tm-spacer{flex:1;}'
  +'.tm-btn{border:1px solid var(--line);background:var(--panel);color:var(--ink);padding:7px 13px;'
    +'border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;}'
  +'.tm-btn:hover{background:var(--panel-2);}'
  +'.tm-btn.primary{background:var(--board);border-color:var(--board);color:#fff;}'
  +'.tm-btn.primary:hover{background:var(--board-2);}'
  +'.tm-btn[disabled]{opacity:.45;cursor:not-allowed;}'
  /* overlay + modal */
  +'.tm-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;'
    +'padding:18px;background:rgba(16,27,23,.55);}'
  +'.tm-overlay[hidden]{display:none;}'
  +'.tm-modal{background:var(--panel);color:var(--ink);border-radius:16px;width:min(720px,96vw);'
    +'max-height:92vh;overflow:auto;padding:22px 24px;box-shadow:0 24px 64px rgba(20,40,33,.42);'
    +'font-family:var(--sans);}'
  +'.tm-modal h2{margin:0 0 4px;font-size:21px;}'
  +'.tm-sub{margin:0 0 16px;color:var(--muted);font-size:13.5px;line-height:1.5;}'
  +'.tm-count{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;}'
  +'.tm-count button{min-width:46px;padding:9px 0;border:1px solid var(--line);background:#fff;'
    +'border-radius:9px;cursor:pointer;font-family:var(--mono);font-weight:700;font-size:15px;color:var(--ink);}'
  +'.tm-count button.active{background:var(--board);color:#fff;border-color:var(--board);}'
  +'.tm-names{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin-bottom:6px;}'
  +'.tm-field{display:flex;align-items:center;gap:8px;}'
  +'.tm-field .n{font-family:var(--mono);font-size:11px;color:var(--muted);width:18px;text-align:right;}'
  +'.tm-field input{flex:1;min-width:0;border:1px solid var(--line);border-radius:8px;background:var(--panel-2);'
    +'padding:9px 11px;font-size:14px;font-family:var(--sans);color:var(--ink);}'
  +'.tm-field input:focus{outline:none;border-color:var(--accent);}'
  +'.tm-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px;}'
  /* bracket */
  +'.tm-bracket{display:flex;gap:16px;overflow:auto;padding:4px 2px 8px;}'
  +'.tm-round{display:flex;flex-direction:column;justify-content:space-around;gap:14px;min-width:158px;}'
  +'.tm-round h3{margin:0 0 2px;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;'
    +'color:var(--muted);text-align:center;}'
  +'.tm-match{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--panel-2);}'
  +'.tm-match.current{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft);}'
  +'.tm-slot{display:flex;align-items:center;gap:7px;padding:8px 11px;font-size:13.5px;'
    +'border-bottom:1px solid var(--line);min-height:36px;}'
  +'.tm-slot:last-child{border-bottom:none;}'
  +'.tm-slot.win{background:var(--accent-soft);font-weight:700;}'
  +'.tm-slot.tbd{color:var(--muted);font-style:italic;}'
  +'.tm-slot b{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
  +'.tm-champ{display:flex;align-items:center;justify-content:center;text-align:center;border-radius:10px;'
    +'border:2px solid var(--accent);background:var(--accent-soft);padding:12px;font-weight:800;min-height:48px;}'
  +'.tm-champ.empty{border-style:dashed;border-color:var(--line);background:var(--panel-2);color:var(--muted);font-weight:600;}';

  function injectCSS(){
    if(document.getElementById('tm-css')) return;
    var s=document.createElement('style'); s.id='tm-css'; s.textContent=CSS; document.head.appendChild(s);
  }
  function esc(s){ return String(s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }

  /* ---------- bracket maths (single elimination, 2-8 players) ---------- */
  function nextPow2(n){ var p=1; while(p<n) p*=2; return p; }
  // standard bracket slot order so top seeds meet bottom seeds (and byes spread out)
  function seedSlots(n){ var m=[1,2]; while(m.length<n){ var s=m.length*2+1, x=[]; for(var k=0;k<m.length;k++){ x.push(m[k]); x.push(s-m[k]); } m=x; } return m; }
  function shuffle(a){ for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)), t=a[i]; a[i]=a[j]; a[j]=t; } return a; }

  function build(names){
    var N=names.length, B=nextPow2(N);
    var players=names.map(function(nm,i){ return {id:i, name:nm}; });
    var order=shuffle(players.slice());                 // random seeding
    var seedOf={}; order.forEach(function(p,i){ seedOf[i+1]=p; });
    var seq=seedSlots(B);
    var slots=seq.map(function(seed){ return seedOf[seed] || null; });  // null = bye
    var rounds=[], r0=[];
    for(var i=0;i<B;i+=2) r0.push({a:slots[i], b:slots[i+1], winner:null, round:0});
    rounds.push(r0);
    var size=r0.length, r=1;
    while(size>1){
      var arr=[];
      for(var j=0;j<size;j+=2) arr.push({a:null, b:null, winner:null, round:r, srcA:j, srcB:j+1});
      rounds.push(arr); size=arr.length; r++;
    }
    var st={players:players, rounds:rounds, current:null, awaiting:false, champion:null};
    recompute(st); st.current=findCurrent(st);
    return st;
  }
  function recompute(st){
    var R=st.rounds, r, i, m;
    for(i=0;i<R[0].length;i++){ m=R[0][i]; if(!m.winner){ if(m.a&&!m.b) m.winner=m.a; else if(m.b&&!m.a) m.winner=m.b; } }
    for(r=1;r<R.length;r++) for(i=0;i<R[r].length;i++){ m=R[r][i]; m.a=R[r-1][m.srcA].winner||null; m.b=R[r-1][m.srcB].winner||null; }
  }
  function findCurrent(st){ var R=st.rounds,r,i,m; for(r=0;r<R.length;r++) for(i=0;i<R[r].length;i++){ m=R[r][i]; if(m.a&&m.b&&!m.winner) return m; } return null; }
  function roundName(r,total){ var fe=total-1-r; return fe===0?'Final':fe===1?'Semifinal':fe===2?'Quarterfinal':('Round '+(r+1)); }

  /* ---------- banner ---------- */
  function ensureBanner(){
    if(bannerEl) return;
    var tb=document.querySelector('.toolbar');
    bannerEl=document.createElement('div'); bannerEl.className='tm-banner'; bannerEl.hidden=true;
    if(tb && tb.parentNode) tb.insertAdjacentElement('afterend', bannerEl);
    else document.body.insertBefore(bannerEl, document.body.firstChild);
    bannerEl.addEventListener('click', function(e){
      var b=e.target.closest('[data-act]'); if(!b) return; act(b.getAttribute('data-act'));
    });
  }
  function dot(i){ return '<span class="tm-dot" style="background:'+cfg.sides[i].color+'"></span>'; }
  function matchInline(m){
    return '<span class="tm-vs"><b>'+esc(m.a.name)+'</b>'+dot(0)+cfg.sides[0].name
         +' &nbsp;vs&nbsp; <b>'+esc(m.b.name)+'</b>'+dot(1)+cfg.sides[1].name+'</span>';
  }
  function renderBanner(){
    ensureBanner();
    if(!T){ bannerEl.hidden=true; return; }
    bannerEl.hidden=false;
    var h;
    if(T.champion){
      h='<span class="tm-title">🏆 Champion</span>'
       +'<span class="tm-vs"><b>'+esc(T.champion.name)+'</b>&nbsp;wins the tournament!</span>'
       +'<span class="tm-spacer"></span>'
       +'<button class="tm-btn" data-act="bracket">Bracket</button>'
       +'<button class="tm-btn primary" data-act="new">New tournament</button>'
       +'<button class="tm-btn" data-act="exit">Exit</button>';
    }else if(T.awaiting && T.current){
      h='<span class="tm-title">🏆 '+roundName(T.current.round,T.rounds.length)+'</span>'
       +matchInline(T.current)
       +'<span class="tm-spacer"></span>'
       +'<button class="tm-btn" data-act="bracket">Bracket</button>'
       +'<button class="tm-btn" data-act="exit">Exit</button>';
    }else if(T.current){
      h='<span class="tm-title">🏆 '+roundName(T.current.round,T.rounds.length)+'</span>'
       +'<span class="tm-vs">Next up — '+esc(T.current.a.name)+' vs '+esc(T.current.b.name)+'</span>'
       +'<span class="tm-spacer"></span>'
       +'<button class="tm-btn primary" data-act="play">▶ Play match</button>'
       +'<button class="tm-btn" data-act="bracket">Bracket</button>'
       +'<button class="tm-btn" data-act="exit">Exit</button>';
    }else{ bannerEl.hidden=true; return; }
    bannerEl.innerHTML=h;
  }

  /* ---------- modal ---------- */
  function ensureModal(){
    if(overlayEl) return;
    overlayEl=document.createElement('div'); overlayEl.className='tm-overlay'; overlayEl.hidden=true;
    modalEl=document.createElement('div'); modalEl.className='tm-modal';
    overlayEl.appendChild(modalEl); document.body.appendChild(overlayEl);
    overlayEl.addEventListener('click', function(e){ if(e.target===overlayEl) hideModal(); });
    modalEl.addEventListener('click', function(e){ var b=e.target.closest('[data-act]'); if(b) act(b.getAttribute('data-act'), b); });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape' && !overlayEl.hidden) hideModal(); });
  }
  function showModal(){ ensureModal(); overlayEl.hidden=false; }
  function hideModal(){ if(overlayEl) overlayEl.hidden=true; }

  function setupStep(){
    ensureModal();
    var counts=''; for(var n=2;n<=8;n++) counts+='<button data-act="count" data-n="'+n+'"'+(n===pendingCount?' class="active"':'')+'>'+n+'</button>';
    modalEl.innerHTML=
      '<h2>'+(cfg.game?esc(cfg.game)+' — ':'')+'Tournament</h2>'
     +'<p class="tm-sub">Single elimination with a random bracket. Choose how many players, then enter their names.</p>'
     +'<div class="tm-count">'+counts+'</div>'
     +'<div class="tm-names" id="tmNames"></div>'
     +'<div class="tm-actions"><button class="tm-btn" data-act="close">Cancel</button>'
     +'<button class="tm-btn primary" data-act="start" id="tmStart"'+(pendingCount?'':' disabled')+'>Start tournament</button></div>';
    if(pendingCount) renderNameFields(pendingCount);
    showModal();
  }
  function renderNameFields(n, keep){
    var host=document.getElementById('tmNames'); if(!host) return;
    var prev = keep ? currentNames() : [];
    var html=''; for(var i=0;i<n;i++){ var v=esc(prev[i]!=null?prev[i]:('Player '+(i+1)));
      html+='<div class="tm-field"><span class="n">'+(i+1)+'</span><input type="text" maxlength="18" value="'+v+'" aria-label="Player '+(i+1)+' name"></div>'; }
    host.innerHTML=html;
  }
  function currentNames(){
    return Array.prototype.map.call(modalEl.querySelectorAll('#tmNames input'), function(inp,i){ var v=(inp.value||'').trim(); return v||('Player '+(i+1)); });
  }

  function bracketStep(){
    ensureModal();
    var R=T.rounds, body='<div class="tm-bracket">';
    for(var r=0;r<R.length;r++){
      body+='<div class="tm-round"><h3>'+roundName(r,R.length)+'</h3>';
      for(var i=0;i<R[r].length;i++) body+=matchBox(R[r][i]);
      body+='</div>';
    }
    body+='<div class="tm-round"><h3>Champion</h3>'+(T.champion
            ?'<div class="tm-champ">🏆 '+esc(T.champion.name)+'</div>'
            :'<div class="tm-champ empty">—</div>')+'</div>';
    body+='</div>';
    var actions='<div class="tm-actions">';
    if(T.champion) actions+='<button class="tm-btn primary" data-act="new">New tournament</button>';
    else if(T.current) actions+='<button class="tm-btn primary" data-act="play">▶ Play this match</button>';
    actions+='<button class="tm-btn" data-act="close">Close</button></div>';
    modalEl.innerHTML='<h2>Bracket</h2><p class="tm-sub">'
      +(T.champion?'Tournament complete.':(T.current?'Up next: <b>'+esc(T.current.a.name)+'</b> vs <b>'+esc(T.current.b.name)+'</b>.':''))
      +'</p>'+body+actions;
    showModal();
  }
  function matchBox(m){
    var cls='tm-match'+((m===T.current && !T.champion)?' current':'');
    return '<div class="'+cls+'">'+slot(m,'a',0)+slot(m,'b',1)+'</div>';
  }
  function slot(m,key,side){
    var p=m[key], win=m.winner && p && m.winner.id===p.id;
    if(p===null) return '<div class="tm-slot tbd">'+(m.round===0?'— bye —':'—')+'</div>';
    return '<div class="tm-slot'+(win?' win':'')+'">'+dot(side)+'<b>'+esc(p.name)+'</b></div>';
  }

  /* ---------- flow ---------- */
  function act(a, el){
    if(a==='count'){ var n=el?+el.getAttribute('data-n'):0;
      if(n){ pendingCount=n;
        Array.prototype.forEach.call(modalEl.querySelectorAll('.tm-count button'),function(b){ b.classList.toggle('active', +b.getAttribute('data-n')===n); });
        renderNameFields(n, true); var s=document.getElementById('tmStart'); if(s) s.disabled=false; } return; }
    if(a==='start'){ var names=currentNames(); T=build(names); renderBanner(); bracketStep(); return; }
    if(a==='play'){ if(T && T.current){ startMatch(T.current); } return; }
    if(a==='bracket'){ bracketStep(); return; }
    if(a==='close'){ hideModal(); return; }
    if(a==='new'){ pendingCount=0; setupStep(); return; }
    if(a==='exit'){ if(window.confirm('End the current tournament?')){ T=null; hideModal(); renderBanner(); } return; }
  }
  function startMatch(m){
    T.current=m; T.awaiting=true; hideModal(); renderBanner();
    if(cfg && typeof cfg.onMatchStart==='function') cfg.onMatchStart(m.a, m.b);
  }

  /* ---------- public API ---------- */
  window.Tournament = {
    setup: function(config){
      cfg=config||{}; if(!cfg.sides || cfg.sides.length!==2) throw new Error('Tournament needs exactly 2 sides');
      injectCSS(); ensureBanner();
      if(cfg.button){ var btn=document.querySelector(cfg.button); if(btn) btn.addEventListener('click', function(){ Tournament.open(); btn.blur&&btn.blur(); }); }
    },
    open: function(){ if(!cfg) return; if(T) bracketStep(); else { if(!pendingCount) pendingCount=0; setupStep(); } },
    reportWinner: function(side){
      if(!T || !T.awaiting || !T.current) return;
      var m=T.current; m.winner = side===0 ? m.a : m.b; T.awaiting=false;
      recompute(T); T.current=findCurrent(T);
      if(!T.current) T.champion = T.rounds[T.rounds.length-1][0].winner;
      renderBanner();
      if(overlayEl && !overlayEl.hidden) bracketStep();
    },
    reportDraw: function(){
      if(!T || !T.awaiting || !T.current) return;
      // single elimination needs a decisive game — replay the same match
      if(cfg && typeof cfg.onMatchStart==='function') cfg.onMatchStart(T.current.a, T.current.b);
    },
    active: function(){ return !!T; }
  };
})();
/* </tournament-module> */
