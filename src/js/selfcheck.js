/* デモ版だけに入る自己計測（#selfcheck を付けて開くと動く）。
   画面の決まりを機械が確かめる。人間向けの決まりは src/ 側のコメントが正本
   （GAS に持って行かないので helper/teacher のソースに書き、ここは機械検査だけ）。

   計るもの（確定済みの不変条件）
     係の画面 … ・名前列は3列（.pane が3つ）
                ・3列の行容量（列ごとの行 × 3）≥ 児童数
                ・集計チップの「まだ ○人」は児童数を超えない
     先生の画面 … 文書高 ≤ 画面高（768p級でスクロール不要の一画面）

   約0.7秒ごとに DOM を見て、計測値が前回と同じなら何も出さない。
   守られていれば console.log、破れていたら console.assert（赤い行）。 */
(function(){
  if(!/selfcheck/.test(location.hash)) return;
  var last = "";
  function kids(){
    return document.querySelectorAll(".pane .row:not(.head):not(.empty)").length;
  }
  function measure(){
    var el, sig = "", okAll = true;
    /* 係の画面は閉室中・読み込み中は格子が出ていないので、その間は計らない */
    if(document.querySelector(".helper .panes")){
      var panes = document.querySelectorAll(".pane"), n = kids();
      var rowsEach = panes[0] ? panes[0].querySelectorAll(".row").length - 1 : 0;
      var cap = rowsEach * panes.length;
      if(panes.length !== 3){
        okAll = false;
        console.assert(false, "selfcheck: 係の名前列は3列の決まり → .pane が " + panes.length + " つ");
      }
      if(cap < n){
        okAll = false;
        console.assert(false, "selfcheck: 3列の行容量 " + cap + " が児童数 " + n + " 未満");
      }
      var bad = [];
      document.querySelectorAll(".chip .left").forEach(function(e){
        var x = parseInt(String(e.textContent).replace(/[^\d]/g, ""), 10) || 0;
        if(x > n) bad.push(x);
      });
      if(bad.length){
        okAll = false;
        console.assert(false, "selfcheck: 「まだ ○人」が児童数 " + n + " を超える（" + bad.join(", ") + "）");
      }
      sig = "helper|panes=" + panes.length + "|rows=" + rowsEach + "|cap=" + cap + "|kids=" + n + "|bad=" + bad.join("+");
    }else if(document.querySelector(".teacher")){
      var doc = document.documentElement;
      var over = doc.scrollHeight - window.innerHeight;
      if(over > 0){
        okAll = false;
        console.assert(false, "selfcheck: 先生の文書高 " + doc.scrollHeight + " が画面高 " + window.innerHeight + " を " + over + "px 超過（一画面の決まり違反）");
      }
      var tab = (document.querySelector(".tabs [aria-selected='true']") || {}).textContent || "?";
      sig = "teacher|tab=" + tab + "|h=" + doc.scrollHeight + "|inner=" + window.innerHeight;
    }else{
      return;
    }
    if(sig !== last){
      last = sig;
      console.log("[selfcheck] " + sig + (okAll ? " … OK" : " … NG"));
    }
  }
  setInterval(measure, 700);
})();
