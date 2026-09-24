/* デモ版の google.script.run。同じ名前のサーバ関数を少し遅らせて呼ぶ。
   引数と戻り値は JSON を通して、本物と同じく「値だけが渡る」ようにする。
   window.DEMO_OFFLINE = true にすると通信の失敗を真似る。 */
var google = {script: {run: (function(){
  function runner(ok, ng){
    var r = {
      withSuccessHandler: function(f){ return runner(f, ng); },
      withFailureHandler: function(f){ return runner(ok, f); }
    };
    ["apiToday", "apiMark", "apiTeacherDay",
     "apiSaveDay", "apiSetAbsent", "apiSetup", "apiSaveRoster", "apiSaveSlots",
     "apiSaveExemptions", "apiSaveSettings", "apiStats", "apiLogs"].forEach(function(name){
      r[name] = function(){
        var args = JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments)));
        setTimeout(function(){
          if(window.DEMO_OFFLINE){ if(ng) ng(new Error("NetworkError: デモの通信切れ")); return; }
          var out, err = null;
          try{
            var v = window[name].apply(null, args);
            out = v === undefined ? null : JSON.parse(JSON.stringify(v));
          }
          catch(e){ err = e; }
          if(err){ if(ng) ng(err); }
          else if(ok) ok(out);
        }, 60);
      };
    });
    return r;
  }
  return runner(null, null);
})()}};
