/* ==================================================================
   Gate.gs — 誰が入れるかを決める唯一の場所。

   ■ この学校のアドレス
       教職員   なまえ@edu.nishi.or.jp
       児童     12345678@kyoiku.edu.nishi.or.jp   （@の左は8桁の数字）

   ■ いちばん危ない間違い
       児童のドメイン kyoiku.edu.nishi.or.jp は、教職員のドメインを
       **末尾に含んでいる**。endsWith / indexOf / 末尾の正規表現は児童も通す。
       @ の右側を切り出して**完全一致**で比べる。

   ■ 2つの役
       staff   教職員。係の画面も先生の画面も開ける。
       helper  係の児童。自分のアカウントで入り、係の画面（入力）だけを開ける。
               児童のアドレスの形でも、先生が「せってい」で係に登録した
               アカウントしか通さない（登録の照合は Api.gs の isHelper）。
       スプレッドシートは児童に共有しない。Web アプリは持ち主の権限で動く。

   ■ 閉じる側に倒す
       メールが取れない・形がおかしい、はすべて「通さない」。
================================================================== */
var Gate = (function(){

  var STAFF_DOMAIN   = "edu.nishi.or.jp";
  var STUDENT_DOMAIN = "kyoiku.edu.nishi.or.jp";
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
    if(domain === STUDENT_DOMAIN){
      if(!STUDENT_LOCAL.test(local)) return no("児童のアドレスの形ではない", "bad-form");
      return {ok:true, email:e, role:"helper"};
    }
    if(domain !== STAFF_DOMAIN)  return no("学校のアドレスではない", "not-school");
    if(STUDENT_LOCAL.test(local)) return no("児童のアドレスの形をしている", "student-form");
    return {ok:true, email:e, role:"staff"};
  }
  function no(why, code){ return {ok:false, why:why, code:code, email:"", role:""}; }

  function activeEmail(){
    try{ return Session.getActiveUser().getEmail() || ""; }
    catch(err){ return ""; }
  }

  /* サーバ関数の1行目で呼ぶ。通らなければ例外を投げる。係の登録は Api.gs が見る。 */
  function check(){
    var j = judge(activeEmail());
    if(!j.ok) throw new Error("学校のアカウントで開いてください。（" + j.why + "）");
    return j;
  }

  function denyPage(j){
    var msg = j.code === "no-email" ? "だれが開いているかを確かめられませんでした。"
            : j.code === "not-helper" ? "このアカウントは 係に なっていません。先生に 言ってね。"
            : "この画面は 学校の アカウントで 開きます。";
    return HtmlService.createHtmlOutput(
        '<div style="font:28px/1.8 system-ui,sans-serif;padding:14vh 8vw;color:#000;background:#fff">'
      + '<p style="font-weight:700;margin:0 0 8px">' + msg + '</p>'
      + (j.email ? '<p style="margin:0;font-size:20px">' + String(j.email).replace(/[<>&"']/g, "") + '</p>' : '')
      + '</div>')
      .setTitle("宿題チェック");
  }

  return {judge:judge, check:check, activeEmail:activeEmail, denyPage:denyPage,
          STAFF_DOMAIN:STAFF_DOMAIN, STUDENT_DOMAIN:STUDENT_DOMAIN};
})();
