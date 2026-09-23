/* 入口。?view=teacher なら先生の画面（暗証番号から）、ほかは係の画面の入口 */
(function(){
  var app = document.getElementById("app");

  function teacherPage(){
    app.innerHTML = '<div class="start"><h1>' + icon("lock") + '先生の画面</h1>'
      + '<button class="btn big primary" data-main="pin">' + icon("unlock") + '暗証番号を 入れる</button></div>';
    askPin().then(function(tok){
      if(!tok) return;
      Teacher.mount(app, {standalone:true, page:true, backLabel:"しめる",
                          back:function(){ Token.clear(); teacherPage(); }});
    });
  }
  document.addEventListener("click", function(e){
    if(e.target.closest("[data-main=pin]")) teacherPage();
  });

  if(BOOT.view === "teacher") teacherPage();
  else Guard.init(app);
})();
