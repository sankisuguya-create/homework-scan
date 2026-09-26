/* ==================================================================
   Platform.gs — Apps Script の API に触る唯一の場所。

   Api.gs はシートやキャッシュを直接呼ばず、ここの P.… だけを使う。
   デモ版と手元の検査は、同じ名前の P を別に用意して Api.gs を動かす
   （src/js/mock-platform.js、tests/harness.js）。
================================================================== */
var P = (function(){

  function book(){ return SpreadsheetApp.getActive(); }

  /* シートが無ければ見出し付きで作る。列は文字として持つ（日付の自動変換を止める）。
     スキーマより狭い既存のシートは、列を足して見出しを書き直す（＝表の定義を変えたときの移行） */
  function sheet(name){
    var head = TABLES[name];
    if(!head) throw new Error("知らない表: " + name);
    var ss = book(), sh = ss.getSheetByName(name);
    if(!sh){
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight("bold");
      sh.getRange(1, 1, sh.getMaxRows(), head.length).setNumberFormat("@");
      sh.setFrozenRows(1);
      if(DEFAULT_ROWS[name]) sh.getRange(2, 1, DEFAULT_ROWS[name].length, head.length).setValues(DEFAULT_ROWS[name]);
    }else{
      var hasHead = sh.getRange(1, 1, 1, head.length).getValues()[0];
      if(String(hasHead[head.length - 1]) === ""){
        if(sh.getMaxColumns() < head.length) sh.insertColumnsAfter(sh.getMaxColumns(), head.length - sh.getMaxColumns());
        sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight("bold");
      }
    }
    return sh;
  }

  function width(name){ return TABLES[name].length; }

  function rows(name){
    var sh = sheet(name), n = sh.getLastRow() - 1;
    if(n < 1) return [];
    return sh.getRange(2, 1, n, width(name)).getValues();
  }
  function tail(name, count){
    var sh = sheet(name), last = sh.getLastRow(), n = Math.min(count, last - 1);
    if(n < 1) return [];
    return sh.getRange(last - n + 1, 1, n, width(name)).getValues();
  }
  function append(name, list){
    if(!list.length) return;
    var sh = sheet(name), w = width(name);
    var r = sh.getLastRow() + 1;
    var rng = sh.getRange(r, 1, list.length, w);
    rng.setNumberFormat("@");
    rng.setValues(list.map(function(row){
      var out = [];
      for(var i = 0; i < w; i++) out.push(row[i] == null ? "" : String(row[i]));
      return out;
    }));
  }
  /* データ行 i（0 起き＝シートの i+2 行目）をまるごと書きかえる */
  function put(name, i, row){
    var sh = sheet(name), w = width(name), out = [];
    for(var k = 0; k < w; k++) out.push(row[k] == null ? "" : String(row[k]));
    var rng = sh.getRange(i + 2, 1, 1, w);
    rng.setNumberFormat("@");
    rng.setValues([out]);
  }
  function replace(name, list){
    var sh = sheet(name), w = width(name), last = sh.getLastRow();
    if(last > 1) sh.getRange(2, 1, last - 1, w).clearContent();
    append(name, list);
  }

  function prop(key){ return PropertiesService.getScriptProperties().getProperty(key); }
  function setProp(key, val){ PropertiesService.getScriptProperties().setProperty(key, val); }

  function cache(){ return CacheService.getScriptCache(); }
  function cacheGet(key){ return cache().get(key); }
  function cachePut(key, val, sec){ cache().put(key, String(val), sec); }
  function cacheDel(key){ cache().remove(key); }

  function lock(fn){
    var l = LockService.getScriptLock();
    l.waitLock(20000);
    try{ return fn(); } finally { l.releaseLock(); }
  }

  function now(){ return Date.now(); }
  function uuid(){ return Utilities.getUuid(); }
  function hash(s){
    var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
    return b.map(function(x){ return ((x + 256) % 256).toString(16).replace(/^(.)$/, "0$1"); }).join("");
  }
  function url(){ try{ return ScriptApp.getService().getUrl() || ""; }catch(err){ return ""; } }
  function sheetUrl(){ try{ return book().getUrl() || ""; }catch(err){ return ""; } }

  return {rows:rows, tail:tail, append:append, replace:replace, put:put,
          prop:prop, setProp:setProp, cacheGet:cacheGet, cachePut:cachePut, cacheDel:cacheDel,
          lock:lock, now:now, uuid:uuid, hash:hash, url:url, sheetUrl:sheetUrl,
          who:function(){ return Gate.checkAny(); }};
})();

/* 最初に1回、Apps Script エディタから実行する。表を全部作る。 */
function setupSheets(){
  Object.keys(TABLES).forEach(function(name){ P.rows(name); });
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
  t.boot = JSON.stringify({view:view, role:w.role, url:P.url()});
  return t.evaluate()
    .setTitle("宿題チェック")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
