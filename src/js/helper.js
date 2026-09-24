/* ==================================================================
   係の画面。当日の「だれが・何を出したか」の表だけを出す。

   ■ 左右2分割：左に 1〜18 番、右に 19 番から
   ■ マスをタップするたびに  空白 → ○ → 休 → 忘 → △ → 空白
   ■ 免除のマスは ○ と同じ見た目（理由は係に見せない）。タップしても変わらない
   ■ タップした記録は、まずこの端末に貯めてからサーバへ送る。
     つながらなくても印は消えず、つながったときにまとめて送る。
   ■ 係の画面が使えるのは 8:00〜14:00（日本時間）。その外は「閉室中」。
     端末の時計で決めるので、オフラインでも 14:00 になれば閉じる。
     （教職員のアカウント＝先生には関門なし）
================================================================== */
var MARK = {
  on:     {ch:"○", label:"出した"},
  rest:   {ch:"休", label:"休み"},
  forgot: {ch:"忘", label:"わすれた"},
  doing:  {ch:"△", label:"やっている"},
  "":     {ch:"",  label:"まだ"}
};
/* ○ と △ は字だと線が細いので、太い線の図形で描く */
var MARK_SVG = {
  on:    '<svg class="gm" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="3.4"/></svg>',
  doing: '<svg class="gm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6L21 19.6H3z" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round"/></svg>'
};
function markGlyph(s){ return MARK_SVG[s] || esc(MARK[s || ""].ch); }

