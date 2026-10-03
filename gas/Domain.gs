/* ==================================================================
   Domain.gs — 宿題チェックの決まりごと。副作用なし。

   シートも Apps Script の API も触らない。だから同じファイルを
     ・Apps Script（Api.gs から呼ぶ）
     ・デモ版（dist/demo.html に差し込む）
     ・手元の検査（node tests/server.test.js）
   の3か所で使う。決まりを変えるときはここだけを直す。

   ■ 日付と時刻
       日付は "2026-09-23"、時刻は "2026-09-23 08:12:05"（日本時間）の文字列で持つ。
       日本は夏時間が無いので、UTC に 9 時間足すだけで日本時間になる。

   ■ 1マスの状態（係がタップするたびに次へ進む）
       空白 → ○提出(on) → 休(rest) → 忘(forgot) → △やっている(doing) → 空白
       「記録」シートに1日×児童ごとの1行があり、マスのセルは
       **最後の操作**で書きかわる（消えてから足すのではなく上書き）。
       集計では ○ と 休 を「提出」、忘・△・空白を「未提出」として数える。
================================================================== */
var Domain = (function(){

  var JST = 9 * 3600 * 1000;
  var SLOTS = 9;   /* 枠は 1〜9。0 は「休み（提出物なし）」の印 */
  var STATES = ["", "on", "rest", "forgot", "doing"];
  var NEXT = {"":"on", on:"rest", rest:"forgot", forgot:"doing", doing:""};
  var COUNTS = {on:true, rest:true};   /* 提出として数える状態 */
  function isState(s){ return STATES.indexOf(s) >= 0; }
  function nextState(s){ return NEXT[s || ""] == null ? "on" : NEXT[s || ""]; }
  function counts(s){ return !!COUNTS[s]; }

  /* ── 語彙の正本 ─────────────────────────────
     記録のセルの字・マスの状態の呼び名・品目のアイコンと色・表の列構成は、
     サーバと両画面が共有する決まりなのでここにだけ置く。画面側の表記は
     ここから派生させる（片方だけ直してずれる、を防ぐ） */
  var MARKS = {   /* マスの状態：「記録」の字 / 操作の名まえ / 画面の呼び名 */
    on:     {glyph:"○", op:"提出",       label:"出した"},
    rest:   {glyph:"休", op:"休み",       label:"休み"},
    forgot: {glyph:"忘", op:"忘れた",     label:"わすれた"},
    doing:  {glyph:"△", op:"やっている", label:"やっている"},
    /* 「消」は空白に戻した印（欠席の「休」より強い）。集計では空白にたたまれる
       ので画面に出ることはない —— サーバ側だけが使う */
    off:    {glyph:"消", op:"空白",       label:"空白"}
  };
  /* MARKS から派生する表（直すのは MARKS だけでよい） */
  var GLYPH = {}, GLYPH_R = {}, OP = {};
  Object.keys(MARKS).forEach(function(k){
    GLYPH[k] = MARKS[k].glyph;
    GLYPH_R[MARKS[k].glyph] = k;
    OP[k] = MARKS[k].op;
  });

  var ITEM_ICONS = ["book", "calc", "note", "pencil", "paper", "star", "music", "bag", "abc"];
  var ICON_LABEL = {book:"本", calc:"計算", note:"連絡帳", pencil:"鉛筆", paper:"プリント",
                    star:"星", music:"音楽", bag:"かばん", abc:"英語"};
  var ITEM_COLORS = ["blue", "red", "green"];   /* 品目の色。係の画面の細い帯の t-… に対応 */
  var COLOR_LABEL = {blue:"薄い青", red:"薄い赤", green:"薄い緑"};

  /* 表の列構成。名簿は算数タイムアタックと同じ並び（先生がシートに直接貼る） */
  var SCHEMA = {
    "名簿":     ["メールアドレス", "学年", "組", "番号", "氏名"],
    "品目":     ["枠", "名前", "アイコン", "いつも出す", "色"],
    "日の品目": ["日付", "枠", "名前"],
    "記録":     (function(){ var h = ["日付", "番号"]; for(var i = 1; i <= SLOTS; i++) h.push("枠" + i); return h; })(),
    "欠席":     ["日付", "番号"],
    "免除":     ["開始日", "終了日", "番号", "枠", "メモ"],
    "操作記録": ["時刻", "種類", "内容", "利用者"],
    "設定":     ["項目", "値"],
    "係":       ["メールアドレス", "いつまで", "メモ"]
  };
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
      ["集計の開始日", ""],
      ["校内のIP", ""]
    ]
  };

  function pad(n){ return (n < 10 ? "0" : "") + n; }

  function jstParts(ms){
    var d = new Date(ms + JST);
    return {y:d.getUTCFullYear(), mo:d.getUTCMonth() + 1, d:d.getUTCDate(),
            h:d.getUTCHours(), mi:d.getUTCMinutes(), s:d.getUTCSeconds(), wd:d.getUTCDay()};
  }
  function jstDate(ms){
    var p = jstParts(ms);
    return p.y + "-" + pad(p.mo) + "-" + pad(p.d);
  }
  function jstStamp(ms){
    var p = jstParts(ms);
    return jstDate(ms) + " " + pad(p.h) + ":" + pad(p.mi) + ":" + pad(p.s);
  }
  /* "2026-09-23 08:12:05" → その日の 0 時からの分（8*60+12）。読めなければ null */
  function stampMinutes(stamp){
    var m = /(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(stamp || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  function hhmm(min){
    if(min == null || !isFinite(min)) return "";
    min = Math.round(min);
    return Math.floor(min / 60) + ":" + pad(min % 60);
  }
  function isDate(s){ return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
  /* シートから読むと Date になっていることがある。日本時間の文字列に寄せる */
  function asDate(v){
    if(v instanceof Date) return jstDate(v.getTime());
    var s = String(v == null ? "" : v).trim();
    var m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(s);
    return m ? m[1] + "-" + pad(Number(m[2])) + "-" + pad(Number(m[3])) : "";
  }
  function asStamp(v){
    if(v instanceof Date) return jstStamp(v.getTime());
    return String(v == null ? "" : v).trim();
  }
  function addDays(date, n){
    var p = date.split("-").map(Number);
    var t = Date.UTC(p[0], p[1] - 1, p[2]) + n * 86400000;
    var d = new Date(t);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }
  function weekday(date){
    var p = date.split("-").map(Number);
    return "日月火水木金土".charAt(new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay());
  }
  /* 土日は宿題の対象外。date の翌日以降で最初の平日を返す（金→月、土→月、日→月） */
  function nextSchoolDay(date){
    var d = addDays(date, 1);
    while(weekday(d) === "土" || weekday(d) === "日") d = addDays(d, 1);
    return d;
  }
  /* date が平日ならそのまま、土日なら次の平日（月曜）に読み替える */
  function schoolDay(date){
    return (weekday(date) === "土" || weekday(date) === "日") ? nextSchoolDay(date) : date;
  }

  /* 係の画面を使える時間（日本時間）。平日の 8:00 から 14:00 まで。
     土曜・日曜は終日「閉室中」。係の児童はこの間だけ見られる・書ける。
     先生（教職員）はいつでも。
     graceMin は「閉まってからも少しの間は受ける」幅（分）。 */
  var OPEN = {from:8 * 60, to:14 * 60};
  function openAt(ms, graceMin){
    var p = jstParts(ms);
    if(p.wd === 0 || p.wd === 6) return false;
    var m = p.h * 60 + p.mi;
    return m >= OPEN.from && m < OPEN.to + (graceMin || 0);
  }
  /* 次に開閉が切りかわる時刻（ms）。係の画面が境目に予約を掛けるために使う。
     窓の境界（8:00/14:00/休日）はここだけの決まりなので、同じ計算を画面側に
     写させないように本体を置く */
  function nextOpenChange(now){
    var p = jstParts(now);
    var today0 = now - (p.h * 3600 + p.mi * 60 + p.s) * 1000;
    var m = p.h * 60 + p.mi + p.s / 60;
    if(p.wd !== 0 && p.wd !== 6){
      if(m < OPEN.from) return today0 + OPEN.from * 60000;   /* けさの 8:00 */
      if(m < OPEN.to)   return today0 + OPEN.to * 60000;     /* きょうの 14:00 */
    }
    /* あす以降で最初の平日の 8:00 */
    var t = today0, wd = p.wd;
    do{ t += 86400000; wd = (wd + 1) % 7; }while(wd === 0 || wd === 6);
    return t + OPEN.from * 60000;
  }

  /* IPv4 を数値に。読めなければ null（IPv6 はあつかわない） */
  function ip4num(s){
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s || "").trim());
    if(!m) return null;
    var n = 0;
    for(var i = 1; i <= 4; i++){ var o = Number(m[i]); if(o > 255) return null; n = n * 256 + o; }
    return n;
  }
  /* "203.0.113.5, 210.1.2.0/24" みたいな許可リスト（カンマ・空白区切り、
     単体IPとCIDR）に ip が合うか。空のリストは「制限なし」＝ true */
  function ipAllowed(ip, spec){
    spec = String(spec || "").trim();
    if(!spec) return true;
    var n = ip4num(ip);
    if(n == null) return false;
    var ok = false;
    spec.split(/[\s,;、]+/).forEach(function(t){
      if(!t || ok) return;
      var slash = t.indexOf("/");
      if(slash < 0){ if(ip4num(t) === n) ok = true; return; }
      var base = ip4num(t.slice(0, slash)), bits = Number(t.slice(slash + 1));
      if(base == null || !(bits >= 0 && bits <= 32)) return;
      if(bits === 0){ ok = true; return; }
      var mask = (0xFFFFFFFF << (32 - bits)) >>> 0;
      if(((n & mask) >>> 0) === ((base & mask) >>> 0)) ok = true;
    });
    return ok;
  }

  /* 係の期限の上限。学期の終わり（3月末・8月末・12月末）のうち、
     date 以上でいちばん近いものを返す。date は "YYYY-MM-DD" */
  function termEnd(date){
    var y = Number(date.slice(0, 4));
    var ends = [y + "-03-31", y + "-08-31", y + "-12-31", (y + 1) + "-03-31"];
    for(var i = 0; i < ends.length; i++) if(ends[i] >= date) return ends[i];
    return (y + 1) + "-03-31";
  }

  function toInt(v){
    var s = String(v == null ? "" : v);
    if(s.normalize) s = s.normalize("NFKC");
    s = s.trim();
    return /^\d+$/.test(s) ? Number(s) : null;
  }

  /* ── 免除・欠席 ─────────────────────────── */
  function isExempt(exemptions, date, no, slot){
    for(var i = 0; i < exemptions.length; i++){
      var x = exemptions[i];
      if(x.no !== no) continue;
      if(x.slot && x.slot !== slot) continue;
      if(x.from && date < x.from) continue;
      if(x.to && date > x.to) continue;
      return true;
    }
    return false;
  }
  function absentSet(absences, date){
    var s = {};
    absences.forEach(function(a){ if(a.date === date) s[a.no] = true; });
    return s;
  }

  /* ── 1日の表 ───────────────────────────────
     events: [{id,date,no,slot,op:"on"|"rest"|"forgot"|"doing"|"off",at:"stamp",via,seq}]
     戻り値 marks["番号:枠"] = {state, at, via}（記録があるマスだけ。空白に戻したマスは state:""）
     at・via は、いまの状態にした記録のもの */
  function finalMarks(events, date){
    var list = events.filter(function(e){ return e.date === date; });
    list.sort(function(a, b){
      return a.at < b.at ? -1 : a.at > b.at ? 1 : (a.seq || 0) - (b.seq || 0);
    });
    var marks = {};
    list.forEach(function(e){
      var k = e.no + ":" + e.slot;
      var s = e.op === "off" ? "" : e.op;
      if(s && !isState(s)) return;
      marks[k] = {state:s, at:e.at, via:e.via};
    });
    return marks;
  }
  /* 記録が無いマスは、先生が欠席にした子なら「休」。空白なら null */
  function cellState(marks, abs, no, slot){
    var k = no + ":" + slot;
    if(marks[k]) return marks[k].state ? marks[k] : null;
    return abs[no] ? {state:"rest", at:"", via:"absent"} : null;
  }

  /* 係の画面に渡す形。
     cells["番号:枠"] = "on"|"rest"|"forgot"|"doing"（空白は入れない）
     excused は免除のマス。係の画面では ○ と同じ見た目にし、押しても変えない。
     免除の理由（メモ）は渡さない。 */
  function dayView(opts){
    var date = opts.date, items = opts.items, roster = opts.roster;
    var marks = finalMarks(opts.events, date);
    var abs = absentSet(opts.absences, date);
    var cells = {}, excused = {};
    roster.forEach(function(st){
      items.forEach(function(it){
        var k = st.no + ":" + it.slot;
        if(isExempt(opts.exemptions, date, st.no, it.slot)){ excused[k] = 1; return; }
        var m = cellState(marks, abs, st.no, it.slot);
        if(m) cells[k] = m.state;
      });
    });
    return {cells:cells, excused:excused};
  }

  /* 先生の画面に渡す形。理由（欠席・免除）と入力の方法まで持つ */
  function dayDetail(opts){
    var date = opts.date;
    var marks = finalMarks(opts.events, date);
    var abs = absentSet(opts.absences, date);
    var cells = {};
    opts.roster.forEach(function(st){
      opts.items.forEach(function(it){
        var m = cellState(marks, abs, st.no, it.slot);
        cells[st.no + ":" + it.slot] = {
          state: m ? m.state : "", at: m && m.at ? hhmm(stampMinutes(m.at)) : "", via: m ? m.via : "",
          absent: !!abs[st.no],
          exempt: isExempt(opts.exemptions, date, st.no, it.slot)
        };
      });
    });
    return cells;
  }

  /* ── 集計 ─────────────────────────────────
     days: {"2026-09-23":[{slot,name}], …}  提出物が1つ以上ある日だけが数える日
     返すのは児童ごとの
       required  出すべき数（免除と、先生が欠席にした日を除く。
                 係が「休」を付けたマスは数え、提出として扱う）
       submitted 提出として数えた数（○と休）
       rest / forgot / doing  休・忘・△ の数
       rate      submitted / required（required が 0 なら null）
       avgMin / medMin  出した時刻の平均・中央値（先生が後から付けた印は除く）
       streak    いちばん新しい日から数えて、続けて出し忘れた日の数
       flag      rate が目安より低い、または streak が目安以上
       rank / rankForgot / rankTime  クラス内の順位（高い率・少ない忘・早い時刻が先頭。
                 同率は同じ番号。出すべき数が 0 の子・時刻の無い子は対象外）
       perItem[品目名]  その品目だけの絶対値（req/sub/rest/forgot/doing）と
                 平均（rate/avgMin/medMin）と順位（rank）
     あわせてクラス全体の代表値（classAgg）と品目ごとのクラス平均（itemClass）を返す */
  function mean(a){ return a.length ? a.reduce(function(x, y){ return x + y; }, 0) / a.length : null; }
  function median(a){
    if(!a.length) return null;
    var s = a.slice().sort(function(x, y){ return x - y; }), i = Math.floor(s.length / 2);
    return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
  }
  function stats(opts){
    var from = opts.from || "", to = opts.to || "9999-99-99";
    function selected(it){ return !opts.item || it.name === opts.item; }
    var rateMin = opts.rateMin == null ? 0.8 : opts.rateMin;
    var streakMin = opts.streakMin == null ? 3 : opts.streakMin;
    var dates = Object.keys(opts.days).filter(function(d){
      return d >= from && d <= to && opts.days[d].some(selected);
    }).sort();

    var byDate = {};
    opts.events.forEach(function(e){
      if(!byDate[e.date]) byDate[e.date] = [];
      byDate[e.date].push(e);
    });
    var marksByDate = {}, absByDate = {};
    dates.forEach(function(d){
      marksByDate[d] = finalMarks(byDate[d] || [], d);
      absByDate[d] = absentSet(opts.absences, d);
    });

    var itemNames = [];
    var students = opts.roster.map(function(st){
      var req = 0, sub = 0, mins = [], perItem = {}, dayMiss = [];
      var n = {rest:0, forgot:0, doing:0};
      dates.forEach(function(d){
        var dayReq = 0, daySub = 0;
        opts.days[d].forEach(function(it){
          if(!selected(it)) return;
          if(isExempt(opts.exemptions, d, st.no, it.slot)) return;
          var m = cellState(marksByDate[d], absByDate[d], st.no, it.slot);
          if(m && m.via === "absent") return;   /* 欠席の日は出すべき数に入れない */
          var s = m ? m.state : "";
          dayReq++; req++;
          if(!perItem[it.name]){ perItem[it.name] = {req:0, sub:0, rest:0, forgot:0, doing:0, mins:[]};
            if(itemNames.indexOf(it.name) < 0) itemNames.push(it.name); }
          perItem[it.name].req++;
          if(s in n){ n[s]++; perItem[it.name][s]++; }
          if(counts(s)){
            daySub++; sub++; perItem[it.name].sub++;
            if(s === "on" && m.via !== "teacher"){
              var mm = stampMinutes(m.at);
              if(mm != null){ mins.push(mm); perItem[it.name].mins.push(mm); }
            }
          }
        });
        if(dayReq > 0) dayMiss.push({date:d, missed: daySub < dayReq});
      });
      var streak = 0;
      for(var i = dayMiss.length - 1; i >= 0 && dayMiss[i].missed; i--) streak++;
      var rate = req ? sub / req : null;
      var avg = mean(mins), med = median(mins);
      Object.keys(perItem).forEach(function(nm){
        var pi = perItem[nm];
        pi.rate = pi.req ? pi.sub / pi.req : null;
        pi.avgMin = mean(pi.mins); pi.medMin = median(pi.mins);
        pi.avg = hhmm(pi.avgMin); pi.med = hhmm(pi.medMin);
        delete pi.mins;
      });
      var lowRate = rate != null && rate < rateMin;
      var longStreak = streak >= streakMin;
      return {no:st.no, name:st.name, required:req, submitted:sub, rate:rate,
              rest:n.rest, forgot:n.forgot, doing:n.doing,
              avgMin:avg, medMin:med, avg:hhmm(avg), med:hhmm(med),
              streak:streak, perItem:perItem,
              lowRate:lowRate, longStreak:longStreak, flag: lowRate || longStreak};
    });
    /* クラスとの比較・クラス内の順位。出すべき数 0 の子は順位を付けない */
    var ranked = students.filter(function(s){ return s.rate != null; });
    var timed = students.filter(function(s){ return s.avgMin != null; });
    students.forEach(function(s){
      if(s.rate != null){
        s.rank = 1 + ranked.filter(function(o){ return o.rate > s.rate; }).length;
        s.rankForgot = 1 + ranked.filter(function(o){ return o.forgot < s.forgot; }).length;
        if(s.avgMin != null)
          s.rankTime = 1 + timed.filter(function(o){ return o.avgMin < s.avgMin; }).length;
      }
      Object.keys(s.perItem).forEach(function(nm){
        s.perItem[nm].rank = 1 + students.filter(function(o){
          var q = o.perItem[nm]; return q && q.rate != null && q.rate > s.perItem[nm].rate;
        }).length;
      });
    });
    var itemClass = {};
    itemNames.forEach(function(nm){
      var rs = [], avs = [];
      students.forEach(function(s){
        var pi = s.perItem[nm];
        if(!pi) return;
        if(pi.rate != null) rs.push(pi.rate);
        if(pi.avgMin != null) avs.push(pi.avgMin);
      });
      itemClass[nm] = {n:rs.length, rateMean:mean(rs), avgMinMean:mean(avs)};
    });
    var classAgg = {
      n:students.length, rankN:ranked.length, timeN:timed.length,
      rateMean:mean(ranked.map(function(s){ return s.rate; })),
      rateMed:median(ranked.map(function(s){ return s.rate; })),
      timeMean:mean(timed.map(function(s){ return s.avgMin; })),
      timeMed:median(students.map(function(s){ return s.medMin; }).filter(function(v){ return v != null; })),
      forgotMean:mean(students.map(function(s){ return s.forgot; }))
    };
    return {dates:dates, itemNames:itemNames, students:students,
            rateMin:rateMin, streakMin:streakMin, classAgg:classAgg, itemClass:itemClass};
  }

  /* （名簿の貼り付け読み込みは、名簿の正本がスプレッドシートの「名簿」シートに
     確定したので消えた。先生がシートに直接貼るので、サイト内の貼り付けUIは無い） */

  return {
    SLOTS:SLOTS, STATES:STATES, isState:isState, nextState:nextState, counts:counts,
    pad:pad, jstDate:jstDate, jstStamp:jstStamp, jstParts:jstParts,
    stampMinutes:stampMinutes, hhmm:hhmm, isDate:isDate, asDate:asDate, asStamp:asStamp,
    addDays:addDays, weekday:weekday, toInt:toInt, termEnd:termEnd,
    nextSchoolDay:nextSchoolDay, schoolDay:schoolDay,
    OPEN:OPEN, openAt:openAt, nextOpenChange:nextOpenChange,
    ip4num:ip4num, ipAllowed:ipAllowed, mean:mean, median:median,
    isExempt:isExempt, finalMarks:finalMarks, dayView:dayView, dayDetail:dayDetail,
    stats:stats,
    MARKS:MARKS, GLYPH:GLYPH, GLYPH_R:GLYPH_R, OP:OP,
    ITEM_ICONS:ITEM_ICONS, ICON_LABEL:ICON_LABEL,
    ITEM_COLORS:ITEM_COLORS, COLOR_LABEL:COLOR_LABEL,
    SCHEMA:SCHEMA, DEFAULT_ROWS:DEFAULT_ROWS
  };
})();
