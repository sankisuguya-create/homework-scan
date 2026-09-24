/* ==================================================================
   Api.gs — 画面から呼ぶ口（api…）。

   ■ 関門はアカウントで分ける（暗証番号は使わない）
       1. すべての api… は1行目で guard() を呼ぶ。教職員か、「係」シートに
          入れた児童（期限内）だけが通る（Gate.who）。
       2. 先生の口（名簿・免除・分析など）は teacher() で、教職員の
          アカウントでなければ何も返さない。係の児童が呼べるのは
          apiToday と apiMark（きょうの分だけ）の2つ。
       3. スプレッドシートそのものは児童に共有しない。

   ■ シートやキャッシュは P.… 経由で触る（Platform.gs）。
       ここは Apps Script の API を直接呼ばない。デモ版と検査で
       同じファイルをそのまま動かすため。
================================================================== */

var TABLES = {
  "名簿":     ["番号", "氏名"],
  "品目":     ["枠", "名前", "アイコン", "いつも出す", "色"],
  "日の品目": ["日付", "枠", "名前"],
  "記録":     ["日付", "番号", "枠1", "枠2", "枠3", "枠4", "枠5", "枠6", "枠7", "枠8", "枠9"],
  "欠席":     ["日付", "番号"],
  "免除":     ["開始日", "終了日", "番号", "枠", "メモ"],
  "操作記録": ["時刻", "種類", "内容", "利用者"],
  "設定":     ["項目", "値"],
  "係":       ["メールアドレス", "いつまで", "メモ"]
};
var ICONS = ["book", "calc", "note", "pencil", "paper", "star", "music", "bag", "abc"];
var ITEM_COLORS = ["blue", "red", "green"];   /* 品目の列の色。名前は係の画面の t-… に対応 */
var DEFAULT_ROWS = {
  "品目": [
    ["1", "漢字ドリル", "book",   "○", "red"],
    ["2", "計算ドリル", "calc",   "○", "blue"],
    ["3", "連絡帳",     "note",   "○", "green"],
    ["4", "", "pencil", "", ""], ["5", "", "paper", "", ""], ["6", "", "star",  "", ""],
    ["7", "", "music",  "", ""], ["8", "", "bag",   "", ""], ["9", "", "abc",   "", ""]
  ],
  "設定": [
    ["提出率の目安（%）", "80"],
    ["続けて出ていない日の目安", "3"],
    ["係の画面に氏名を出す", "出す"],
    ["集計の開始日", ""]
  ]
};
var OP  = {on:"提出", rest:"休み", forgot:"忘れた", doing:"やっている", off:"空白"};
var VIA = {tap:"タップ", teacher:"先生"};
var GLYPH = {on:"○", rest:"休", forgot:"忘", doing:"△", off:"消"};
var MARK_GRACE = 10;   /* 14:00 の閉室を過ぎても、少し前に押した分を受ける幅（分） */

function invert(o){ var r = {}; Object.keys(o).forEach(function(k){ r[o[k]] = k; }); return r; }
var GLYPH_R = invert(GLYPH);

/* ── 関門 ───────────────────────────────── */
/* 教職員、または「係」シートの児童（期限内）。どちらでもなければ例外 */
function guard(){ return P.who(); }
function teacher(){
  var who = guard();
  if(who.role !== "staff") throw new Error("先生のアカウントで開いてください。");
  return who;
}

