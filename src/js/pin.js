/* 暗証番号の入力。画面の数字ボタンでも、キーボードの数字でも入れられる。
   askPin() は token を返す（やめたら null）。まだ決めていなければ、決める手順になる。 */
function askPin(opts){
  opts = opts || {};
  return new Promise(function(resolve){
    var mode = "enter", first = "", val = "";
    var wrap = document.createElement("div");
    wrap.className = "dlg";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.innerHTML =
        '<div class="box">'
      +   '<h2 class="ptitle"></h2>'
      +   '<div class="pinshow" aria-hidden="true"></div>'
      +   '<div class="pinmsg" aria-live="polite"></div>'
      +   '<div class="keys">'
      +     [1,2,3,4,5,6,7,8,9].map(function(n){ return '<button class="key" data-k="' + n + '">' + n + '</button>'; }).join("")
      +     '<button class="key" data-k="del" aria-label="1文字けす">' + icon("undo") + '</button>'
      +     '<button class="key" data-k="0">0</button>'
      +     '<button class="key" data-k="ok" aria-label="決定">' + icon("check") + '</button>'
      +   '</div>'
      +   '<div class="acts"><button class="btn" data-k="cancel">' + icon("close") + (opts.cancelLabel || "やめる") + '</button></div>'
      + '</div>';
    document.body.appendChild(wrap);
    var title = $(".ptitle", wrap), show = $(".pinshow", wrap), msg = $(".pinmsg", wrap);

    function setMode(m, text, ng){
      mode = m; val = "";
      title.innerHTML = icon(m === "enter" ? "lock" : "shield") + " " + esc(
        m === "enter" ? "先生の暗証番号" : m === "new1" ? "暗証番号を決めてください（4〜8けた）" : "もう一度、同じ番号を");
      note(text || "", ng);
      draw();
    }
    function note(text, ng){ msg.textContent = text; msg.className = "pinmsg" + (ng ? " ng" : ""); }
    function draw(){
      var n = Math.max(4, val.length), h = "";
      for(var i = 0; i < n; i++) h += '<i class="' + (i < val.length ? "f" : "") + '"></i>';
      show.innerHTML = h;
    }
    function close(tok){
      document.removeEventListener("keydown", onKey, true);
      wrap.remove();
      resolve(tok || null);
    }
    function submit(){
      if(val.length < 4){ note("4けた以上 入れてください", true); Sound.no(); return; }
      if(mode === "new1"){ first = val; setMode("new2"); return; }
      if(mode === "new2"){
        if(val !== first){ setMode("new1", "2回の番号がちがいました。はじめから", true); Sound.no(); return; }
        note("決めています…");
        call("apiSetPin", Token.get(), val).then(function(r){ Token.set(r.token); close(r.token); })
          .catch(function(e){ setMode("new1", errText(e), true); });
        return;
      }
      var tried = val;
      note("たしかめています…"); val = ""; draw();
      call("apiUnlock", tried).then(function(r){
        if(r.ok){ Token.set(r.token); close(r.token); return; }
        if(r.needSetup){ setMode("new1", "まだ暗証番号がありません。決めてください"); return; }
        Sound.no();
        if(r.wait) note("まちがいが続いたので、5分まってください", true);
        else note("ちがいます（あと " + r.left + " 回）", true);
      }).catch(function(e){ note(errText(e), true); });
    }
    function press(k){
      if(k === "cancel") return close(null);
      if(k === "del"){ val = val.slice(0, -1); draw(); return; }
      if(k === "ok") return submit();
      if(/^\d$/.test(k) && val.length < 8){ val += k; draw(); }
    }
    function onKey(e){
      var k = e.key;
      if(/^\d$/.test(k)) press(k);
      else if(k === "Backspace") press("del");
      else if(k === "Enter") press("ok");
      else if(k === "Escape") press("cancel");
      else return;
      e.preventDefault(); e.stopPropagation();
    }
    wrap.addEventListener("click", function(e){
      var b = e.target.closest("[data-k]");
      if(b) press(b.getAttribute("data-k"));
    });
    document.addEventListener("keydown", onKey, true);
    setMode(opts.setup ? "new1" : "enter");
  });
}
