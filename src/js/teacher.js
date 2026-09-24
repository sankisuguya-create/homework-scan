/* ==================================================================
   先生の画面。教職員のアカウントで開いたときだけ出す（サーバも teacher() で確かめる）。
     きょうとあした … 最初に開く画面。きょう／あしたの宿題を決める＋きょうの未提出者
     きょうの表 … その日の提出物を決める・欠席・マスを直す（前の7日まで）
     分析       … 提出率・平均提出時刻・続けて出ていない日数
     免除       … 特別な事情のある子を、期間・品目ごとに外す
     名簿と品目 … 名簿の貼り付け、品目の枠（名前・アイコン・いつも出す）
     せってい   … 分析の目安、係の画面の氏名、操作記録
================================================================== */
var Teacher = (function(){
  var root = null, opts = {}, tab = "home", active = false;
  var D = null, SU = null, ST = null, date = "", sortBy = "no", roster = null, logs = null;
  var H1 = null, H2 = null;   /* きょうとあした：H1=きょう、H2=あした */
  var TABS = [["home", "paper", "きょうとあした"], ["day", "calendar", "きょうの表"], ["stats", "chart", "分析"],
              ["exempt", "shield", "免除"], ["roster", "users", "名簿と品目"], ["settings", "gear", "せってい"]];

  /* サーバを呼び、失敗したら知らせる */
  function tcall(name){
    return call.apply(null, arguments).catch(function(err){ toast(errText(err), true); throw err; });
  }

  function back(){ if(opts.back) opts.back(); }

  function frame(body){
    var t = TABS.map(function(x){
      return '<button class="tab" role="tab" data-tab="' + x[0] + '" aria-selected="' + (tab === x[0]) + '">'
           + icon(x[1]) + x[2] + '</button>';
    }).join("");
    root.innerHTML = '<div class="teacher">'
      + '<div class="tbar"><h1>' + icon("unlock") + '先生の画面</h1><div class="grow"></div>'
      + '<button class="btn" data-t="back">' + icon("back") + esc(opts.backLabel || "もどる") + '</button></div>'
      + '<div class="tabs" role="tablist">' + t + '</div>'
      + '<div class="tbody">' + body + '</div></div>';
  }
  function loading(){ frame('<div class="empty-msg">' + icon("sync") + ' よみこみ中…</div>'); }

  function show(){
    if(!active) return;
    if(tab === "home") return (H1 && H2) ? frame(homeHtml()) : loadHome();
    if(tab === "day") return D ? frame(dayHtml()) : loadDay(date);
    if(tab === "stats") return ST ? frame(statsHtml()) : loadStats();
    if(!SU) return loadSetup();
    if(tab === "exempt") return frame(exemptHtml());
    if(tab === "roster") return frame(rosterHtml());
    if(tab === "settings") return frame(settingsHtml());
  }
  function loadDay(d){
    loading();
    return tcall("apiTeacherDay", d || "").then(function(r){ D = r; date = r.date; show(); });
  }
  function loadHome(){
    loading();
    return tcall("apiTeacherDay", "").then(function(r1){
      H1 = r1;
      return tcall("apiTeacherDay", Domain.addDays(r1.today, 1));
    }).then(function(r2){ H2 = r2; show(); });
  }
  function loadSetup(){
    loading();
    return tcall("apiSetup").then(function(r){ SU = r; roster = null; show(); });
  }
  function loadStats(from, to){
    loading();
    return tcall("apiStats", from || "", to || "").then(function(r){ ST = r; show(); });
  }

  /* ────────── きょうとあした（最初に開く画面） ──────────
     きょう・あしたの宿題を決める欄と、きょうの未提出者の一覧。
     未提出者が7人以上のときは、トグルで畳んでおく。 */
  function homeHtml(){
    return dayPane(H1, "today", "きょう") + dayPane(H2, "tomorrow", "あした")
      + '<div class="sec"><h2>' + icon("users") + 'きょうの 未提出</h2>' + missingHtml() + '</div>'
      + '<div class="line"><button class="btn" data-t="home-re">' + icon("sync") + 'いまの 状態に 更新</button></div>';
  }
  /* 1日分の宿題を決める欄。「あした」が未決定なら「いつも出す」を最初のチェックにする */
  function dayPane(Dx, pane, label){
    var onDay = {};
    Dx.items.forEach(function(it){ onDay[it.slot] = it.name; });
    var note = Dx.hasDay ? '' : (pane === "tomorrow"
      ? '<p class="note">あしたは まだ 決まっていません。「いつも出す」の品目に チェックを付けています。決めると あしたの表が作られ、集計に入ります。</p>'
      : '<p class="note">この日は まだ 集計に入っていません（まだ 印が 付いていない日）。</p>');
    return '<div class="sec" data-pane="' + pane + '"><h2>' + icon("calendar") + label + 'の 宿題（'
      + esc(dateLabel(Dx.date, Dx.wd)) + '）</h2>' + note
      + '<div class="slots">' + Dx.slots.map(function(s){
          var on = (s.slot in onDay) || (!Dx.hasDay && pane === "tomorrow" && s.daily && !!s.name);
          return '<label class="slot' + (on ? " on" : "") + '"><input type="checkbox" data-pslot="' + s.slot + '"' + (on ? " checked" : "") + '>'
            + icon(s.icon) + '<input type="text" maxlength="20" data-pslotname="' + s.slot + '" value="' + esc(onDay[s.slot] || s.name) + '" placeholder="（名前）"></label>';
        }).join("") + '</div>'
      + '<div class="line"><button class="btn primary" data-t="save-pane" data-saveof="' + pane + '">' + icon("save") + label + 'の 宿題を 決める</button>'
      + '<span class="note">品目を 1つも 付けずに決めると「提出物なし」の日になり、集計に入りません。</span></div></div>';
  }
  /* きょうの未提出者。○でも休でもないマス（免除は除く）が残っている児童 */
  function missingHtml(){
    if(!H1.items.length) return '<div class="empty-msg">きょうは 提出物が ありません。</div>';
    var left = [];
    H1.roster.forEach(function(st){
      var names = H1.items.filter(function(it){
        var c = H1.cells[st.no + ":" + it.slot] || {};
        return !c.exempt && c.state !== "on" && c.state !== "rest";
      }).map(function(it){ return it.name; });
      if(names.length) left.push({st:st, names:names});
    });
    if(!left.length) return '<div class="empty-msg">' + icon("check") + ' 全員 そろっています</div>';
    var chips = '<div class="chips">' + left.map(function(m){
      return '<span class="pick" style="cursor:default">' + m.st.no + ' ' + esc(m.st.name)
           + '（' + m.names.map(esc).join("・") + '）</span>';
    }).join("") + '</div>';
    /* 7人以上は畳んでおく。押すとひらく */
    return left.length >= 7
      ? '<details class="fold"><summary>' + icon("users") + 'まだ の 児童 ' + left.length + '人（押すと ひらきます）</summary>' + chips + '</details>'
      : chips;
  }
  function savePane(pane, btn){
    var Dx = pane === "today" ? H1 : H2, box = btn.closest("[data-pane]");
    var items = $$("[data-pslot]", box).filter(function(x){ return x.checked; }).map(function(x){
      var s = Number(x.getAttribute("data-pslot"));
      return {slot:s, name: $('[data-pslotname="' + s + '"]', box).value.trim()};
    });
    if(items.some(function(i){ return !i.name; })){ toast("名前の無い品目があります", true); return; }
    tcall("apiSaveDay", Dx.date, items).then(function(r){
      if(pane === "today") H1 = r; else H2 = r;
      D = null; ST = null;
      show(); toast((pane === "today" ? "きょう" : "あした") + "の 宿題を 決めました");
    });
  }

  /* ────────── きょうの表 ────────── */
  function dayHtml(){
    var onDay = {};
    D.items.forEach(function(it){ onDay[it.slot] = it.name; });
    var minDate = Domain.addDays(D.today, -7);
    var h = '<div class="sec"><div class="daynav">'
      + '<button class="btn" data-t="prev"' + (D.date <= minDate ? " disabled" : "") + '>' + icon("left") + '前の日</button>'
      + '<div class="d">' + esc(dateLabel(D.date, D.wd)) + '</div>'
      + '<button class="btn" data-t="next"' + (D.date >= D.today ? " disabled" : "") + '>次の日' + icon("right") + '</button>'
      + (D.date !== D.today ? '<button class="btn" data-t="today">' + icon("calendar") + 'きょう</button>' : '')
      + '</div></div>';

    h += '<div class="sec"><h2>' + icon("paper") + 'この日の 提出物</h2>'
      + (D.hasDay ? '' : '<p class="note">この日は まだ 集計に入っていません（まだ 印が 付いていない日）。決めると 集計に入ります。</p>')
      + '<p class="note">チェックを付けた品目が、この日の表に並びます。名前はこの日だけ変えられます（ふだんの名前は「名簿と品目」で）。</p>'
      + '<div class="slots">' + D.slots.map(function(s){
          var on = s.slot in onDay;
          return '<label class="slot' + (on ? " on" : "") + '"><input type="checkbox" data-slot="' + s.slot + '"' + (on ? " checked" : "") + '>'
            + icon(s.icon) + '<input type="text" maxlength="20" data-slotname="' + s.slot + '" value="' + esc(on ? onDay[s.slot] : s.name) + '" placeholder="（名前）"></label>';
        }).join("") + '</div>'
      + '<div class="line"><button class="btn primary" data-t="save-day">' + icon("save") + 'この日の 提出物を 決める</button>'
      + '<span class="note">品目を 1つも 付けずに決めると「提出物なし」の日になり、集計に入りません。</span></div></div>';

    var abs = {}; D.absent.forEach(function(n){ abs[n] = true; });
    h += '<div class="sec"><h2>' + icon("bed") + '欠席</h2>'
      + '<p class="note">欠席にした子は、係の画面で 全部のマスが「休」になります（提出として数えます）。</p>'
      + (D.roster.length ? '<div class="chips">' + D.roster.map(function(r){
          return '<button class="pick" data-abs="' + r.no + '" aria-pressed="' + !!abs[r.no] + '">'
               + (abs[r.no] ? icon("bed") : '') + r.no + ' ' + esc(r.name) + '</button>';
        }).join("") + '</div><div class="line"><button class="btn primary" data-t="save-abs">' + icon("save") + '欠席を 保存</button></div>'
        : '<div class="empty-msg">名簿が まだ ありません。「名簿と品目」で 入れてください。</div>')
      + '</div>';

    h += '<div class="sec"><h2>' + icon("check") + 'この日の表</h2>';
    if(!D.items.length || !D.roster.length){
      h += '<div class="empty-msg">この日は 提出物が ありません。</div></div>';
      return h;
    }
    h += '<p class="note">マスを押すと 空白→○→休→忘→△→空白 と かわります（先生が直したしるしとして残ります）。</p>'
      + '<div style="overflow-x:auto"><table class="tbl mat"><thead><tr><th class="num">番号</th><th>氏名</th>'
      + D.items.map(function(it){ return '<th>' + icon(D.slots[it.slot - 1].icon) + ' ' + esc(it.name) + '</th>'; }).join("")
      + '</tr></thead><tbody>' + D.roster.map(function(r){
          return '<tr><td class="num">' + r.no + '</td><td>' + esc(r.name) + '</td>' + D.items.map(function(it){
            var c = D.cells[r.no + ":" + it.slot] || {};
            return '<td class="cellw">' + matCell(r.no, it.slot, c) + '</td>';
          }).join("") + '</tr>';
        }).join("") + '</tbody></table></div></div>';
    return h;
  }
  function matCell(no, slot, c){
    if(c.exempt) return '<div class="c ex">免除</div>';
    var s = c.state || "";
    var sub = c.via === "absent" ? "欠席" : c.via === "teacher" ? "先生" : c.at;
    return '<button class="c s-' + (s || "none") + '" data-cell="' + no + ':' + slot + '" aria-label="' + no + '番 ' + MARK[s].label + '">'
         + '<span>' + markGlyph(s) + '</span>' + (s && sub ? '<small>' + esc(sub) + '</small>' : '') + '</button>';
  }
  function saveDay(){
    var items = $$("[data-slot]", root).filter(function(x){ return x.checked; }).map(function(x){
      var s = Number(x.getAttribute("data-slot"));
      return {slot:s, name: $('[data-slotname="' + s + '"]', root).value.trim()};
    });
    var noName = items.filter(function(i){ return !i.name; });
    if(noName.length){ toast("名前の無い品目があります", true); return; }
    tcall("apiSaveDay", D.date, items).then(function(r){ D = r; ST = null; show(); toast("この日の提出物を決めました"); });
  }
  function saveAbs(){
    var nos = $$("[data-abs]", root).filter(function(b){ return b.getAttribute("aria-pressed") === "true"; })
      .map(function(b){ return Number(b.getAttribute("data-abs")); });
    tcall("apiSetAbsent", D.date, nos).then(function(r){ D = r; ST = null; show(); toast("欠席を保存しました"); });
  }
  var seq = 0;
  function tapCell(k){
    var p = k.split(":"), c = D.cells[k] || {};
    var next = Domain.nextState(c.state || "");
    var ev = {id:"t-" + Date.now().toString(36) + "-" + (++seq), date:D.date, no:Number(p[0]), slot:Number(p[1]),
              op: next || "off", at:Date.now(), via:"teacher"};
    D.cells[k] = {state:next, via:"teacher", at:"", exempt:false};
    show();
    tcall("apiMark", [ev], Date.now()).then(function(){ ST = null; return tcall("apiTeacherDay", D.date); })
      .then(function(r){ D = r; if(tab === "day") show(); }, function(){ loadDay(D.date); });
  }

  /* ────────── 分析 ────────── */
  function pct(x){ return x == null ? "―" : Math.round(x * 100) + "%"; }
  function meanOf(a){ return a.length ? a.reduce(function(x, y){ return x + y; }, 0) / a.length : null; }
  function medianOf(a){
    if(!a.length) return null;
    var s = a.slice().sort(function(x, y){ return x - y; }), i = Math.floor(s.length / 2);
    return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
  }
  function statsHtml(){
    var list = ST.students.slice();
    if(sortBy === "rate") list.sort(function(a, b){ return (a.rate == null ? 2 : a.rate) - (b.rate == null ? 2 : b.rate) || a.no - b.no; });
    if(sortBy === "late") list.sort(function(a, b){ return (b.avgMin || 0) - (a.avgMin || 0) || a.no - b.no; });
    if(sortBy === "forgot") list.sort(function(a, b){ return b.forgot - a.forgot || a.no - b.no; });
    var flagged = ST.students.filter(function(s){ return s.flag; });
    var h = '<div class="sec"><h2>' + icon("calendar") + '期間</h2><div class="line">'
      + '<label class="field">はじめ<input type="date" id="st-from" value="' + esc(ST.from) + '"></label>'
      + '<label class="field">おわり<input type="date" id="st-to" value="' + esc(ST.to) + '"></label>'
      + '<button class="btn primary" data-t="stats-run">' + icon("chart") + '集計する</button></div>'
      + '<p class="note">数えた日：' + ST.dates.length + '日。○と休を「提出」、忘・△・空白を「未提出」として数えます。免除のマスは数えません。'
      + '平均・中央値は、係がタップした○の時刻だけから出します。</p></div>';

    /* みんなのまとめ：絶対値（数えた回数）と代表値（平均・中央値）を並べる */
    var rates = ST.students.filter(function(s){ return s.rate != null; }).map(function(s){ return s.rate; });
    var avgs = ST.students.map(function(s){ return s.avgMin; }).filter(function(v){ return v != null; });
    var meds = ST.students.map(function(s){ return s.medMin; }).filter(function(v){ return v != null; });
    var tot = {req:0, sub:0, rest:0, forgot:0, doing:0};
    ST.students.forEach(function(s){ tot.req += s.required; tot.sub += s.submitted;
      tot.rest += s.rest; tot.forgot += s.forgot; tot.doing += s.doing; });
    var topForgot = ST.students.reduce(function(m, s){ return s.forgot > (m ? m.forgot : -1) ? s : m; }, null);
    h += '<div class="sec"><h2>' + icon("chart") + 'みんなの まとめ（この期間）</h2><div class="line" style="flex-wrap:wrap">'
      + '<span class="pick" style="cursor:default"><b>提出率</b>　平均 ' + pct(meanOf(rates)) + '　中央値 ' + pct(medianOf(rates)) + '</span>'
      + '<span class="pick" style="cursor:default"><b>提出時刻</b>　平均 ' + (meanOf(avgs) == null ? "―" : Domain.hhmm(meanOf(avgs)))
      + '　中央値 ' + (medianOf(meds) == null ? "―" : Domain.hhmm(medianOf(meds))) + '</span>'
      + '<span class="pick" style="cursor:default"><b>忘れた回数</b>　合計 ' + tot.forgot + '　1人平均 '
      + (ST.students.length ? (tot.forgot / ST.students.length).toFixed(1) : "0")
      + (topForgot && topForgot.forgot ? '　最大 ' + topForgot.forgot + '（' + topForgot.no + '番）' : '') + '</span>'
      + '<span class="pick" style="cursor:default"><b>内わけ</b>　提出 ' + tot.sub + ' / ' + tot.req + '　休 ' + tot.rest
      + '　忘 ' + tot.forgot + '　△ ' + tot.doing + '</span></div></div>';

    h += '<div class="sec"><h2>' + icon("flag") + '気になる子（提出率 ' + Math.round(ST.rateMin * 100) + '% 未満、または ' + ST.streakMin + '日 以上 続けて未提出）</h2>'
      + (flagged.length ? '<div class="chips">' + flagged.map(function(s){
          var why = [];
          if(s.lowRate) why.push("提出率 " + pct(s.rate));
          if(s.longStreak) why.push(s.streak + "日 続けて");
          return '<span class="pick" style="background:var(--warn)">' + icon("flag") + s.no + ' ' + esc(s.name) + '（' + why.join("・") + '）</span>';
        }).join("") + '</div>' : '<div class="empty-msg">' + icon("check") + ' いません</div>')
      + '</div>';

    if(!ST.dates.length){
      return h + '<div class="empty-msg">この期間に 数える日が ありません。</div>';
    }
    h += '<div class="sec"><h2>' + icon("users") + '児童ごと</h2>'
      + '<div class="line"><label class="field">ならべ方<select id="st-sort">'
      + [["no", "番号順"], ["rate", "提出率の低い順"], ["late", "平均時刻の遅い順"], ["forgot", "忘れた回数の多い順"]].map(function(o){
          return '<option value="' + o[0] + '"' + (sortBy === o[0] ? " selected" : "") + '>' + o[1] + '</option>';
        }).join("") + '</select></label></div>'
      + '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th class="num">番号</th><th>氏名</th><th>提出率</th>'
      + '<th class="num">提出/出す数</th><th class="num">休</th><th class="num">忘</th><th class="num">△</th>'
      + '<th class="num">平均時刻</th><th class="num">中央値</th><th class="num">続けて未提出</th><th>品目ごと</th></tr></thead><tbody>'
      + list.map(function(s){
          var bar = s.rate == null ? "―" : '<span class="bar"><i style="width:' + Math.round(s.rate * 100) + '%"></i>'
            + '<b style="left:' + Math.round(ST.rateMin * 100) + '%"></b></span>' + pct(s.rate);
          var per = ST.itemNames.filter(function(n){ return s.perItem[n]; }).map(function(n){
            return esc(n) + ' ' + s.perItem[n].sub + '/' + s.perItem[n].req;
          }).join("　");
          return '<tr' + (s.flag ? ' class="flag"' : '') + '><td class="num">' + s.no + '</td><td>'
            + (s.flag ? '<span class="mk flag">' + icon("flag") + '</span> ' : '') + esc(s.name) + '</td>'
            + '<td>' + bar + '</td><td class="num">' + s.submitted + '/' + s.required + '</td>'
            + '<td class="num">' + s.rest + '</td><td class="num">' + s.forgot + (s.forgot ? '/' + s.required : '') + '</td><td class="num">' + s.doing + '</td>'
            + '<td class="num">' + (s.avg || "―") + '</td><td class="num">' + (s.med || "―") + '</td>'
            + '<td class="num">' + (s.streak ? s.streak + "日" : "0") + '</td><td>' + per + '</td></tr>';
        }).join("") + '</tbody>'
      /* 合計行：絶対値の合計と、全体の提出率 */
      + '<tfoot><tr style="font-weight:700;border-top:2px solid var(--ink)"><td class="num">計</td><td>全員</td>'
      + '<td>' + (tot.req ? pct(tot.sub / tot.req) : "―") + '</td><td class="num">' + tot.sub + '/' + tot.req + '</td>'
      + '<td class="num">' + tot.rest + '</td><td class="num">' + tot.forgot + '</td><td class="num">' + tot.doing + '</td>'
      + '<td class="num">―</td><td class="num">―</td><td class="num">―</td><td>'
      + ST.itemNames.map(function(n){
          var sub = 0, req = 0;
          ST.students.forEach(function(s){ if(s.perItem[n]){ sub += s.perItem[n].sub; req += s.perItem[n].req; } });
          return esc(n) + ' ' + sub + '/' + req;
        }).join("　") + '</td></tr></tfoot></table></div></div>';
    return h;
  }

  /* ────────── 免除 ────────── */
  function namedSlots(){ return SU.slots.filter(function(s){ return s.name; }); }
  function exemptRow(x, i){
    var rs = SU.roster.map(function(r){
      return '<option value="' + r.no + '"' + (x.no === r.no ? " selected" : "") + '>' + r.no + ' ' + esc(r.name) + '</option>';
    }).join("");
    var ss = '<option value="0">すべての品目</option>' + namedSlots().map(function(s){
      return '<option value="' + s.slot + '"' + (x.slot === s.slot ? " selected" : "") + '>' + esc(s.name) + '</option>';
    }).join("");
    return '<tr data-ex="' + i + '"><td><select data-f="no">' + rs + '</select></td><td><select data-f="slot">' + ss + '</select></td>'
      + '<td><input type="date" data-f="from" value="' + esc(x.from) + '"></td><td><input type="date" data-f="to" value="' + esc(x.to) + '"></td>'
      + '<td><input type="text" data-f="memo" maxlength="100" value="' + esc(x.memo) + '" style="width:16em"></td>'
      + '<td><button class="btn small" data-t="ex-del" data-i="' + i + '">' + icon("trash") + 'けす</button></td></tr>';
  }
  function exemptHtml(){
    if(!SU.roster.length) return '<div class="empty-msg">名簿が まだ ありません。「名簿と品目」で 入れてください。</div>';
    return '<div class="sec"><h2>' + icon("shield") + '免除</h2>'
      + '<p class="note">免除のマスは 集計に入りません。係の画面では ○ と同じ見た目になり、押しても変わりません。メモは先生の画面にだけ出ます。'
      + '日付を空けると「ずっと」です。</p>'
      + '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>児童</th><th>品目</th><th>はじめ</th><th>おわり</th><th>メモ（先生だけ）</th><th></th></tr></thead><tbody>'
      + (SU.exemptions.length ? SU.exemptions.map(exemptRow).join("") : '<tr><td colspan="6">まだ ありません</td></tr>')
      + '</tbody></table></div><div class="line">'
      + '<button class="btn" data-t="ex-add">' + icon("plus") + '1行 たす</button>'
      + '<button class="btn primary" data-t="ex-save">' + icon("save") + '免除を 保存</button></div></div>';
  }
  function readExempt(){
    return $$("[data-ex]", root).map(function(tr){
      function f(k){ return $('[data-f="' + k + '"]', tr).value; }
      return {no:Number(f("no")), slot:Number(f("slot")), from:f("from"), to:f("to"), memo:f("memo")};
    });
  }

  /* ────────── 名簿と品目 ────────── */
  function rosterHtml(){
    var list = roster || SU.roster;
    var h = '<div class="sec"><h2>' + icon("users") + '名簿（' + list.length + '人）</h2>'
      + '<p class="note">係の画面では、1〜18番が 左、19番から 右に 並びます。</p>'
      + '<div class="line" style="align-items:flex-start"><div style="overflow-x:auto"><table class="tbl"><thead><tr><th class="num">番号</th><th>氏名</th><th></th></tr></thead><tbody>'
      + (list.length ? list.map(function(r, i){
          return '<tr data-ro="' + i + '"><td><input type="number" min="1" max="99" data-f="no" value="' + r.no + '" style="width:5em"></td>'
            + '<td><input type="text" maxlength="40" data-f="name" value="' + esc(r.name) + '"></td>'
            + '<td><button class="btn small" data-t="ro-del" data-i="' + i + '">' + icon("trash") + 'けす</button></td></tr>';
        }).join("") : '<tr><td colspan="3">まだ ありません</td></tr>')
      + '</tbody></table></div>'
      + '<div class="sec" style="flex:1;min-width:300px"><label class="field">' + icon("paste") + ' 元の名簿から 範囲コピーして 貼りつける（行の数字が番号、はじめの文字の列が氏名。余分な列は 読み飛ばします）'
      + '<textarea id="ro-paste" placeholder="1&#9;あおき はると&#10;2&#9;いしかわ めい"></textarea></label>'
      + '<div class="line"><button class="btn" data-t="ro-read">' + icon("paste") + '貼りつけた名簿を 読む</button></div></div></div>'
      + '<div class="line"><button class="btn" data-t="ro-add">' + icon("plus") + '1人 たす</button>'
      + '<button class="btn primary" data-t="ro-save">' + icon("save") + '名簿を 保存</button>'
      + (roster ? '<span class="mk flag">' + icon("alert") + ' まだ 保存していません</span>' : '') + '</div></div>';

    h += '<div class="sec"><h2>' + icon("paper") + '品目の枠（9つ）</h2>'
      + '<p class="note">「いつも出す」にした品目が、毎日の 最初の 品目に なります。その日だけ 変えるときは「きょうの表」で。'
      + '「列の色」を決めると、係の画面で その品目の列が その色に なります。</p>'
      + '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th class="num">枠</th><th>名前</th><th>アイコン</th><th>列の色</th><th>いつも出す</th></tr></thead><tbody>'
      + SU.slots.map(function(s){
          return '<tr data-sl="' + s.slot + '"><td class="num">' + s.slot + '</td>'
            + '<td><input type="text" maxlength="20" data-f="name" value="' + esc(s.name) + '" placeholder="（使わない）"></td>'
            + '<td><div class="chips">' + SU.icons.map(function(ic){
                return '<button class="pick" data-icon="' + ic + '" aria-pressed="' + (s.icon === ic) + '" aria-label="' + esc(ICON_LABEL[ic] || ic) + '">' + icon(ic) + '</button>';
              }).join("") + '</div></td>'
            + '<td><div class="chips">' + ["", "blue", "red", "green"].map(function(c){
                return '<button class="pick' + (c ? " t-" + c : "") + '" data-color="' + c + '" aria-pressed="' + ((s.color || "") === c) + '">' + (c ? esc(COLOR_LABEL[c]) : "なし") + '</button>';
              }).join("") + '</div></td>'
            + '<td><input type="checkbox" data-f="daily" style="width:32px;height:32px"' + (s.daily ? " checked" : "") + '></td></tr>';
        }).join("") + '</tbody></table></div>'
      + '<div class="line"><button class="btn primary" data-t="sl-save">' + icon("save") + '品目を 保存</button></div></div>';

    var hp = SU.helpers || [];
    h += '<div class="sec"><h2>' + icon("hand") + '係の画面を 開ける児童（' + hp.length + '人）</h2>'
      + '<p class="note">ここに入れた児童は、自分のアドレスで このアプリを開くと 係の画面（きょうの入力）だけが見えます。'
      + '先生の画面には どの方法でも入れません。期限は学期の終わり（3月・8月・12月）までで、それより後は自動で 切れます。'
      + 'もっと早くおわらせたいときだけ、日付を入れてください。</p>'
      + '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>メールアドレス</th><th>いつまで</th><th>メモ</th><th></th></tr></thead><tbody>'
      + (hp.length ? hp.map(function(x, i){
          return '<tr data-hp="' + i + '"' + (x.active ? '' : ' style="opacity:.55"') + '><td><input type="email" data-f="email" value="' + esc(x.email) + '" style="width:22em"></td>'
            + '<td><input type="date" data-f="until" value="' + esc(x.until) + '"></td>'
            + '<td><input type="text" data-f="memo" maxlength="60" value="' + esc(x.memo) + '" style="width:14em"></td>'
            + '<td><button class="btn small" data-t="hp-del" data-i="' + i + '">' + icon("trash") + 'けす</button></td></tr>';
        }).join("") : '<tr><td colspan="4">まだ ありません</td></tr>')
      + '</tbody></table></div><div class="line">'
      + '<button class="btn" data-t="hp-add">' + icon("plus") + '1人 たす</button>'
      + '<button class="btn primary" data-t="hp-save">' + icon("save") + '係を 保存</button></div></div>';
    return h;
  }
  function readRosterTable(){
    return $$("[data-ro]", root).map(function(tr){
      return {no:Number($('[data-f="no"]', tr).value), name:$('[data-f="name"]', tr).value.trim()};
    });
  }
  function readHelpersTable(){
    return $$("[data-hp]", root).map(function(tr){
      return {email:$('[data-f="email"]', tr).value.trim(), until:$('[data-f="until"]', tr).value,
              memo:$('[data-f="memo"]', tr).value.trim()};
    }).filter(function(h){ return h.email; });
  }

  /* ────────── せってい ────────── */
  function settingsHtml(){
    var s = SU.settings;
    var h = '<div class="sec"><h2>' + icon("chart") + '分析の 目安</h2><div class="line">'
      + '<label class="field">提出率（%）が これより低いと 印<input type="number" id="se-rate" min="1" max="100" value="' + s.ratePct + '" style="width:7em"></label>'
      + '<label class="field">続けて 未提出の 日数が これ以上で 印<input type="number" id="se-streak" min="1" max="30" value="' + s.streakMin + '" style="width:7em"></label>'
      + '<label class="field">集計の 開始日<input type="date" id="se-from" value="' + esc(s.from) + '"></label></div></div>';
    h += '<div class="sec"><h2>' + icon("users") + '係の画面の 氏名</h2><div class="chips">'
      + '<button class="pick" data-names="1" aria-pressed="' + s.showNames + '">出す</button>'
      + '<button class="pick" data-names="0" aria-pressed="' + !s.showNames + '">出さない（番号だけ）</button></div>'
      + '<div class="line"><button class="btn primary" data-t="se-save">' + icon("save") + 'せっていを 保存</button></div></div>';
    h += '<div class="sec"><h2>' + icon("clock") + '操作記録（新しい順）</h2>'
      + (logs ? (logs.length ? '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>時刻</th><th>できごと</th><th>アカウント</th></tr></thead><tbody>'
          + logs.map(function(l){ return '<tr><td>' + esc(l.at) + '</td><td>' + esc(l.kind) + (l.detail ? " " + esc(l.detail) : "") + '</td><td>' + esc(l.who) + '</td></tr>'; }).join("")
          + '</tbody></table></div>' : '<div class="empty-msg">まだ ありません</div>')
        : '<div class="line"><button class="btn" data-t="logs">' + icon("clock") + '見る</button></div>')
      + '</div>';
    return h;
  }

  /* ────────── 操作 ────────── */
  function onClick(e){
    if(!active || !root.contains(e.target)) return;
    var tb = e.target.closest("[data-tab]");
    if(tb){ tab = tb.getAttribute("data-tab"); logs = null; show(); return; }
    var pk = e.target.closest("[data-abs]");
    if(pk){
      var on = pk.getAttribute("aria-pressed") !== "true";
      pk.setAttribute("aria-pressed", on);
      pk.innerHTML = (on ? icon("bed") : "") + pk.textContent;
      return;
    }
    var ic = e.target.closest("[data-icon]");
    if(ic){
      $$("[data-icon]", ic.closest("td")).forEach(function(b){ b.setAttribute("aria-pressed", b === ic); });
      return;
    }
    var co = e.target.closest("[data-color]");
    if(co){
      $$("[data-color]", co.closest("td")).forEach(function(b){ b.setAttribute("aria-pressed", b === co); });
      return;
    }
    var nm = e.target.closest("[data-names]");
    if(nm){ $$("[data-names]", root).forEach(function(b){ b.setAttribute("aria-pressed", b === nm); }); return; }
    var cl = e.target.closest("[data-cell]");
    if(cl){ tapCell(cl.getAttribute("data-cell")); return; }
    var b = e.target.closest("[data-t]");
    if(!b || b.disabled) return;
    var t = b.getAttribute("data-t");
    if(t === "back") return back();
    if(t === "prev") return loadDay(Domain.addDays(D.date, -1));
    if(t === "next") return loadDay(Domain.addDays(D.date, 1));
    if(t === "today") return loadDay("");
    if(t === "save-day") return saveDay();
    if(t === "save-pane") return savePane(b.getAttribute("data-saveof"), b);
    if(t === "home-re") return loadHome();
    if(t === "save-abs") return saveAbs();
    if(t === "stats-run") return loadStats($("#st-from").value, $("#st-to").value);
    if(t === "ex-add"){
      SU.exemptions = readExempt();
      SU.exemptions.push({no:SU.roster[0].no, slot:0, from:D ? D.today : "", to:"", memo:""});
      return show();
    }
    if(t === "ex-del"){ SU.exemptions = readExempt(); SU.exemptions.splice(Number(b.getAttribute("data-i")), 1); return show(); }
    if(t === "ex-save") return tcall("apiSaveExemptions", readExempt()).then(function(r){ SU = r; ST = null; D = null; show(); toast("免除を保存しました"); });
    if(t === "ro-add"){
      roster = readRosterTable();
      var max = roster.reduce(function(m, r){ return Math.max(m, r.no || 0); }, 0);
      roster.push({no:max + 1, name:""});
      return show();
    }
    if(t === "ro-del"){ roster = readRosterTable(); roster.splice(Number(b.getAttribute("data-i")), 1); return show(); }
    if(t === "ro-read"){
      var got = Domain.parseRoster($("#ro-paste").value);
      if(!got.length){ toast("名簿が 読めませんでした", true); return; }
      roster = got; show(); toast(got.length + "人を 読みました。「名簿を 保存」で 決まります"); return;
    }
    if(t === "ro-save"){
      var list = readRosterTable();
      var bad = list.filter(function(r){ return !r.name || !(r.no >= 1 && r.no <= 99); });
      if(bad.length){ toast("番号か氏名が 空の行が あります", true); return; }
      var seen = {}, dup = list.filter(function(r){ if(seen[r.no]) return true; seen[r.no] = 1; return false; });
      if(dup.length){ toast(dup[0].no + "番が 2人 います", true); return; }
      return tcall("apiSaveRoster", list).then(function(r){ SU = r; roster = null; D = null; ST = null; show(); toast("名簿を保存しました"); });
    }
    if(t === "hp-add"){ SU.helpers = readHelpersTable(); SU.helpers.push({email:"", until:"", memo:"", active:true}); return show(); }
    if(t === "hp-del"){ SU.helpers = readHelpersTable(); SU.helpers.splice(Number(b.getAttribute("data-i")), 1); return show(); }
    if(t === "hp-save") return tcall("apiSaveHelpers", readHelpersTable()).then(function(r){ SU = r; show(); toast("係を 保存しました"); });
    if(t === "sl-save"){
      var slots = $$("[data-sl]", root).map(function(tr){
        var p = $('[data-icon][aria-pressed="true"]', tr);
        var pc = $('[data-color][aria-pressed="true"]', tr);
        return {slot:Number(tr.getAttribute("data-sl")), name:$('[data-f="name"]', tr).value.trim(),
                icon: p ? p.getAttribute("data-icon") : "", daily:$('[data-f="daily"]', tr).checked,
                color: pc ? pc.getAttribute("data-color") : ""};
      });
      return tcall("apiSaveSlots", slots).then(function(r){ SU = r; D = null; show(); toast("品目を保存しました"); });
    }
    if(t === "se-save"){
      var sn = $('[data-names][aria-pressed="true"]', root);
      return tcall("apiSaveSettings", {ratePct:Number($("#se-rate").value), streakMin:Number($("#se-streak").value),
                                       from:$("#se-from").value, showNames: !sn || sn.getAttribute("data-names") === "1"})
        .then(function(r){ SU = r; ST = null; show(); toast("せっていを保存しました"); });
    }
    if(t === "logs") return tcall("apiLogs").then(function(r){ logs = r; show(); });
  }
  function onChange(e){
    if(!active || !root.contains(e.target)) return;
    if(e.target.id === "st-sort"){ sortBy = e.target.value; show(); }
    if(e.target.matches("[data-slot]") || e.target.matches("[data-pslot]"))
      e.target.closest(".slot").classList.toggle("on", e.target.checked);
  }
  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);

  function mount(el, o){
    root = el; opts = o || {}; active = true;
    tab = "home"; D = SU = ST = null; H1 = H2 = null; roster = null; logs = null; date = "";
    show();
  }
  function unmount(){ active = false; }

  return {mount:mount, unmount:unmount, back:back};
})();