/* ── 表を読む ─────────────────────────────── */
function readRoster(){
  var out = [], seen = {};
  P.rows("名簿").forEach(function(r){
    var no = Domain.toInt(r[0]), name = String(r[1] || "").trim();
    if(no == null || no < 1 || no > 99 || !name || seen[no]) return;
    seen[no] = true; out.push({no:no, name:name});
  });
  return out.sort(function(a, b){ return a.no - b.no; });
}
function readSlots(){
  var bySlot = {};
  P.rows("品目").forEach(function(r){
    var s = Domain.toInt(r[0]);
    if(s == null || s < 1 || s > Domain.SLOTS) return;
    bySlot[s] = {slot:s, name:String(r[1] || "").trim(),
                 icon: ICONS.indexOf(String(r[2])) >= 0 ? String(r[2]) : ICONS[s - 1],
                 daily: String(r[3] || "").trim() !== "",
                 color: ITEM_COLORS.indexOf(String(r[4])) >= 0 ? String(r[4]) : ""};
  });
  var out = [];
  for(var s = 1; s <= Domain.SLOTS; s++)
    out.push(bySlot[s] || {slot:s, name:"", icon:ICONS[s - 1], daily:false, color:""});
  return out;
}
function readDays(){
  var days = {};
  P.rows("日の品目").forEach(function(r){
    var d = Domain.asDate(r[0]), s = Domain.toInt(r[1]);
    if(!d || s == null) return;
    if(!days[d]) days[d] = [];
    if(s >= 1 && s <= Domain.SLOTS) days[d].push({slot:s, name:String(r[2] || "").trim()});
  });
  Object.keys(days).forEach(function(d){ days[d].sort(function(a, b){ return a.slot - b.slot; }); });
  return days;
}
/* ── 「記録」の行 ───────────────────────────
   1日×児童ごとの1行：日付,番号,枠1…枠9。セルは「いまの状態」で上書きする。
   セルの文字："○ 8:12"「△」「忘」「*忘」（先頭の * は先生の印）、
   "消" は空白に戻した印（欠席の「休」より強い）。 */ 
function recCellParse(v){
  var m = /^(\*)?([○休忘△消])(?:\s+(\d{1,2}):(\d{2}))?$/.exec(String(v == null ? "" : v).trim());
  if(!m || !GLYPH_R[m[2]]) return null;
  return {op:GLYPH_R[m[2]], via:m[1] ? "teacher" : "tap",
          hm:m[3] == null ? null : Number(m[3]) * 60 + Number(m[4])};
}
function recCellText(op, via, atMs){
  var s = (via === "teacher" ? "*" : "") + GLYPH[op];
  if(atMs != null){ var p = Domain.jstParts(atMs); s += " " + p.h + ":" + Domain.pad(p.mi); }
  return s;
}
/* 「記録」の行を記録の並び（events）に直す。
   セル1つが記録1つ（セルは最後の状態を持つので並び替えは要らない）。 */
function readEvents(){
  var evs = [];
  P.rows("記録").forEach(function(r, i){
    var date = Domain.asDate(r[0]), no = Domain.toInt(r[1]);
    if(!date || !no) return;
    for(var s = 1; s <= Domain.SLOTS; s++){
      var c = recCellParse(r[1 + s]);
      if(!c) continue;
      evs.push({id:"rec-" + i + "-" + s, date:date, no:no, slot:s, op:c.op,
                at:c.hm == null ? "" : date + " " + Domain.hhmm(c.hm) + ":00",
                via:c.via, seq:i});
    }
  });
  return evs;
}
function readAbsences(){
  return P.rows("欠席").map(function(r){ return {date:Domain.asDate(r[0]), no:Domain.toInt(r[1])}; })
    .filter(function(a){ return a.date && a.no; });
}
function readExemptions(){
  return P.rows("免除").map(function(r){
    return {from:Domain.asDate(r[0]), to:Domain.asDate(r[1]), no:Domain.toInt(r[2]),
            slot:Domain.toInt(r[3]) || 0, memo:String(r[4] || "")};
  }).filter(function(x){ return x.no; });
}
function readSettings(){
  var kv = {};
  P.rows("設定").forEach(function(r){ kv[String(r[0]).trim()] = String(r[1] == null ? "" : r[1]).trim(); });
  var rate = Number(kv["提出率の目安（%）"]), streak = Number(kv["続けて出ていない日の目安"]);
  return {
    ratePct: isFinite(rate) && rate > 0 && rate <= 100 ? rate : 80,
    streakMin: isFinite(streak) && streak >= 1 ? Math.round(streak) : 3,
    showNames: kv["係の画面に氏名を出す"] !== "出さない",
    from: Domain.asDate(kv["集計の開始日"] || "")
  };
}

function today(){ return Domain.jstDate(P.now()); }

/* その日の品目。
   「日の品目」に行がある日だけが数える日。行は、その日に初めて印が付いたとき
   （apiMark）か、先生が品目を決めたとき（apiSaveDay）に作る。開いただけでは作らない
   （土日や休みの日に開いても、分析の分母が増えない）。
   行が無い日は「いつも出す」の品目を下書きとして返す（draft:true）。 */
