/* デモ版と手元の検査で使う P（Platform.gs の代わり）。
   表は配列のまま持ち、ブラウザでは localStorage に残す。 */
var P = (function(){
  var KEY = "homework-scan/demo-v1";
  var hasLS = (function(){ try{ return typeof localStorage !== "undefined" && !!localStorage; }catch(e){ return false; } })();
  var db = load();
  var offset = 0;

  function fresh(){
    var t = {};
    Object.keys(TABLES).forEach(function(n){
      t[n] = (DEFAULT_ROWS[n] || []).map(function(r){ return r.map(String); });
    });
    return {tables:t, props:{}, cache:{}};
  }
  function load(){
    if(hasLS){
      try{ var s = localStorage.getItem(KEY); if(s) return JSON.parse(s); }catch(e){}
    }
    return fresh();
  }
  function save(){ if(hasLS){ try{ localStorage.setItem(KEY, JSON.stringify(db)); }catch(e){} } }
  function table(n){
    if(!TABLES[n]) throw new Error("知らない表: " + n);
    if(!db.tables[n]) db.tables[n] = [];
    return db.tables[n];
  }
  function copy(rows){ return rows.map(function(r){ return r.slice(); }); }
  function norm(n, row){
    var out = [];
    for(var i = 0; i < TABLES[n].length; i++) out.push(row[i] == null ? "" : String(row[i]));
    return out;
  }

  var api = {
    rows: function(n){ return copy(table(n)); },
    tail: function(n, c){ var t = table(n); return copy(t.slice(Math.max(0, t.length - c))); },
    append: function(n, list){ var t = table(n); list.forEach(function(r){ t.push(norm(n, r)); }); save(); },
    replace: function(n, list){ db.tables[n] = list.map(function(r){ return norm(n, r); }); save(); },
    prop: function(k){ return db.props[k] == null ? null : db.props[k]; },
    setProp: function(k, v){ db.props[k] = String(v); save(); },
    cacheGet: function(k){
      var c = db.cache[k];
      if(!c) return null;
      if(c.until < api.now()){ delete db.cache[k]; save(); return null; }
      return c.v;
    },
    cachePut: function(k, v, sec){ db.cache[k] = {v:String(v), until: api.now() + sec * 1000}; save(); },
    cacheDel: function(k){ delete db.cache[k]; save(); },
    lock: function(fn){ return fn(); },
    now: function(){ return Date.now() + offset; },
    uuid: function(){
      var s = "";
      for(var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
      return s.slice(0, 8) + "-" + s.slice(8, 12) + "-" + s.slice(12, 16) + "-" + s.slice(16, 20) + "-" + s.slice(20);
    },
    hash: function(s){
      var h1 = 0x811c9dc5, h2 = 0x01000193;
      for(var i = 0; i < s.length; i++){
        h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
        h2 = Math.imul(h2 + s.charCodeAt(i), 2246822519) >>> 0;
      }
      return h1.toString(16) + h2.toString(16);
    },
    url: function(){ return ""; },
    email: function(){ return Gate.check().email; },

    /* 検査とデモのための口。本物の Platform.gs には無い */
    _reset: function(){ db = fresh(); save(); },
    _setNow: function(ms){ offset = ms - Date.now(); },
    _db: function(){ return db; },
    _empty: function(){ return !db.tables["名簿"] || db.tables["名簿"].length === 0; }
  };
  return api;
})();

var Gate = (typeof Gate !== "undefined") ? Gate : {
  check: function(){ return {ok:true, email:"demo@edu.nishi.or.jp"}; },
  who: function(){ return {role:"staff", email:"demo@edu.nishi.or.jp", code:""}; },
  checkAny: function(){ return {role:"staff", email:"demo@edu.nishi.or.jp", code:""}; },
  norm: function(raw){
    var e = String(raw == null ? "" : raw);
    return e.trim().toLowerCase();
  }
};
