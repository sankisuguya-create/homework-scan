/* 入口。役（BOOT.role）はサーバがアカウントから決める。
     係の児童（helper）… 係の画面だけ
     教職員（staff）   … 係の画面と先生の画面。?view=teacher なら先生の画面から */
(function(){
  var app = document.getElementById("app");
  var staff = BOOT.role === "staff";
  verCheck(BOOT);   /* 貼り直した Index.html と古い .gs（またはその逆）を開いたときに帯を出す */

  function helper(){ Teacher.unmount(); Helper.mount(app, {staff:staff, openTeacher:teacher}); }
  function teacher(){
    Helper.unmount();
    Teacher.mount(app, {back:helper, backLabel:"係の画面へ"});
  }

  if(staff && BOOT.view === "teacher") teacher();
  else helper();
})();