function dailyItems(slots){
  return slots.filter(function(s){ return s.daily && s.name; })
              .map(function(s){ return {slot:s.slot, name:s.name}; });
}
function itemsFor(date, days, slots){
  days = days || readDays(); slots = slots || readSlots();
  var list = days[date], draft = !list;
  if(draft) list = dailyItems(slots);
  var meta = {};
  slots.forEach(function(s){ meta[s.slot] = s; });
  return {draft:draft, items:list.map(function(it){
    var m = meta[it.slot] || {};
    return {slot:it.slot, name:it.name, icon:m.icon, color:m.color || ""};
  })};
}
/* その日の行が無ければ「いつも出す」から作る。P.lock の中で呼ぶ */
function ensureDay(date, days, slots){
  if(days[date]) return days[date];
  var list = dailyItems(slots);
  P.append("日の品目", list.length ? list.map(function(it){ return [date, it.slot, it.name]; })
                                   : [[date, 0, "提出物なし"]]);
  days[date] = list;
  return list;
}

/* ── 係の画面 ─────────────────────────────── */
/* ctx に読み込み済みの表を渡すと、読み直さない（apiMark から） */
function helperState(ctx){
  ctx = ctx || {};
  var date = today();
  var days = ctx.days || readDays(), slots = ctx.slots || readSlots();
  var items = itemsFor(date, days, slots).items;
  var roster = ctx.roster || readRoster();
  var events = ctx.events || readEvents();
  var v = Domain.dayView({date:date, items:items, roster:roster, events:events,
                          absences:readAbsences(), exemptions:readExemptions()});
  var st = ctx.settings || readSettings();
  return {date:date, wd:Domain.weekday(date), items:items,
          roster: roster.map(function(s){ return {no:s.no, name: st.showNames ? s.name : ""}; }),
          cells:v.cells, excused:v.excused, now:P.now()};
}
/* 係の画面を使えるのは 8:00〜14:00（日本時間）。閉じている間は closed を返す。
   先生（staff）はいつでも見られる。端末側でも同じ時刻で閉じるので、
   オフラインでも「閉室中」にかわる。 */ 
function apiToday(){
  var who = guard();
  if(who.role === "helper" && !Domain.openAt(P.now())) return {closed:true};
  return helperState();
}

/* マスの状態を変える。events は端末に貯めた分をまとめて送ってくる。
   op は「この状態にする」（on/rest/forgot/doing/off）。「次へ進める」ではないので、
   送り直しても、2台が同じマスを押しても、状態がとびとびに進んでしまうことはない。
   「記録」の「日付×番号」の行にある枠のセルを上書きする（行がなければ足す）。
   複数の PC が並行して押してもロックして順に処理するので、あとから届いた入力が
   そのマスの状態になる（あと入力が優先）。同じ記録を送り直しても同じ状態が
   上書きされるだけなので増えない。
   sentAt は端末が送った時の端末の時計。サーバの時計との差で、記録に残す時刻を直す
   （端末の時計がずれていても、押した時刻が大きくずれて残らない）。
   係が書けるのは開いている時間（8:00〜14:00＋10分の猶予）できょうの分だけ。
   きょう以外の日を直すのは先生（教職員のアカウント）だけ。 */
