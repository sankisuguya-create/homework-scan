/* 共通の道具：サーバ呼び出し・文字の逃がし・音・トースト */

function call(name){
  var args = Array.prototype.slice.call(arguments, 1);
  return new Promise(function(resolve, reject){
    var r = google.script.run.withSuccessHandler(resolve).withFailureHandler(reject);
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
