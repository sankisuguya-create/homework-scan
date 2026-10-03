/* デモ版と手元の検査で使う P（Platform.gs の代わり）。
   表は配列のまま持ち、ブラウザでは localStorage に残す。 */
var P = (function(){
  var KEY = "homework-scan/demo-v1";
  var hasLS = (function(){ try{ return typeof localStorage !== "undefined" && !!localStorage; }catch(e){ return false; } })();
  var db = load();
  var offset = 0;

  function fresh(){
    var t = {};
    Object.keys(Domain.SCHEMA).forEach(function(n){
      t[n] = (Domain.DEFAULT_ROWS[n] || []).map(function(r){ return r.map(String); });
    });
    return {tables:t, cache:{}};
  }
  function load(){
    if(hasLS){
      try{ var s = localStorage.getItem(KEY); if(s) return JSON.parse(s); }catch(e){}
    }
    return fresh();
  }
  function save(){ if(hasLS){ try{ localStorage.setItem(KEY, JSON.stringify(db)); }catch(e){} } }
  function table(n){
    if(!Domain.SCHEMA[n]) throw new Error("知らない表: " + n);
    if(!db.tables[n]) db.tables[n] = [];
    return db.tables[n];
  }
  function copy(rows){ return rows.map(function(r){ return r.slice(); }); }
  function norm(n, row){
    var out = [];
    for(var i = 0; i < Domain.SCHEMA[n].length; i++) out.push(row[i] == null ? "" : String(row[i]));
    return out;
  }

  /* Platform.gs の呼び出し内メモの鏡。_setMemo(false) で止めて、
     メモ経路の応答が非経路と一致することを検査できるようにする */
  var memo = {data:{}}, memoOn = true;
  function rmemo(n, w){
    var k = n + "|" + w;
    if(memoOn && memo.data[k]) return memo.data[k];
    var r = table(n).map(function(row){ return row.slice(0, w); });
    if(memoOn) memo.data[k] = r;
    return r;
  }
  /* 書き込み後は db が正本なので、メモ済みの幅ごとの口を db で引き直す */
  function memoPull(n){
    if(!memoOn) return;
    Object.keys(memo.data).forEach(function(k){
      if(k.indexOf(n + "|") !== 0) return;
      var w = Number(k.slice(n.length + 1)), arr = memo.data[k], t = table(n);
      arr.length = 0;
      for(var i = 0; i < t.length; i++) arr.push(t[i].slice(0, w));
    });
  }

  /* Platform.gs の CACHED と同じ表。書き込み時にキャッシュを消す */
  var CACHED = {"名簿":1, "品目":1, "設定":1, "免除":1, "係":1, "日の品目":1};
  var cacheOn = true;
  function dropCache(n){ if(CACHED[n]) delete db.cache["t:" + n]; }

  var api = {
    cachedRows: function(n, reader, raw){
      if(raw || !cacheOn) return reader();
      var key = "t:" + n, hit = api.cacheGet(key);
      if(hit != null){ try{ return JSON.parse(hit); }catch(e){} }
      var r = reader();
      api.cachePut(key, JSON.stringify(r), 90);
      return r;
    },
    rows: function(n){ return rmemo(n, Domain.SCHEMA[n].length); },
    cols: function(n, w){ return rmemo(n, Math.min(w, Domain.SCHEMA[n].length)); },
    rowsAt: function(n, idx){
      var t = rmemo(n, Domain.SCHEMA[n].length), out = {};
      idx.forEach(function(i){ out[i] = t[i] ? t[i].slice() : null; });
      return out;
    },
    tail: function(n, c){ var t = table(n); return copy(t.slice(Math.max(0, t.length - c))); },
    /* 実機どおり: メモ配列は rows() の返り値そのものなので、渡された配列を
       消してから読む順番にすると、rows() を渡した呼び出し側の中身まで消える。
       本物 Platform.gs と同じバグをここで再現できるように順序をそろえる */
    append: function(n, list){
      var cp = list.slice(), t = table(n);
      cp.forEach(function(r){ t.push(norm(n, r)); });
      dropCache(n); save(); memoPull(n);
    },
    replace: function(n, list){
      var cp = list.slice();
      table(n).length = 0;
      Object.keys(memo.data).forEach(function(k){
        if(k.indexOf(n + "|") === 0) memo.data[k].length = 0;
      });
      cp.forEach(function(r){ table(n).push(norm(n, r)); });
      dropCache(n); save(); memoPull(n);
    },
    putRows: function(n, startIdx, list){
      for(var i = 0; i < list.length; i++) db.tables[n][startIdx + i] = norm(n, list[i]);
      dropCache(n); save(); memoPull(n);
    },
    cacheGet: function(k){
      if(!cacheOn) return null;
      var c = db.cache[k];
      if(!c) return null;
      if(c.until < api.now()){ delete db.cache[k]; save(); return null; }
      return c.v;
    },
    cachePut: function(k, v, sec){ if(!cacheOn) return; db.cache[k] = {v:String(v), until: api.now() + sec * 1000}; save(); },
    cacheDel: function(k){ delete db.cache[k]; save(); },
    lock: function(fn){ return fn(); },
    now: function(){ return Date.now() + offset; },
    sheetUrl: function(){ return ""; },
    who: function(){ return Gate.checkAny(); },

    /* 検査とデモのための口。本物の Platform.gs には無い */
    _reset: function(){ db = fresh(); memo.data = {}; memoOn = true; cacheOn = true; save(); },
    _setMemo: function(on){ memoOn = !!on; if(!memoOn) memo.data = {}; },
    _setCache: function(on){ cacheOn = !!on; },
    _setNow: function(ms){ offset = ms - Date.now(); },
    _db: function(){ return db; },
    _empty: function(){ return !db.tables["名簿"] || db.tables["名簿"].length === 0; }
  };
  return api;
})();

var Gate = (typeof Gate !== "undefined") ? Gate : {
  who: function(){ return {role:"staff", email:"demo@edu.nishi.or.jp", code:""}; },
  checkAny: function(){ return {role:"staff", email:"demo@edu.nishi.or.jp", code:""}; },
  norm: function(raw){
    var e = String(raw == null ? "" : raw);
    return e.trim().toLowerCase();
  }
};