function apiMark(events, sentAt){
  var who = guard();
  var isTeacher = who.role === "staff";
  var now = P.now(), date0 = today();
  var list = Array.isArray(events) ? events.slice(0, 500) : [];
  var processed = [];
  list.forEach(function(e){
    if(e && typeof e === "object" && /^[\w-]{6,40}$/.test(String(e.id || "")))
      processed.push(String(e.id));
  });
  if(!isTeacher && !Domain.openAt(now, MARK_GRACE)) return {closed:true, processed:processed};
  var skew = Number(sentAt);
  skew = isFinite(skew) && sentAt !== null && sentAt !== "" ? now - skew : 0;
  if(Math.abs(skew) > 8 * 86400000) skew = 0;
  var rosterList = readRoster(), roster = {};
  rosterList.forEach(function(s){ roster[s.no] = true; });
  var slots = readSlots(), settings = readSettings();
  var days = null;
  P.lock(function(){
    days = readDays();
    var recs = P.rows("記録");
    var recIdx = {};
    recs.forEach(function(r, i){ recIdx[Domain.asDate(r[0]) + "|" + Domain.toInt(r[1])] = i; });
    var dirty = {}, fresh = [];
    list.forEach(function(e){
      if(!e || typeof e !== "object") return;
      var id = String(e.id || "");
      if(!/^[\w-]{6,40}$/.test(id)) return;
      var date = Domain.asDate(e.date);
      if(!date || date > date0 || date < Domain.addDays(date0, -7)) return;
      if(date !== date0 && !isTeacher) return;
      var no = Domain.toInt(e.no), slot = Domain.toInt(e.slot);
      if(!roster[no]) return;
      var items = date === date0 ? (days[date] || dailyItems(slots)) : days[date];
      if(!items || !items.some(function(it){ return it.slot === slot; })) return;
      if(!OP[e.op]) return;
      var via = VIA[e.via] ? e.via : "tap";
      if(via === "teacher" && !isTeacher) via = "tap";
      var at = Number(e.at) + skew;
      if(!isFinite(at) || at > now + 5 * 60000 || at < now - 8 * 86400000) at = now;
      if(date === date0) ensureDay(date, days, slots);
      var key = date + "|" + no, idx = recIdx[key], row, added = false;
      if(idx == null){
        row = [date, String(no), "", "", "", "", "", "", "", "", ""];
        idx = recs.push(row) - 1; recIdx[key] = idx; fresh.push(row); added = true;
      }else{
        row = recs[idx];
      }
      var cell = recCellText(e.op, via, date === date0 ? at : null);
      if(row[1 + slot] !== cell){
        row[1 + slot] = cell;
        if(!added) dirty[idx] = true;
      }
    });
    Object.keys(dirty).forEach(function(i){ P.put("記録", Number(i), recs[i]); });
    P.append("記録", fresh);
  });
  return {processed:processed,
          state:helperState({days:days, slots:slots, roster:rosterList, settings:settings})};
}

function log(kind, detail, email){
  P.append("操作記録", [[Domain.jstStamp(P.now()), kind,
                         String(detail || "").slice(0, 200), email || ""]]);
}

/* ── 先生の画面 ───────────────────────────── */
function apiTeacherDay(date){
  teacher();
  var d0 = today();
  date = Domain.asDate(date) || d0;
  var f = itemsFor(date);
  var items = f.draft && date !== d0 ? [] : f.items;
  var roster = readRoster(), absences = readAbsences();
  var cells = Domain.dayDetail({date:date, items:items, roster:roster,
                                events:readEvents(),
                                absences:absences, exemptions:readExemptions()});
  return {date:date, wd:Domain.weekday(date), today:d0, hasDay: !f.draft,
          items:items, slots:readSlots(), roster:roster, cells:cells,
          absent: absences.filter(function(a){ return a.date === date; }).map(function(a){ return a.no; })};
}
function apiSaveDay(date, items){
  teacher();
  date = Domain.asDate(date);
  if(!date) throw new Error("日付が読めません。");
  var seen = {}, rows = [];
  (items || []).forEach(function(it){
    var s = Domain.toInt(it && it.slot), name = String(it && it.name || "").trim().slice(0, 20);
    if(s == null || s < 1 || s > Domain.SLOTS || !name || seen[s]) return;
    seen[s] = true; rows.push([date, s, name]);
  });
  if(!rows.length) rows.push([date, 0, "提出物なし"]);
  P.lock(function(){
    var keep = P.rows("日の品目").filter(function(r){ return Domain.asDate(r[0]) !== date; });
    P.replace("日の品目", keep.concat(rows));
  });
  return apiTeacherDay(date);
}
function apiSetAbsent(date, nos){
  teacher();
  date = Domain.asDate(date);
  if(!date) throw new Error("日付が読めません。");
  var add = [], seen = {};
  (nos || []).forEach(function(n){
    n = Domain.toInt(n);
    if(n && !seen[n]){ seen[n] = true; add.push([date, n]); }
  });
  P.lock(function(){
    var keep = P.rows("欠席").filter(function(r){ return Domain.asDate(r[0]) !== date; });
    P.replace("欠席", keep.concat(add));
  });
  return apiTeacherDay(date);
}
/* 係の画面を開ける児童。いつまでは学期末（3/31・8/31・12/31）が上限。
   空のまま保存すると学期末の日付が入る（Gate.who と同じ決まり） */
