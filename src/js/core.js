/* 共通の道具：サーバ呼び出し・文字の逃がし・音・トースト */

/* 画面が期待するサーバの版。gas/Api.gs の API_VER と数を揃える。
   デプロイはファイル一式の手貼りなので、片方だけ古いまま動き続けることがある。
   応答の v が合わなければ、両画面に「貼り直してほしい」帯を出す */
var WANT_VER = 1;
var _verWarned = false;
function verWarn(){
  if(_verWarned) return;
  _verWarned = true;
  var staff = typeof BOOT !== "undefined" && BOOT.role === "staff";
  var d = document.createElement("div");
  d.className = "verwarn";
  d.setAttribute("role", "alert");
  d.innerHTML = icon("alert") + "<span>" + esc(staff
    ? "サーバと画面のファイルの版が合っていません。Index.html と .gs の4ファイルを一式そろえて貼り直してください。"
    : "アプリの ばんが あっていません。先生に つたえてください。") + "</span>";
  document.body.appendChild(d);
}
function verCheck(r){
  if(r && typeof r === "object" && typeof r.v === "number" && r.v !== WANT_VER) verWarn();
}

function call(name){
  var args = Array.prototype.slice.call(arguments, 1);
  return new Promise(function(resolve, reject){
    var r = google.script.run.withSuccessHandler(function(v){ verCheck(v); resolve(v); })
      .withFailureHandler(reject);
    r[name].apply(r, args);
  });
}
function errText(err){
  var m = String(err && err.message || err || "");
  if(/network|NetworkError|Failed to fetch|通信/i.test(m)) return "つながりませんでした。少しして、もう一度ためしてください。";
  var t = m.replace(/^Error:\s*/, "").slice(0, 120);
  /* 日本語の入っていないメッセージ（GAS内部エラー等）は読み手に伝わらないので畳む */
  if(t && !/[ぁ-んァ-ヶ一-龥]/.test(t)) t = "";
  return t || "うまくいきませんでした。もう一度ためしてください。";
}

function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c];
  });
}
function $(sel, root){ return (root || document).querySelector(sel); }
function $$(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

function dateLabel(date, wd){
  var p = String(date).split("-");
  return Number(p[1]) + "月" + Number(p[2]) + "日（" + (wd || Domain.weekday(date)) + "）";
}

/* 短い音。出した＝高い音1回、とりけし＝低い音、押せない＝低い音2回 */
var Sound = (function(){
  var ctx = null;
  function beep(freq, ms, when){
    try{
      if(!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      var t = ctx.currentTime + (when || 0);
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
    }catch(e){}
  }
  return {
    ok: function(){ beep(1175, 120); },
    tick: function(){ beep(784, 90); },
    undo: function(){ beep(523, 160); },
    no: function(){ beep(330, 110); beep(330, 110, 0.16); }
  };
})();

function toast(msg, ng){
  var old = $(".toast"); if(old) old.remove();
  var t = document.createElement("div");
  t.className = "toast" + (ng ? " ng" : "");
  t.setAttribute("role", "status");
  t.innerHTML = icon(ng ? "alert" : "check") + "<span>" + esc(msg) + "</span>";
  document.body.appendChild(t);
  setTimeout(function(){ t.remove(); }, ng ? 5000 : 2200);
}
