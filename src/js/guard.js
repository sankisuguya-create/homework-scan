/* ==================================================================
   全画面の見張り。係の画面は全画面の中でだけ見せる。

   ■ 開き方は2通り
     launcher … 教室 PC に置いた起動用ファイル（launcher.html）の中で動く。
                全画面とキーの横取り（Esc 短押し・Alt+Tab など）は起動用ファイルが受け持つ。
     direct   … GAS の URL を直接開いた。全画面にはできるが、Esc 1回で外れる。
   ■ 全画面が外れたら表を隠し「先生を よんでね」にする。
     先生が暗証番号を入れるまで、表には戻らない。外れた時刻は操作記録に残す。
   ■ 係の画面を終えるのも、先生の暗証番号のあとだけ。

   ブラウザの決まりで、Esc の長押し（約2秒）だけは止められない。
   そのときも上のとおり表を隠すので、係の児童が他の画面を見ることはできても、
   表を触ったり先生の画面に入ったりはできない。
================================================================== */
var Guard = (function(){
  var mode = "direct";
  var state = "start";      /* start | running | away | teacher | finished */
  var finishing = false, app = null, idle = null;
  var IDLE_MS = 5 * 60 * 1000;

  function log(kind, detail){ call("apiLog", kind, detail || "").catch(function(){}); }
  function toTop(msg){ try{ window.top.postMessage(msg, "*"); }catch(e){} }

  function detect(){
    return new Promise(function(resolve){
      if(window.top === window){ resolve(false); return; }
      var done = false;
      function on(e){
        if(e.source === window.top && e.data && e.data.hs === "launcher"){
          done = true; window.removeEventListener("message", on); resolve(e.data);
        }
      }
      window.addEventListener("message", on);
      toTop({hs:"hello"});
      setTimeout(function(){ if(!done){ window.removeEventListener("message", on); resolve(false); } }, 900);
    });
  }

  function fsNow(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function enterDirect(){
    var el = document.documentElement;
    var f = el.requestFullscreen || el.webkitRequestFullscreen;
    if(!f) return Promise.reject(new Error("no fullscreen"));
    try{ return Promise.resolve(f.call(el, {navigationUI:"hide"})); }catch(e){ return Promise.reject(e); }
  }
  function exitDirect(){
    var f = document.exitFullscreen || document.webkitExitFullscreen;
    if(f && fsNow()) try{ f.call(document); }catch(e){}
  }

  /* ── 画面 ── */
  function cover(html){
    var c = $(".cover");
    if(!c){ c = document.createElement("div"); c.className = "cover"; document.body.appendChild(c); }
    c.innerHTML = html;
    return c;
  }
  function uncover(){ var c = $(".cover"); if(c) c.remove(); }

  function showStart(){
    state = "start";
    Helper.unmount(); Teacher.unmount();
    uncover();
    var launched = mode === "launcher";
    app.innerHTML = '<div class="start">'
      + '<h1>' + icon("check") + 'しゅくだい チェック</h1>'
      + '<p>係の画面は 全画面で ひらきます。</p>'
      + '<button class="btn big primary" data-g="go">' + icon("expand") + 'はじめる</button>'
      + '<div class="line" style="justify-content:center">'
      +   '<button class="btn" data-g="teacher">' + icon("lock") + '先生の画面</button>'
      +   '<button class="btn" data-g="nofs">' + icon("hand") + '全画面に しないで ひらく</button>'
      + '</div>'
      + (launched ? '' : '<p class="note" style="max-width:36em">この開き方では、Esc キーで全画面が外れます（外れると表が隠れ、先生の暗証番号が要ります）。'
                       + '教室の PC では、先生の画面の「せってい」から保存できる起動用ファイルで開くと、外れにくくなります。</p>')
      + '</div>';
  }

  function run(){
    state = "running"; finishing = false;
    Teacher.unmount(); uncover();
    Helper.mount(app);
  }

  function away(){
    if(state === "away" || state === "start" || state === "finished") return;
    state = "away";
    Helper.unmount(); Teacher.unmount();
    Token.clear();
    app.innerHTML = "";
    log("leave");
    cover('<div>' + icon("bell", "hero") + '</div><h1>先生を よんでね</h1>'
      + '<p>全画面が 外れました。先生が 暗証番号を 入れると、もとに もどります。</p>'
      + '<button class="btn big" data-g="unlock-away">' + icon("lock") + '先生</button>');
  }

  function start(){
    if(mode === "launcher"){ toTop({hs:"enter"}); return; }
    enterDirect().then(function(){ log("start"); run(); }, function(){
      toast("全画面に できませんでした。このまま ひらきます", true);
      run();
    });
  }

  function resume(){
    if(mode === "launcher"){ toTop({hs:"enter"}); return; }
    enterDirect().then(function(){ log("resume"); run(); }, function(){
      toast("全画面に できませんでした", true);
    });
  }

  function finish(){
    finishing = true;
    Token.clear();
    log("finish");
    Helper.unmount(); Teacher.unmount();
    if(mode === "launcher"){ toTop({hs:"exit"}); state = "finished"; app.innerHTML = ""; return; }
    exitDirect();
    showStart();
  }

  /* 先生の画面（係の画面の中から開いたとき）。しばらく触らなければ係の画面に戻る */
  function openTeacher(standalone){
    state = "teacher";
    Helper.unmount(); uncover();
    Teacher.mount(app, {
      standalone: !!standalone,
      back: standalone ? function(){ Token.clear(); showStart(); } : backToHelper,
      backLabel: standalone ? "もどる" : "係の画面に もどる"
    });
    armIdle();
  }
  function backToHelper(){
    Token.clear();
    if(mode === "direct" && !fsNow()){ showStart(); return; }
    run();
  }
  function armIdle(){
    clearTimeout(idle);
    if(state !== "teacher") return;
    idle = setTimeout(function(){
      if(state !== "teacher") return;
      if(mode === "direct" && !fsNow() && !Teacher.isStandalone()) return showStart();
      Teacher.back();
    }, IDLE_MS);
  }
  ["pointerdown", "keydown"].forEach(function(t){ document.addEventListener(t, armIdle, true); });

  function menu(){
    var w = document.createElement("div");
    w.className = "dlg";
    w.setAttribute("role", "dialog");
    w.innerHTML = '<div class="box"><h2>' + icon("unlock") + ' 先生の メニュー</h2><div class="menu">'
      + '<button class="btn" data-m="teacher">' + icon("gear") + '先生の画面を ひらく</button>'
      + '<button class="btn warn" data-m="finish">' + icon("door") + '係の画面を おわる</button>'
      + '<button class="btn" data-m="back">' + icon("back") + '係の画面に もどる</button></div></div>';
    document.body.appendChild(w);
    var t = setTimeout(function(){ w.remove(); Token.clear(); }, 60000);
    w.addEventListener("click", function(e){
      var b = e.target.closest("[data-m]");
      if(!b) return;
      clearTimeout(t); w.remove();
      var m = b.getAttribute("data-m");
      if(m === "teacher") openTeacher(false);
      else if(m === "finish") finish();
      else Token.clear();
    });
  }
  function teacherMenu(){ askPin().then(function(tok){ if(tok) menu(); }); }

  document.addEventListener("click", function(e){
    var b = e.target.closest("[data-g]");
    if(!b) return;
    var g = b.getAttribute("data-g");
    if(g === "go") start();
    else if(g === "nofs"){ askPin().then(function(tok){ if(tok){ Token.clear(); run(); } }); }
    else if(g === "teacher") askPin().then(function(tok){ if(tok) openTeacher(true); });
    else if(g === "unlock-away"){
      askPin().then(function(tok){
        if(!tok) return;
        cover('<div>' + icon("unlock", "hero") + '</div><h1>もとに もどします</h1>'
          + '<div class="row2"><button class="btn big primary" data-g="resume">' + icon("expand") + '全画面に もどす</button>'
          + '<button class="btn big" data-g="menu-away">' + icon("gear") + '先生の メニュー</button></div>');
      });
    }
    else if(g === "resume") resume();
    else if(g === "menu-away"){ uncover(); menu(); }
  });

  function onFsChange(){
    if(mode !== "direct") return;
    if(!fsNow() && !finishing && (state === "running" || (state === "teacher" && !Teacher.isStandalone()))) away();
  }
  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);

  window.addEventListener("message", function(e){
    if(mode !== "launcher" || e.source !== window.top || !e.data || e.data.hs !== "launcher") return;
    var d = e.data;
    if(d.ev === "start"){ log("start"); run(); }
    else if(d.ev === "resume"){ log("resume"); run(); }
    else if(d.ev === "leave" && !finishing) away();
    else if(d.ev === "ended"){ state = "finished"; }
    else if(d.ev === "fsfail") toast("全画面に できませんでした。もう一度 押してください", true);
  });

  function init(root){
    app = root;
    return detect().then(function(l){
      if(l){
        mode = "launcher";
        if(l.fs) run(); else { state = "finished"; app.innerHTML = ""; }
      }else{
        mode = "direct";
        showStart();
      }
    });
  }

  return {init:init, teacherMenu:teacherMenu, openTeacher:openTeacher,
          mode:function(){ return mode; }, state:function(){ return state; }};
})();