function readHelpers(){
  var t = today();
  return P.rows("係").map(function(r){
    var e = Gate.norm(r[0]);
    if(!e || e.indexOf("@") < 0) return null;
    var until = Domain.asDate(r[1]);
    return {email:e, until:until, memo:String(r[2] || ""), active: !!(until && t <= until)};
  }).filter(function(x){ return !!x; });
}
function apiSetup(){
  teacher();
  return {roster:readRoster(), slots:readSlots(), exemptions:readExemptions(),
          helpers:readHelpers(),
          settings:readSettings(), icons:ICONS, url:P.url(), today:today()};
}
function apiSaveRoster(list){
  teacher();
  var seen = {}, rows = [];
  (list || []).forEach(function(s){
    var no = Domain.toInt(s && s.no), name = String(s && s.name || "").trim().slice(0, 40);
    if(no == null || no < 1 || no > 99 || !name || seen[no]) return;
    seen[no] = true; rows.push([no, name]);
  });
  rows.sort(function(a, b){ return a[0] - b[0]; });
  P.lock(function(){ P.replace("名簿", rows); });
  return apiSetup();
}
function apiSaveSlots(slots){
  teacher();
  var by = {};
  (slots || []).forEach(function(s){
    var n = Domain.toInt(s && s.slot);
    if(n != null && n >= 1 && n <= Domain.SLOTS) by[n] = s;
  });
  var rows = [];
  for(var n = 1; n <= Domain.SLOTS; n++){
    var s = by[n] || {};
    var icon = ICONS.indexOf(String(s.icon)) >= 0 ? String(s.icon) : ICONS[n - 1];
    var name = String(s.name || "").trim().slice(0, 20);
    rows.push([n, name, icon, s.daily && name ? "○" : "",
               ITEM_COLORS.indexOf(String(s.color)) >= 0 ? String(s.color) : ""]);
  }
  P.lock(function(){ P.replace("品目", rows); });
  return apiSetup();
}
function apiSaveExemptions(list){
  teacher();
  var rows = [];
  (list || []).slice(0, 500).forEach(function(x){
    var no = Domain.toInt(x && x.no);
    if(!no) return;
    var slot = Domain.toInt(x.slot) || 0;
    var from = Domain.asDate(x.from), to = Domain.asDate(x.to);
    if(from && to && to < from){ var t = from; from = to; to = t; }
    rows.push([from, to, no, slot || "", String(x.memo || "").slice(0, 100)]);
  });
  P.lock(function(){ P.replace("免除", rows); });
  return apiSetup();
}
function apiSaveHelpers(list){
  teacher();
  var seen = {}, rows = [], cap = Domain.termEnd(today());
  (list || []).slice(0, 100).forEach(function(h){
    var e = Gate.norm(h && h.email);
    var at = e.lastIndexOf("@");
    if(!e || at <= 0 || at === e.length - 1 || /\s/.test(e) || seen[e]) return;
    seen[e] = true;
    var u = Domain.asDate(h && h.until);
    rows.push([e, (u && u < cap) ? u : cap, String(h && h.memo || "").slice(0, 60)]);
  });
  P.lock(function(){ P.replace("係", rows); });
  return apiSetup();
}
function apiSaveSettings(s){
  teacher();
  s = s || {};
  var rate = Number(s.ratePct), streak = Number(s.streakMin);
  var rows = [
    ["提出率の目安（%）", isFinite(rate) && rate > 0 && rate <= 100 ? Math.round(rate) : 80],
    ["続けて出ていない日の目安", isFinite(streak) && streak >= 1 ? Math.round(streak) : 3],
    ["係の画面に氏名を出す", s.showNames === false ? "出さない" : "出す"],
    ["集計の開始日", Domain.asDate(s.from || "")]
  ];
  P.lock(function(){ P.replace("設定", rows); });
  return apiSetup();
}

/* 分析。既定は「集計の開始日」から、きのうまで（きょうはまだ途中なので入れない） */
function apiStats(from, to){
  teacher();
  var st = readSettings(), d0 = today();
  from = Domain.asDate(from) || st.from || "";
  to = Domain.asDate(to) || Domain.addDays(d0, -1);
  var r = Domain.stats({days:readDays(), roster:readRoster(), events:readEvents(),
                        absences:readAbsences(), exemptions:readExemptions(),
                        from:from, to:to, rateMin: st.ratePct / 100, streakMin: st.streakMin});
  r.from = from; r.to = to;
  return r;
}
function apiLogs(){
  teacher();
  return P.tail("操作記録", 60).reverse().map(function(r){
    return {at:Domain.asStamp(r[0]), kind:String(r[1]), detail:String(r[2]), who:String(r[3])};
  });
}
