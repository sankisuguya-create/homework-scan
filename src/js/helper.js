/* ==================================================================
   係の画面。当日の「だれが・何を出したか」の表だけを出す。

   ■ 番号順に3列。1列の人数は児童数に応じて自動で増える（36人まで崩れない）
   ■ 名前の枠は「番号 苗字」の1段表示。同じ苗字がいる子は苗字＋名前の一文字目
   ■ マスをタップするたびに  空白 → ○ → 休 → 忘 → △ → 空白
   ■ 免除のマスは ○ と同じ見た目（理由は係に見せない）。タップしても変わらない
   ■ タップした記録は、まずこの端末に貯めてからサーバへ送る。
     つながらなくても印は消えず、つながったときにまとめて送る。
   ■ 係の画面が使えるのは平日の 8:00〜14:00（日本時間）。その外は「閉室中」。
     端末の時計で決めるので、オフラインでも 14:00 になれば閉じる。
     「校内のIP」がせっていに入っていると、校外のネットワークでは開けない
     （端末が自分の外IPを調べて、校内のIPと合うか見る。先生には関門なし）
================================================================== */
/* マスの状態の字と呼び名は Domain.MARKS が正本。
   「まだ」（空白）は画面だけの表示なのでここで足す */
var MARK = (function(){
  var m = {"":{ch:"", label:"まだ"}};
  ["on", "rest", "forgot", "doing"].forEach(function(k){
    m[k] = {ch:Domain.MARKS[k].glyph, label:Domain.MARKS[k].label};
  });
  return m;
})();
/* ○ と △ は字だと線が細いので、太い線の図形で描く */
var MARK_SVG = {
  on:    '<svg class="gm" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="3.4"/></svg>',
  doing: '<svg class="gm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6L21 19.6H3z" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round"/></svg>'
};
function markGlyph(s){ return MARK_SVG[s] || esc(MARK[s || ""].ch); }