var Helper = (function(){
  var SPLIT = 18;
  var QKEY = "homework-scan/queue-v1", DKEY = "homework-scan/device";
  var S = null;          /* サーバから来た当日の状態 */
  var queue = loadQueue();
  var online = true, busy = false, reqNo = 0, applied = 0, timer = null, backoff = 0;
  var root = null, active = false, n = 0, opts = {};
  var gateT = null, closedServer = false;

  /* 開いているか＝係の役でなければ常に開放。係なら端末の時計（日本時間）で判断 */
  function openNow(){ return !!opts.staff || Domain.openAt(Date.now()); }
  function closedNow(){ return !openNow() || closedServer; }
  /* 次に開閉が切りかわる時刻（端末の時計の ms で返す） */
  function nextBoundary(){
    var p = Domain.jstParts(Date.now());
    var today0 = Date.now() - (p.h * 3600 + p.mi * 60 + p.s) * 1000;
    var m = p.h * 60 + p.mi + p.s / 60;
    if(m < Domain.OPEN.from) return today0 + Domain.OPEN.from * 60000;   /* けさの 8:00 */
    if(m < Domain.OPEN.to)   return today0 + Domain.OPEN.to * 60000;     /* きょうの 14:00 */
    return today0 + 86400000 + Domain.OPEN.from * 60000;                 /* あすの 8:00 */
  }
  /* 境目で閉じる・開ける。14:00 では、たまっている分を先に送ってから閉室中にする */
  function gate(){
    clearTimeout(gateT);
    if(!active || opts.staff) return;
    var wait = Math.max(500, nextBoundary() - Date.now());
    gateT = setTimeout(function(){
      closedServer = false;
      if(openNow()) kick();
      else { sync().then(render, render); }   /* 14:00 → 残りを送ってから閉じる */
      render();
      gate();
    }, Math.min(wait, 86400000));
  }

  function device(){
    try{
      var d = localStorage.getItem(DKEY);
      if(!d){ d = Math.random().toString(36).slice(2, 8); localStorage.setItem(DKEY, d); }
      return d;
    }catch(e){ return "nolocal"; }
  }
  function loadQueue(){ try{ return JSON.parse(localStorage.getItem(QKEY) || "[]"); }catch(e){ return []; } }
  function saveQueue(){ try{ localStorage.setItem(QKEY, JSON.stringify(queue)); }catch(e){} }

  /* サーバの状態に、まだ送っていない分を重ねたもの */
  function view(){
    var cells = {};
    Object.keys(S.cells).forEach(function(k){ cells[k] = S.cells[k]; });
    queue.forEach(function(e){
      if(e.date !== S.date) return;
      var k = e.no + ":" + e.slot;
      if(e.op === "off") delete cells[k]; else cells[k] = e.op;
    });
    return cells;
  }

  /* 返ってきた順ではなく、頼んだ順で新しいものだけを使う */
  function request(name, args){
    var my = ++reqNo;
    return call.apply(null, [name].concat(args || [])).then(function(r){
      online = true; backoff = 0;
      if(r && r.closed) closedServer = true;
      var st = r && r.state ? r.state : r;
      if(r && r.processed){
        var p = {}; r.processed.forEach(function(id){ p[id] = true; });
        queue = queue.filter(function(e){ return !p[e.id]; });
        saveQueue();
      }
      if(my > applied){ applied = my; S = st; }
      render();
      return r;
    }, function(err){
      online = false;
      backoff = Math.min(30000, backoff ? backoff * 2 : 4000);
      render();
      throw err;
    });
  }

  function sync(){
    if(busy) return Promise.resolve();
    busy = true;
    var p = queue.length ? request("apiMark", [queue.slice(0, 200), Date.now()]) : request("apiToday");
    return p.then(function(){ busy = false; if(queue.length) return sync(); },
                  function(){ busy = false; });
  }
  function schedule(){
    clearTimeout(timer);
    if(!active || closedNow()) return;   /* 閉室中はサーバを呼ばない */
    timer = setTimeout(function(){ sync().then(schedule, schedule); }, backoff || (queue.length ? 1500 : 15000));
  }
  function kick(){ sync().then(schedule, schedule); }

  function mark(no, slot, state){
    queue.push({id: device() + "-" + Date.now().toString(36) + "-" + (++n), date:S.date, no:no, slot:slot,
                op: state || "off", at:Date.now(), via:"tap", dev:device()});
    saveQueue();
    paintCell(no + ":" + slot, state);
    paintSummary();
    kick();
  }

  function onTap(e){
    var c = e.target.closest(".cell[data-k]");
    if(!c) return;
    var k = c.getAttribute("data-k"), p = k.split(":");
    if(S.excused[k]){ Sound.no(); flash(c); return; }
    var next = Domain.nextState(view()[k] || "");
    if(next === "on") Sound.ok(); else if(next === "") Sound.undo(); else Sound.tick();
    mark(Number(p[0]), Number(p[1]), next);
  }

  function cellInner(state){
    return '<span class="g" aria-hidden="true">' + markGlyph(state) + '</span>';
  }
  /* 品目の列の色。空白と △ のマスは列色のまま、○・休・忘 は状態の色を優先する */
  function tintCls(it, s){ return it.color && (s === "" || s === "doing") ? " t-" + it.color : ""; }
  function cellHtml(no, it, state, excused){
    var s = excused ? "on" : (state || "");
    return '<button class="cell s-' + (s || "none") + tintCls(it, s) + '" data-k="' + no + ':' + it.slot + '" '
         + 'aria-label="' + no + 'ばん ' + esc(it.name) + ' ' + MARK[s].label + '">' + cellInner(s) + '</button>';
  }
  function paintCell(k, state){
    var c = root && root.querySelector('.cell[data-k="' + k + '"]');
    if(!c) return render();
    var p = k.split(":"), it = itemOf(Number(p[1]));
    var s = state || "";
    c.className = "cell s-" + (s || "none") + tintCls(it, s);
    c.setAttribute("aria-label", p[0] + "ばん " + it.name + " " + MARK[s].label);
    c.innerHTML = cellInner(s);
    flash(c);
  }
  function flash(c){ c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); }

  function itemOf(slot){ return S.items.filter(function(i){ return i.slot === slot; })[0]; }

  function summaryHtml(){
    var cells = view();
    return S.items.map(function(it){
      var left = 0, forgot = 0, doing = 0;
      S.roster.forEach(function(r){
        var k = r.no + ":" + it.slot;
        if(S.excused[k]) return;
        if(!cells[k]) left++;
        else if(cells[k] === "forgot") forgot++;
        else if(cells[k] === "doing") doing++;
      });
      var f = (forgot ? '<span class="fg">忘 ' + forgot + '</span>' : '')
            + (doing ? '<span class="dg">' + MARK_SVG.doing + doing + '</span>' : '');
      return left
        ? '<div class="chip' + (it.color ? " t-" + it.color : "") + '">' + icon(it.icon) + esc(it.name) + '<span class="left">まだ ' + left + '人</span>' + f + '</div>'
        : '<div class="chip all">' + icon(it.icon) + esc(it.name) + icon("check") + 'ぜんいん チェック' + f + '</div>';
    }).join("");
  }
  function paintSummary(){ var s = root && root.querySelector(".sum"); if(s) s.innerHTML = summaryHtml(); }

  function paneHtml(list, rows, cols, cells, named){
    var h = '<div class="pane" style="--cols:' + cols + ';--rows:' + (rows + 1) + ';grid-template-rows:auto repeat(' + rows + ',minmax(0,1fr))">';
    h += '<div class="row head"><div>' + (named ? 'ばん・なまえ' : 'ばん') + '</div>'
       + S.items.map(function(it){ return '<div class="' + (it.color ? "t-" + it.color : "") + '">' + icon(it.icon) + '<span>' + esc(it.name) + '</span></div>'; }).join("")
       + '</div>';
    for(var i = 0; i < rows; i++){
      var st = list[i];
      if(!st){
        h += '<div class="row empty"><div class="who"></div>'
           + S.items.map(function(it){ return '<div class="cell' + (it.color ? " t-" + it.color : "") + '"></div>'; }).join("") + '</div>';
        continue;
      }
      h += '<div class="row"><div class="who"><span class="no">' + st.no + '</span>'
         + (st.name ? '<span class="nm">' + esc(st.name) + '</span>' : '') + '</div>'
         + S.items.map(function(it){
             var k = st.no + ":" + it.slot;
             return cellHtml(st.no, it, cells[k], !!S.excused[k]);
           }).join("") + '</div>';
    }
    return h + '</div>';
  }

  function legend(){
    return '<div class="legend" aria-hidden="true">タップで かわる：'
      + ["", "on", "rest", "forgot", "doing", ""].map(function(s){
          return '<span class="lg s-' + (s || "none") + '">' + (markGlyph(s) || "　") + '</span>';
        }).join('<span class="arr">→</span>') + '</div>';
  }

  function closedHtml(){
    var before = Domain.jstParts(Date.now()).h * 60 + Domain.jstParts(Date.now()).mi < Domain.OPEN.from;
    return '<div class="helper"><div class="closed"><div class="mark">閉室中</div>'
      + '<p class="msg">' + (before ? 'あけるのは 8:00 からです' : 'きょうの うけつけは おわりました') + '</p>'
      + '<p class="sub">つかえるのは 8:00〜14:00</p></div></div>';
  }
  function render(){
    if(!root || !active) return;
    if(closedNow()){ root.innerHTML = closedHtml(); return; }
    if(!S){ root.innerHTML = '<div class="helper"><div class="none">' + icon("sync") + 'よみこみ中…</div></div>'; return; }
    var cells = view();
    var net = online
      ? '<div class="net" title="保存できています">' + icon("cloud") + '<span class="sr">保存できています</span></div>'
      : '<div class="net off" role="status">' + icon("cloudOff") + 'つながっていません（しるしは この PC に のこっています）</div>';
    var head = '<div class="hbar"><div class="date">' + esc(dateLabel(S.date, S.wd)) + '</div>'
      + '<div class="title">' + icon("check") + 'しゅくだい チェック</div><div class="grow"></div>'
      + (S.roster.length && S.items.length ? legend() : '') + net
      + (opts.staff ? '<button class="btn tbtn" data-act="teacher">' + icon("gear") + '先生の画面</button>' : '') + '</div>';

    var body;
    if(!S.roster.length){
      body = '<div class="none">' + icon("users") + '名簿が まだ ありません<p>先生の画面で 名簿を 入れてください</p></div>';
    }else if(!S.items.length){
      body = '<div class="none">' + icon("star") + 'きょうは 提出物が ありません</div>';
    }else{
      var L = S.roster.filter(function(r){ return r.no <= SPLIT; });
      var R = S.roster.filter(function(r){ return r.no > SPLIT; });
      var rows = Math.max(SPLIT, L.length, R.length);
      var named = S.roster.some(function(r){ return r.name; });
      var cols = (named ? "minmax(0,2.2fr)" : "minmax(0,.8fr)") + " repeat(" + S.items.length + ",minmax(0,1fr))";
      body = '<div class="sumbar"><div class="sum">' + summaryHtml() + '</div></div>'
           + '<div class="panes">' + paneHtml(L, rows, cols, cells, named) + paneHtml(R, rows, cols, cells, named) + '</div>';
    }
    root.innerHTML = '<div class="helper">' + head + body + '</div>';
  }

  function mount(el, o){ root = el; opts = o || {}; active = true; closedServer = false; render(); kick(); gate(); }
  function unmount(){ active = false; clearTimeout(timer); clearTimeout(gateT); }

  document.addEventListener("click", function(e){
    if(!active || !root || !root.contains(e.target)) return;
    if(e.target.closest("[data-act=teacher]")){ if(opts.openTeacher) opts.openTeacher(); return; }
    onTap(e);
  });
  document.addEventListener("visibilitychange", function(){ if(active && !document.hidden) kick(); });
  window.addEventListener("online", function(){ if(active) kick(); });

  return {mount:mount, unmount:unmount, refresh:kick, pending:function(){ return queue.length; }};
})();
