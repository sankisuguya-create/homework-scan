/* ==================================================================
   Gate.gs — 誰が入れるかを決める唯一の場所。

   ■ この学校のアドレス
       教職員   なまえ@edu.nishi.or.jp
       児童     12345678@kyoiku.edu.nishi.or.jp   （@の左は8桁の数字）

   ■ いちばん危ない間違い
       児童のドメイン kyoiku.edu.nishi.or.jp は、教職員のドメインを
       **末尾に含んでいる**。endsWith / indexOf / 末尾の正規表現は児童も通す。
       @ の右側を切り出して**完全一致**で比べる。

   ■ 入れる人は2種類（who で返る role）
       staff  … 教職員。係の画面も先生の画面も開く。
       helper … 「係」シートに入れた児童のアドレス。係の画面（きょうの
                入力）だけが見え、先生の口は1行目で弾かれる（Api.gs）。
       係の画面を先生のアカウントで動かす教室 PC の運用は、そのまま staff 扱い。

   ■ 閉じる側に倒す
       メールが取れない・形がおかしい、はすべて「通さない」。
================================================================== */
var Gate = (function(){

  var STAFF_DOMAIN  = "edu.nishi.or.jp";
  var STUDENT_LOCAL = /^[0-9]{8}$/;

  function norm(raw){
    var e;
    try{ e = String(raw == null ? "" : raw); }catch(err){ return ""; }
    if(e.normalize) e = e.normalize("NFKC");
    return e.trim().toLowerCase();
  }

  function judge(raw){
    var e = norm(raw);
    if(!e)           return no("メールが取れなかった", "no-email");
    if(/\s/.test(e)) return no("メールに空白が入っている", "bad-form");
    var at = e.lastIndexOf("@");
    if(at <= 0 || at === e.length - 1) return no("メールの形になっていない", "bad-form");
    var local = e.slice(0, at), domain = e.slice(at + 1);
    if(domain !== STAFF_DOMAIN)  return no("教職員のアドレスではない", "not-staff");
    if(STUDENT_LOCAL.test(local)) return no("児童のアドレスの形をしている", "student-form");
    return {ok:true, email:e};
  }
  function no(why, code){ return {ok:false, why:why, code:code, email:""}; }

  function activeEmail(){
    try{ return Session.getActiveUser().getEmail() || ""; }
    catch(err){ return ""; }
  }

  /* サーバ関数の1行目で呼ぶ。staff でなければ例外を投げる。 */
  function check(){
    var j = judge(activeEmail());
    if(!j.ok) throw new Error("先生のアカウントで開いてください。（" + j.why + "）");
    return j;
  }

  /* 教職員でなければ「係」シートと照合する。いつまでは YYYY-MM-DD 必須で、
     apiSaveHelpers が学期末（3/31・8/31・12/31の直近）を上限に書き込む。
     空・読めない・期限切れはすべて role:none（閉じる側に倒す）。 */
  function who(){
    var j = judge(activeEmail());
    if(j.ok) return {role:"staff", email:j.email, code:""};
    var e = norm(activeEmail());
    if(!e) return {role:"none", email:"", code:"no-email"};
    var hit = false;
    try{
      var t = Domain.jstDate(P.now());
      P.rows("係").forEach(function(r){
        var u = Domain.asDate(r[1]);
        if(norm(r[0]) === e && u && t <= u) hit = true;
      });
    }catch(err){}
    return hit ? {role:"helper", email:e, code:""} : {role:"none", email:e, code:"not-allowed"};
  }

  /* staff または helper でなければ例外を投げる。 */
  function checkAny(){
    var w = who();
    if(w.role === "none") throw new Error("このアカウントでは開けません。（" + w.code + "）");
    return w;
  }

  function denyPage(j){
    var msg = j.code === "no-email"
      ? "だれが開いているかを確かめられませんでした。"
      : "このアカウントでは開けません。";
    return HtmlService.createHtmlOutput(
        '<div style="font:24px/1.8 system-ui,sans-serif;padding:14vh 8vw;color:#000;background:#fff">'
      + '<p style="font-weight:700;margin:0 0 8px">' + msg + '</p>'
      + '<p style="margin:0;font-size:20px">係に指定された児童のアドレスか、@' + STAFF_DOMAIN
      + ' のアカウントでログインしてください。</p></div>')
      .setTitle("宿題チェック");
  }

  return {judge:judge, check:check, who:who, checkAny:checkAny, norm:norm,
          activeEmail:activeEmail, denyPage:denyPage, STAFF_DOMAIN:STAFF_DOMAIN};
})();