var Helper = (function(){
  var QKEY = "homework-scan/queue-v1", DKEY = "homework-scan/device";
  var S = null;          /* サーバから来た当日の状態 */
  var queue = loadQueue();
  var online = true, busy = false, reqNo = 0, applied = 0, timer = null, backoff = 0;
  var root = null, active = false, n = 0, opts = {};
  var gateT = null, closedServer = false;
  var netOk = null, netT = null;
  var NET_PROBE = ["https://api.ipify.org?format=json", "https://icanhazip.com/"];

  /* 開いているか＝係の役でなければ常に開放。係なら端末の時計（日本時間）で判断 */
  function openNow(){ return !!opts.staff || Domain.openAt(Date.now()); }
  function closedNow(){ return !openNow() || closedServer; }
  /* 境目で閉じる・開ける。14:00 では、たまっている分を先に送ってから閉室中にする。
     境目の計算は Domain.nextOpenChange が正本（8:00/14:00/休日の決まりと同じ式） */
  function gate(){
    clearTimeout(gateT);
    if(!active || opts.staff) return;
    var wait = Math.max(500, Domain.nextOpenChange(Date.now()) - Date.now());
    gateT = setTimeout(function(){
      closedServer = false;
      if(openNow()){ kick(); netCheck(); }
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
  /* 休みの子。サーバの absent に、まだ送っていない切替を重ねる（あとの入力が優先） */
  function absView(){
    var m = {};
    (S.absent || []).forEach(function(no){ m[no] = true; });
    queue.forEach(function(e){
      if(e.date !== S.date || typeof e.abs !== "boolean") return;
      if(e.abs) m[e.no] = true; else delete m[e.no];
    });
    return m;
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
      if(netRequired() && netOk === null) netCheck();   /* 「校内のIP」が入っていたら確かめる */
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
    /* 閉室中・校外・画面が見えていない間はサーバを呼ばない。
       見えている画面に戻ったとき visibilitychange → kick で再開する（貯めた分もそこで送る） */
    if(!active || closedNow() || netBlocked() || document.hidden) return;
    timer = setTimeout(function(){ sync().then(schedule, schedule); }, backoff || (queue.length ? 1500 : 15000));
  }
  function kick(){ sync().then(schedule, schedule); }

  /* ── 校内ネットワークの確認（係のみ。「校内のIP」が空なら制限なし） ── */
  function netRequired(){ return !opts.staff && !!(S && S.net); }
  function netBlocked(){ return netRequired() && netOk === false; }
  function probeIp(i){
    return fetch(NET_PROBE[i], {cache:"no-store"}).then(function(r){ return r.text(); }).then(function(t){
      var m = /\d{1,3}(?:\.\d{1,3}){3}/.exec(t);
      if(!m) throw new Error("no ip");
      return m[0];
    });
  }
  function netCheck(){
    if(!active || opts.staff) return;
    clearTimeout(netT);
    if(!netRequired()){ netOk = null; }
    else if(!closedNow()){
      probeIp(0).catch(function(){ return probeIp(1); }).then(function(ip){
        var was = netOk;
        netOk = Domain.ipAllowed(ip, S.net);
        if(netOk === false && was !== false) sync().then(render, render); /* 残りを送ってから閉じる */
        if(netOk === true && was === false) kick();
        render();
      }, function(){
        /* どの窓口にも届かない＝確かめられないので閉じる（切れていても同じ見え方） */
        var was = netOk;
        netOk = false;
        if(was !== false) sync().then(render, render);
        render();
      });
    }
    netT = setTimeout(netCheck, netOk === false ? 45000 : 600000);   /* 外では45秒ごとに確かめ直す */
  }

  function mark(no, slot, state){
    queue.push({id: device() + "-" + Date.now().toString(36) + "-" + (++n), date:S.date, no:no, slot:slot,
                op: state || "off", at:Date.now(), via:"tap", dev:device()});
    saveQueue();
    paintCell(no + ":" + slot, state);
    paintSummary();
    kick();
  }

  /* 名前（番号）のところをタップすると、その子の 休み⇄出席 を切り替える。
     休みにすると提出物は全部「休」判定。出席に戻すと、押されていた印が元どおり見える */
  function tapWho(e){
    var w = e.target.closest(".who[data-abs]");
    if(!w) return;
    var no = Number(w.getAttribute("data-abs"));
    var on = !absView()[no];
    queue.push({id: device() + "-" + Date.now().toString(36) + "-" + (++n), date:S.date, no:no,
                abs:on, at:Date.now(), via:"tap", dev:device()});
    saveQueue();
    if(on) Sound.tick(); else Sound.undo();
    render();
    kick();
  }

  function onTap(e){
    var c = e.target.closest(".cell[data-k]");
    if(!c) return;
    var k = c.getAttribute("data-k"), p = k.split(":");
    if(S.excused[k]){ Sound.no(); flash(c); return; }
    if(absView()[Number(p[0])]){ flash(c); return; }   /* 休みの子のマスは押せない */
    var next = Domain.nextState(view()[k] || "");
    if(next === "on") Sound.ok(); else if(next === "") Sound.undo(); else Sound.tick();
    mark(Number(p[0]), Number(p[1]), next);
  }

  function cellInner(state){
    return '<span class="g" aria-hidden="true">' + markGlyph(state) + '</span>';
  }
  function cellHtml(no, it, state, excused){
    var s = excused ? "on" : (state || "");
    return '<button class="cell s-' + (s || "none") + '" data-k="' + no + ':' + it.slot + '" '
         + 'aria-label="' + no + 'ばん ' + esc(it.name) + ' ' + MARK[s].label + '">' + cellInner(s) + '</button>';
  }
  function paintCell(k, state){
    var c = root && root.querySelector('.cell[data-k="' + k + '"]');
    if(!c) return render();
    var p = k.split(":"), it = itemOf(Number(p[1]));
    var s = state || "";
    c.className = "cell s-" + (s || "none");
    c.setAttribute("aria-label", p[0] + "ばん " + it.name + " " + MARK[s].label);
    c.innerHTML = cellInner(s);
    flash(c);
  }
  function flash(c){ c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); }

  function itemOf(slot){ return S.items.filter(function(i){ return i.slot === slot; })[0]; }

  function summaryHtml(){
    var cells = view(), abs = absView();
    return S.items.map(function(it){
      var left = 0, forgot = 0, doing = 0;
      S.roster.forEach(function(r){
        if(abs[r.no]) return;   /* 休みの子は全部「休」判定なので残数に入れない */
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

  /* 表示する名前＝苗字。同じ苗字がいる子は「苗字＋名前の一文字目」にする */
  function dispMap(){
    var seen = {}, disp = {};
    S.roster.forEach(function(r){
      var sn = String(r.name || "").trim().split(/[\s　]+/)[0] || "";
      if(sn) seen[sn] = (seen[sn] || 0) + 1;
    });
    S.roster.forEach(function(r){
      var p = String(r.name || "").trim().split(/[\s　]+/);
      var sn = p[0] || "", g = p[1] || "";
      disp[r.no] = sn && seen[sn] > 1 && g ? sn + Array.from(g)[0] : sn;
    });
    return disp;
  }

  function netHtml(){
    return online
      ? '<div class="net" title="保存できています">' + icon("cloud") + '<span class="sr">保存できています</span></div>'
      : '<div class="net off" role="status">' + icon("cloudOff") + 'つながっていません（しるしは この PC に のこっています）</div>';
  }

  function paneHtml(list, rows, cols, cells, named, abs, disp){
    var h = '<div class="pane" style="--cols:' + cols + ';--rows:' + (rows + 1) + ';grid-template-rows:48px repeat(' + rows + ',minmax(0,1fr))">';
    h += '<div class="row head"><div>番号</div><div>' + (named ? '名前' : '') + '</div>'
       + S.items.map(function(it){ return '<div class="' + (it.color ? "t-" + it.color : "") + '">' + icon(it.icon) + '<span>' + esc(it.name) + '</span></div>'; }).join("")
       + '</div>';
    for(var i = 0; i < rows; i++){
      var st = list[i];
      if(!st){
        h += '<div class="row empty"><div class="who"></div><div class="who"></div>'
           + S.items.map(function(it){ return '<div class="cell"></div>'; }).join("") + '</div>';
        continue;
      }
      var ab = !!abs[st.no], lab = st.no + 'ばん 休みの切り替え';
      /* 番号と名前は別のセル。背景は行と同じ・間に線は引かない。どちらを押しても休み切替 */
      h += '<div class="row' + (ab ? ' abs' : '') + '">'
         + '<button type="button" class="who wno" data-abs="' + st.no + '"'
         + ' aria-pressed="' + ab + '" aria-label="' + lab + '"><span class="no">' + st.no + '</span></button>'
         + '<button type="button" class="who wnm" data-abs="' + st.no + '"'
         + ' aria-pressed="' + ab + '" aria-label="' + lab + '">'
         + (disp[st.no] ? '<span class="nm">' + esc(disp[st.no]) + '</span>' : '')
         + (ab ? '<span class="ab">休</span>' : '') + '</button>'
         + S.items.map(function(it){
             var k = st.no + ":" + it.slot;
             return cellHtml(st.no, it, ab ? "rest" : cells[k], !ab && !!S.excused[k]);
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
    var p = Domain.jstParts(Date.now());
    var wknd = p.wd === 0 || p.wd === 6;
    var before = p.h * 60 + p.mi < Domain.OPEN.from;
    var msg = wknd ? 'きょうは おやすみです'
      : before ? 'あけるのは 8:00 からです'
      : 'きょうの うけつけは おわりました';
    return '<div class="helper"><div class="closed"><div class="mark">閉室中</div>'
      + '<p class="msg">' + msg + '</p>'
      + '<p class="sub">つかえるのは 平日 8:00〜14:00</p></div></div>';
  }
  /* ── 差分描画 ─────────────────────────────────
     15秒ごとの状態確認では表の構造（日・品目・名簿・免除）がほぼ変わらない。
     構造の印（fp）が同じなら DOM を建て直さず、変わったマス・休み行・
     集計・接続表示だけを書き直す（字の大きさの自動調整 fitWho も走らせない）。 */
  var last = null;   /* {fp, cells, abs, sum, net}：いま画面に出ている状態 */
  function fingerprint(){
    return S.date + "|" + (opts.staff ? "t" : "h")
      + "|" + S.items.map(function(i){ return i.slot + "," + i.name + "," + i.icon + "," + (i.color || ""); }).join(";")
      + "|" + S.roster.map(function(r){ return r.no + "," + (r.name || ""); }).join(";")
      + "|" + Object.keys(S.excused || {}).sort().join(";");
  }
  /* 描いた時点の状態を覚える */
  function rememberLast(fp, cells, abs){
    var m = {}, a = {};
    S.roster.forEach(function(st){
      a[st.no] = !!abs[st.no];
      S.items.forEach(function(it){
        var k = st.no + ":" + it.slot;
        m[k] = a[st.no] ? "rest" : (S.excused[k] ? "on" : (cells[k] || ""));
      });
    });
    last = {fp:fp, cells:m, abs:a, sum:summaryHtml(), net:online};
  }
  function diffApply(cells, abs){
    var disp = dispMap(), absDirty = false;
    S.roster.forEach(function(st){
      var no = st.no, ab = !!abs[no];
      if(last.abs[no] !== ab){
        last.abs[no] = ab; absDirty = true;
        var wno = root.querySelector('.who.wno[data-abs="' + no + '"]');
        var wnm = root.querySelector('.who.wnm[data-abs="' + no + '"]');
        if(wno && wnm){
          wno.parentElement.classList.toggle("abs", ab);
          var lab = no + "ばん 休みの切り替え";
          wno.setAttribute("aria-pressed", String(ab));
          wnm.setAttribute("aria-pressed", String(ab));
          wno.setAttribute("aria-label", lab);
          wnm.setAttribute("aria-label", lab);
          wnm.innerHTML = (disp[no] ? '<span class="nm">' + esc(disp[no]) + '</span>' : '')
                        + (ab ? '<span class="ab">休</span>' : '');
        }
      }
      S.items.forEach(function(it){
        var k = no + ":" + it.slot;
        var want = ab ? "rest" : (S.excused[k] ? "on" : (cells[k] || ""));
        if(last.cells[k] !== want){
          last.cells[k] = want;
          var c = root.querySelector('.cell[data-k="' + k + '"]');
          if(c){
            c.className = "cell s-" + (want || "none");
            c.setAttribute("aria-label", no + "ばん " + it.name + " " + MARK[want].label);
            c.innerHTML = cellInner(want);
          }
        }
      });
    });
    var sum = summaryHtml();
    if(sum !== last.sum){
      last.sum = sum;
      var el = root.querySelector(".sum"); if(el) el.innerHTML = sum;
    }
    if(online !== last.net){
      last.net = online;
      var nel = root.querySelector(".net"); if(nel) nel.outerHTML = netHtml();
    }
    if(absDirty) fitWho();
  }

  function render(){
    if(!root || !active) return;
    if(closedNow()){ root.innerHTML = closedHtml(); last = null; return; }
    if(netBlocked()){ root.innerHTML = offnetHtml(); last = null; return; }
    if(!S){ root.innerHTML = '<div class="helper"><div class="none">' + icon("sync") + 'よみこみ中…</div></div>'; last = null; return; }
    var cells = view(), abs = absView();
    var fp = fingerprint();
    if(last && last.fp === fp){ diffApply(cells, abs); return; }

    var head = '<div class="hbar"><div class="date">' + esc(dateLabel(S.date, S.wd)) + '</div>'
      + '<div class="title">' + icon("check") + 'しゅくだい チェック</div><div class="grow"></div>'
      + (S.roster.length && S.items.length ? legend() : '') + netHtml()
      + (opts.staff ? '<button class="btn tbtn" data-act="teacher">' + icon("gear") + '先生の画面</button>' : '') + '</div>';

    var body;
    if(!S.roster.length){
      body = '<div class="none">' + icon("users") + '名簿が まだ ありません<p>先生の画面で 名簿を 入れてください</p></div>';
    }else if(!S.items.length){
      body = '<div class="none">' + icon("star") + 'きょうは 提出物が ありません</div>';
    }else{
      var roster = S.roster.slice().sort(function(a, b){ return a.no - b.no; });
      var panes = [];
      var named = S.roster.some(function(r){ return r.name; });
      var disp = dispMap();
      /* 元の名前列（1.8fr）の幅を半分にし、空いた幅を提出物へ配分する。
         名前列はさらに「番号（左寄せ・2桁分の固定幅）＋名前（中央）」の2列に分ける（合計の幅は変えない） */
      var nameFr = .9 * S.items.length / (S.items.length + .9);
      var cols = "22px minmax(36px," + nameFr + "fr) repeat(" + S.items.length + ",minmax(0,1fr))";
      var rows = Math.ceil(roster.length / 3);
      for(var i = 0; i < 3; i++){
        panes.push(paneHtml(roster.slice(i * rows, (i + 1) * rows), rows, cols, cells, named, abs, disp));
      }
      body = '<div class="sumbar"><div class="sum">' + summaryHtml() + '</div></div>'
           + '<div class="panes">' + panes.join("") + '</div>';
    }
    root.innerHTML = '<div class="helper">' + head + body + '</div>';
    fitWho();
    rememberLast(fp, cells, abs);
  }

  /* 番号と名前のセルの字を、枠からはみ出さない一番大きな字にする。
     列の幅は固定なので、一番長い行に合わせて列ごとの大きさを決める */
  function fitWho(){
    var ws = root.querySelectorAll(".pane .who[data-abs]");
    var i, w, j, mins = [];
    for(i = 0; i < ws.length; i++) ws[i].style.fontSize = "10px";
    for(i = 0; i < ws.length; i++){
      w = ws[i];
      var need = 0, kids = w.children;
      for(j = 0; j < kids.length; j++){
        if(kids[j].classList.contains("ab")) continue;
        need += kids[j].scrollWidth;
      }
      var pad = w.classList.contains("wnm")
        ? (w.parentElement.classList.contains("abs") ? 38 : 8)
        : 8;
      var have = w.clientWidth - pad;
      var rh = w.parentElement.clientHeight;
      var fs = Math.min(10 * have / Math.max(need, 1), rh * 0.58, 40);
      var p = w.closest(".pane"), pi = Array.prototype.indexOf.call(p.parentElement.children, p);
      if(mins[pi] === undefined || fs < mins[pi]) mins[pi] = fs;
      w._fs = fs;
    }
    for(i = 0; i < ws.length; i++){
      w = ws[i];
      var p2 = w.closest(".pane"), pi2 = Array.prototype.indexOf.call(p2.parentElement.children, p2);
      w.style.fontSize = Math.max(9, Math.min(w._fs, mins[pi2])) + "px";
      delete w._fs;
    }
  }

  function offnetHtml(){
    return '<div class="helper"><div class="closed"><div class="mark">閉室中</div>'
      + '<p class="msg">がっこうの ネットワークから ひらいてください</p>'
      + '<p class="sub">つかえるのは 校内（edu-net）からだけ</p></div></div>';
  }

  function mount(el, o){ root = el; opts = o || {}; active = true; closedServer = false; netOk = null; last = null; render(); kick(); gate(); netCheck(); }
  function unmount(){ active = false; clearTimeout(timer); clearTimeout(gateT); clearTimeout(netT); }

  document.addEventListener("click", function(e){
    if(!active || !root || !root.contains(e.target)) return;
    if(e.target.closest("[data-act=teacher]")){ if(opts.openTeacher) opts.openTeacher(); return; }
    tapWho(e);
    onTap(e);
  });
  document.addEventListener("visibilitychange", function(){ if(active && !document.hidden) kick(); });
  window.addEventListener("online", function(){ if(active){ kick(); netCheck(); } });

  return {mount:mount, unmount:unmount, refresh:kick, pending:function(){ return queue.length; }};
})();
