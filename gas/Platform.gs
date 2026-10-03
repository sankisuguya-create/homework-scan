/* ==================================================================
   Platform.gs — Apps Script の API に触る唯一の場所。

   Api.gs はシートやキャッシュを直接呼ばず、ここの P.… だけを使う。
   デモ版と手元の検査は、同じ名前の P を別に用意して Api.gs を動かす
   （src/js/mock-platform.js、tests/harness.js）。
================================================================== */
var P = (function(){

  function book(){ return SpreadsheetApp.getActive(); }

  /* ── 呼び出し内メモ ────────────────────────────
     google.script.run の1回は GAS の1実行なので、このオブジェクトのメモは
     その api 呼び出しの中だけで効く（TTL も他端末の影響も持たない、鮮度リスクゼロ）。
     sheet() の解決と rows() の内容を覚え、書き込み系はメモ内データも同時に直す
     ——書いた直後の同じ呼び出しでの再読も RPC なしで済む。 */
  var memo = {sheet:{}, data:{}};
  function mkey(name, w){ return name + "|" + w; }
  function normRow(row, w){
    var out = [];
    for(var i = 0; i < w; i++) out.push(row[i] == null ? "" : String(row[i]));
    return out;
  }
  /* name のメモ済み行データ（幅ごとに別口）を、書き込んだ内容に合わせて直す */
  function memoSync(name, fn){
    Object.keys(memo.data).forEach(function(k){
      if(k.indexOf(name + "|") === 0) fn(memo.data[k], Number(k.slice(name.length + 1)));
    });
  }

  /* シートが無ければ見出し付きで作る。列は文字として持つ（日付の自動変換を止める）。
     スキーマより狭い既存のシートは、列を足して見出しを書き直す（＝表の定義を変えたときの移行） */
  function sheet(name){
    var head = Domain.SCHEMA[name];   /* 表の定義は Domain が正本 */
    if(!head) throw new Error("知らない表: " + name);
    if(memo.sheet[name]) return memo.sheet[name];
    var ss = book(), sh = ss.getSheetByName(name);
    if(!sh){
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight("bold");
      sh.getRange(1, 1, sh.getMaxRows(), head.length).setNumberFormat("@");
      sh.setFrozenRows(1);
      var defs = Domain.DEFAULT_ROWS[name];
      if(defs) sh.getRange(2, 1, defs.length, head.length).setValues(defs);
    }else{
      var hasHead = sh.getRange(1, 1, 1, head.length).getValues()[0];
      if(String(hasHead[head.length - 1]) === ""){
        if(sh.getMaxColumns() < head.length) sh.insertColumnsAfter(sh.getMaxColumns(), head.length - sh.getMaxColumns());
        sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight("bold");
      }
    }
    memo.sheet[name] = sh;
    return sh;
  }

  function width(name){ return Domain.SCHEMA[name].length; }

  function rows(name){
    var k = mkey(name, width(name));
    if(memo.data[k]) return memo.data[k];
    var sh = sheet(name), n = sh.getLastRow() - 1;
    var r = n < 1 ? [] : sh.getRange(2, 1, n, width(name)).getValues();
    memo.data[k] = r;
    return r;
  }
  function tail(name, count){
    var sh = sheet(name), last = sh.getLastRow(), n = Math.min(count, last - 1);
    if(n < 1) return [];
    return sh.getRange(last - n + 1, 1, n, width(name)).getValues();
  }
  /* 先頭 n 列だけ読む（「記録」の日付索引など、行を絞るための軽いスキャン）。
     幅ごとにメモに乗るので、同じ呼び出しで二度読まない */
  function cols(name, n){
    var w = width(name);
    if(n >= w) return rows(name);
    var k = mkey(name, n);
    if(memo.data[k]) return memo.data[k];
    var sh = sheet(name), last = sh.getLastRow() - 1;
    var r = last < 1 ? [] : sh.getRange(2, 1, last, n).getValues();
    memo.data[k] = r;
    return r;
  }
  /* 指定したデータ行（0起きの添字の並び）だけ取り、{添字: 行} で返す。
     連続する添字はひと続きの getRange に束ねる。全幅メモがあればそこから切る */
  function rowsAt(name, idx){
    var out = {}, w = width(name), t = memo.data[mkey(name, w)];
    if(t){
      idx.forEach(function(i){ out[i] = t[i] ? t[i].slice() : null; });
      return out;
    }
    var ord = idx.slice().sort(function(a, b){ return a - b; }), p = 0;
    while(p < ord.length){
      var q = p;
      while(q + 1 < ord.length && ord[q + 1] === ord[q] + 1) q++;
      var n = ord[q] - ord[p] + 1;
      var vals = sheet(name).getRange(ord[p] + 2, 1, n, w).getValues();
      for(var j = 0; j < n; j++) out[ord[p] + j] = vals[j];
      p = q + 1;
    }
    return out;
  }
  function append(name, list){
    if(!list.length) return;
    var sh = sheet(name), w = width(name);
    var r = sh.getLastRow() + 1;
    var rng = sh.getRange(r, 1, list.length, w);
    rng.setNumberFormat("@");
    rng.setValues(list.map(function(row){ return normRow(row, w); }));
    dropCache(name);
    memoSync(name, function(arr, w){
      for(var i = 0; i < list.length; i++) arr.push(normRow(list[i], w));
    });
  }
  /* startIdx から連続するデータ行をまとめて書きかえる（1回の setValues） */
  function putRows(name, startIdx, list){
    if(!list.length) return;
    var sh = sheet(name), w = width(name);
    var rng = sh.getRange(startIdx + 2, 1, list.length, w);
    rng.setNumberFormat("@");
    rng.setValues(list.map(function(row){ return normRow(row, w); }));
    dropCache(name);
    memoSync(name, function(arr, w){
      for(var i = 0; i < list.length; i++) arr[startIdx + i] = normRow(list[i], w);
    });
  }
  function replace(name, list){
    var sh = sheet(name), w = width(name), last = sh.getLastRow();
    if(last > 1) sh.getRange(2, 1, last - 1, w).clearContent();
    dropCache(name);
    memoSync(name, function(arr){ arr.length = 0; });
    append(name, list);
  }

  function cache(){ return CacheService.getScriptCache(); }
  function cacheGet(key){ return cache().get(key); }
  function cachePut(key, val, sec){ cache().put(key, String(val), sec); }
  function cacheDel(key){ cache().remove(key); }

  /* キャッシュする表（小さくて変化の少ないもの）。係端末が15秒ごとに同じ表を
     読みに来るので、90秒のあいだはシートを読まない。書き込みは必ずここを通るので
     append/replace/putRows がキャッシュを消す（シートを直接いじったときだけ
     最大90秒の遅れが出る。これは許容する）。記録・欠席・操作記録は載せない。 */
  var CACHED = {"名簿":1, "品目":1, "設定":1, "免除":1, "係":1, "日の品目":1};
  function dropCache(name){ if(CACHED[name]) try{ cacheDel("t:" + name); }catch(err){} }
  function cachedRows(name, reader, raw){
    if(raw) return reader();
    var key = "t:" + name, hit = null;
    try{ hit = cacheGet(key); }catch(err){}
    if(hit != null){ try{ return JSON.parse(hit); }catch(err){} }
    var r = reader();
    try{ cachePut(key, JSON.stringify(r), 90); }catch(err){}
    return r;
  }

  function lock(fn){
    var l = LockService.getScriptLock();
    l.waitLock(20000);
    try{ return fn(); } finally { l.releaseLock(); }
  }

  function now(){ return Date.now(); }
  function sheetUrl(){ try{ return book().getUrl() || ""; }catch(err){ return ""; } }

  return {rows:rows, tail:tail, cols:cols, rowsAt:rowsAt,
          append:append, replace:replace, putRows:putRows, cachedRows:cachedRows,
          cacheGet:cacheGet, cachePut:cachePut, cacheDel:cacheDel,
          lock:lock, now:now, sheetUrl:sheetUrl,
          who:function(){ return Gate.checkAny(); }};
})();

/* 最初に1回、Apps Script エディタから実行する。表を全部作る。 */
function setupSheets(){
  Object.keys(Domain.SCHEMA).forEach(function(name){ P.rows(name); });
  var first = SpreadsheetApp.getActive().getSheetByName("シート1");
  if(first && first.getLastRow() === 0 && SpreadsheetApp.getActive().getSheets().length > 1)
    SpreadsheetApp.getActive().deleteSheet(first);
}

/* ------------------------------------------------------------------
   入口。通らない人には画面もデータも渡さない。
------------------------------------------------------------------ */
function doGet(e){
  var w = Gate.who();
  if(w.role === "none") return Gate.denyPage(w);
  var q = (e && e.parameter) || {};
  var view = (w.role === "staff" && q.view === "teacher") ? "teacher" : "helper";
  try{ log(view === "teacher" ? "先生の画面を開いた" : "係の画面を開いた", "", w.email); }catch(err){}
  var t = HtmlService.createTemplateFromFile("Index");
  t.boot = JSON.stringify({view:view, role:w.role, v:API_VER});
  return t.evaluate()
    .setTitle("宿題チェック")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
