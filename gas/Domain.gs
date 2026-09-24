/* ==================================================================
   Domain.gs — 宿題チェックの決まりごと。副作用なし。

   シートも Apps Script の API も触らない。だから同じファイルを
     ・Apps Script（Api.gs から呼ぶ）
     ・デモ版（dist/demo.html に差し込む）
     ・手元の検査（node tests/domain.test.js）
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

  /* 係の画面を使える時刻（日本時間）。8:00 から 14:00 まで。
     係の児童はこの間だけ見られる・書ける。先生（教職員）はいつでも。
     graceMin は「閉まってからも少しの間は受ける」幅（分）。 */
  var OPEN = {from:8 * 60, to:14 * 60};
  function openAt(ms, graceMin){
    var p = jstParts(ms), m = p.h * 60 + p.mi;
    return m >= OPEN.from && m < OPEN.to + (graceMin || 0);
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
       flag      rate が目安より低い、または streak が目安以上 */
  function stats(opts){
    var from = opts.from || "", to = opts.to || "9999-99-99";
    var rateMin = opts.rateMin == null ? 0.8 : opts.rateMin;
    var streakMin = opts.streakMin == null ? 3 : opts.streakMin;
    var dates = Object.keys(opts.days).filter(function(d){
      return d >= from && d <= to && opts.days[d].length > 0;
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
          if(isExempt(opts.exemptions, d, st.no, it.slot)) return;
          var m = cellState(marksByDate[d], absByDate[d], st.no, it.slot);
          if(m && m.via === "absent") return;   /* 欠席の日は出すべき数に入れない */
          var s = m ? m.state : "";
          dayReq++; req++;
          if(!perItem[it.name]){ perItem[it.name] = {req:0, sub:0}; if(itemNames.indexOf(it.name) < 0) itemNames.push(it.name); }
          perItem[it.name].req++;
          if(s in n) n[s]++;
          if(counts(s)){
            daySub++; sub++; perItem[it.name].sub++;
            if(s === "on" && m.via !== "teacher"){
              var mm = stampMinutes(m.at);
              if(mm != null) mins.push(mm);
            }
          }
        });
        if(dayReq > 0) dayMiss.push({date:d, missed: daySub < dayReq});
      });
      var streak = 0;
      for(var i = dayMiss.length - 1; i >= 0 && dayMiss[i].missed; i--) streak++;
      var rate = req ? sub / req : null;
      var avg = mins.length ? mins.reduce(function(a, b){ return a + b; }, 0) / mins.length : null;
      var sorted = mins.slice().sort(function(a, b){ return a - b; });
      var med = null;
      if(sorted.length){
        var h = Math.floor(sorted.length / 2);
        med = sorted.length % 2 ? sorted[h] : (sorted[h - 1] + sorted[h]) / 2;
      }
      var lowRate = rate != null && rate < rateMin;
      var longStreak = streak >= streakMin;
      return {no:st.no, name:st.name, required:req, submitted:sub, rate:rate,
              rest:n.rest, forgot:n.forgot, doing:n.doing,
              avgMin:avg, medMin:med, avg:hhmm(avg), med:hhmm(med),
              streak:streak, perItem:perItem,
              lowRate:lowRate, longStreak:longStreak, flag: lowRate || longStreak};
    });
    return {dates:dates, itemNames:itemNames, students:students,
            rateMin:rateMin, streakMin:streakMin};
  }

  /* ── 名簿の貼り付け ───────────────────────
     スプレッドシートから範囲をコピーした文字（タブ区切り）を読む。
     1行ごとに「数字だけのマス＝番号」「最初の数字でないマス＝氏名」。
     番号が無い行ばかりなら、上から 1, 2, 3… を振る。
     氏名が無い行（見出し・空行）は捨てる。 */
  var HEAD = /^(番号|出席番号|氏名|名前|なまえ|児童名|No\.?)$/i;
  function parseRoster(text){
    var rows = [];
    String(text || "").split(/\r?\n/).forEach(function(line){
      if(!line.trim()) return;
      var cells = line.split(line.indexOf("\t") >= 0 ? "\t" : ",").map(function(c){
        c = c.trim(); return c.normalize ? c.normalize("NFKC") : c;
      });
      var no = null, name = "";
      cells.forEach(function(c){
        if(!c) return;
        var n = toInt(c);
        if(n != null){ if(no == null) no = n; }
        else if(!name && !HEAD.test(c)) name = c.replace(/\s+/g, " ");
      });
      if(name) rows.push({no:no, name:name});
    });
    var numbered = rows.filter(function(r){ return r.no != null && r.no > 0; }).length;
    if(numbered < rows.length){
      rows.forEach(function(r, i){ r.no = i + 1; });
    }
    var seen = {}, out = [];
    rows.forEach(function(r){
      if(r.no < 1 || r.no > 99 || seen[r.no]) return;
      seen[r.no] = true; out.push(r);
    });
    out.sort(function(a, b){ return a.no - b.no; });
    return out;
  }

  return {
    SLOTS:SLOTS, STATES:STATES, isState:isState, nextState:nextState, counts:counts,
    pad:pad, jstDate:jstDate, jstStamp:jstStamp, jstParts:jstParts,
    stampMinutes:stampMinutes, hhmm:hhmm, isDate:isDate, asDate:asDate, asStamp:asStamp,
    addDays:addDays, weekday:weekday, toInt:toInt, termEnd:termEnd,
    OPEN:OPEN, openAt:openAt,
    isExempt:isExempt, finalMarks:finalMarks, dayView:dayView, dayDetail:dayDetail,
    stats:stats, parseRoster:parseRoster
  };
})();
