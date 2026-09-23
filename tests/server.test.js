/* サーバ側の決まりを確かめる。  node tests/server.test.js */
const {load, ok, done, throws} = require("./harness");

const T0 = Date.UTC(2026, 8, 24, 23, 30);          /* 日本時間 9/25（金）8:30 */
const JST = (d, hm) => Date.parse(d + "T" + hm + ":00+09:00");

console.log("■ 日付と時刻（日本時間）");
{
  const s = load();
  const D = s.Domain;
  ok("UTC 23:30 は日本時間の翌日", D.jstDate(T0) === "2026-09-25", D.jstDate(T0));
  ok("時刻の文字列", D.jstStamp(T0) === "2026-09-25 08:30:00", D.jstStamp(T0));
  ok("曜日", D.weekday("2026-09-25") === "金");
  ok("月をまたいで日を足す", D.addDays("2026-09-30", 1) === "2026-10-01");
  ok("分を時刻に", D.hhmm(8 * 60 + 5) === "8:05");
  ok("シートの Date を日付に", D.asDate(new Date(JST("2026-09-25", "00:10"))) === "2026-09-25");
  ok("スラッシュ区切りの日付", D.asDate("2026/9/5") === "2026-09-05");
}

console.log("■ 名簿の貼り付け");
{
  const D = load().Domain;
  const r = D.parseRoster("番号\t氏名\n１\t青木　はると\n2\t石川 めい\n\n3\t上田 そうた");
  ok("見出しを捨て、全角の番号を読む", r.length === 3 && r[0].no === 1 && r[0].name === "青木 はると", r);
  const r2 = D.parseRoster("青木\n石川\n上田");
  ok("番号が無ければ 1 から振る", r2.map(x => x.no).join() === "1,2,3", r2);
  const r3 = D.parseRoster("1,青木\n1,石川\n2,上田");
  ok("同じ番号は先の1人だけ", r3.length === 2 && r3[0].name === "青木", r3);
}

function fresh(){
  const s = load();
  s.P._reset();
  s.P._setNow(T0);
  s.P.replace("名簿", [[1, "あお"], [2, "いし"], [3, "うえ"], [19, "てら"]]);
  return s;
}
function pin(s){
  s.apiSetPin(null, "2468");
  return s.apiUnlock("2468").token;
}

console.log("■ 係の画面");
{
  const s = fresh();
  const st = s.apiToday();
  ok("きょうの日付", st.date === "2026-09-25" && st.wd === "金", st.date);
  ok("「いつも出す」3品目が並ぶ", st.items.map(i => i.name).join() === "漢字ドリル,計算ドリル,連絡帳", st.items);
  ok("開いた日は数える日として残る", s.P.rows("日の品目").length === 3);
  s.apiToday();
  ok("2回開いても品目は増えない", s.P.rows("日の品目").length === 3);
  ok("暗証番号はまだ無い", st.hasPin === false);

  const r = s.apiMark([{id:"ev-000001", date:st.date, no:2, slot:1, op:"on", at:JST(st.date, "08:12"), via:"tap"}]);
  ok("○が付く", r.state.cells["2:1"] === "on", r.state.cells);
  ok("記録は1行", s.P.rows("提出記録").length === 1);
  const row = s.P.rows("提出記録")[0];
  ok("記録の形", row[4] === "提出" && row[5] === "2026-09-25 08:12:00" && row[6] === "タップ", row);
  s.apiMark([{id:"ev-000001", date:st.date, no:2, slot:1, op:"on", at:JST(st.date, "08:12")}]);
  ok("同じ記録IDは2度書かない（送り直し）", s.P.rows("提出記録").length === 1);
  const r2 = s.apiMark([{id:"ev-000002", date:st.date, no:2, slot:1, op:"off", at:JST(st.date, "08:13")}]);
  ok("空白に戻すと外れる", !r2.state.cells["2:1"]);
  ok("空白も記録に残る", s.P.rows("提出記録").length === 2 && s.P.rows("提出記録")[1][4] === "空白");
  const cyc = ["rest", "forgot", "doing"].map((op, i) =>
    s.apiMark([{id:"ev-cyc-0" + i, date:st.date, no:2, slot:2, op, at:JST(st.date, "08:1" + i)}]).state.cells["2:2"]);
  ok("休・忘・△ をそのまま記録する", cyc.join() === "rest,forgot,doing", cyc);
  ok("記録の文字", s.P.rows("提出記録").slice(2).map(r => r[4]).join() === "休み,忘れた,やっている");
  s.P.replace("提出記録", s.P.rows("提出記録").slice(0, 2));

  const bad = s.apiMark([
    {id:"ev-000003", date:st.date, no:5, slot:1, op:"on"},
    {id:"ev-000004", date:st.date, no:1, slot:7, op:"on"},
    {id:"ev-000005", date:"2026-09-24", no:1, slot:1, op:"on"},
    {id:"x", date:st.date, no:1, slot:1, op:"on"},
    {id:"ev-000006", date:st.date, no:1, slot:1, op:"zap"}]);
  ok("名簿に無い番号・きょう無い品目・きのう・変なID・変な操作は書かない", s.P.rows("提出記録").length === 2, s.P.rows("提出記録"));
  ok("書かなかった分も「処理した」として返す（端末で消せる）", bad.processed.length === 4, bad.processed);

  s.apiMark([{id:"ev-000007", date:st.date, no:1, slot:1, op:"on", at:JST(st.date, "08:20"), via:"teacher"}]);
  ok("token なしで先生の印は名乗れない", s.P.rows("提出記録")[2][6] === "タップ");
  s.apiMark([{id:"ev-000008", date:st.date, no:3, slot:1, op:"on", at:T0 + 3600e3}]);
  ok("未来の時刻は受け取った時刻にする", s.P.rows("提出記録")[3][5] === "2026-09-25 08:30:00", s.P.rows("提出記録")[3]);
}

console.log("■ 欠席は「休」、免除は係に理由を見せない");
{
  const s = fresh();
  const tk = pin(s);
  s.apiSetAbsent(tk, "2026-09-25", [3]);
  s.apiSaveExemptions(tk, [{no:19, slot:2, from:"2026-09-01", to:"2026-09-30", memo:"けが"}]);
  const st = s.apiToday();
  ok("先生が欠席にした子は全品目が「休」", [1, 2, 3].every(n => st.cells["3:" + n] === "rest"), st.cells);
  ok("免除は枠ごとに excused", !!st.excused["19:2"] && !st.excused["19:1"], st.excused);
  const r = s.apiMark([{id:"ev-abs-01", date:st.date, no:3, slot:1, op:"off", at:JST(st.date, "08:10")}]);
  ok("欠席の子でも係が空白に戻せる", !r.state.cells["3:1"] && r.state.cells["3:2"] === "rest", r.state.cells);
  ok("理由（メモ）は係に渡さない", JSON.stringify(st).indexOf("けが") < 0);
}

console.log("■ 暗証番号と先生の口");
{
  const s = fresh();
  ok("先生の口は token が無いと LOCKED", throws(() => s.apiSetup("")) === "LOCKED");
  ok("決める前は needSetup", s.apiUnlock("1111").needSetup === true);
  ok("桁が足りない番号は決められない", /4〜8けた/.test(throws(() => s.apiSetPin(null, "12")) || ""));
  const first = s.apiSetPin(null, "2468");
  ok("最初の1回は token なしで決められ、token が返る", first.ok && !!first.token);
  ok("2回目からは token が要る", throws(() => s.apiSetPin(null, "1357")) === "LOCKED");
  ok("違う番号では開かない", s.apiUnlock("1111").ok === false);
  const tk = s.apiUnlock("2468").token;
  ok("正しい番号で token", !!tk && !!s.apiSetup(tk).roster);
  ok("PIN はハッシュで持つ", s.P.prop("PIN_HASH") !== "2468" && s.P.prop("PIN_HASH").length > 8);
  for(let i = 0; i < 5; i++) s.apiUnlock("0000");
  ok("5回間違えると、正しい番号でもしばらく開かない", s.apiUnlock("2468").wait === true);
  s.P._setNow(T0 + 6 * 60000);
  ok("5分たてば開く", s.apiUnlock("2468").ok === true);
  s.apiLock(tk);
  ok("しめた token は使えない", throws(() => s.apiSetup(tk)) === "LOCKED");
  s.P._setNow(T0 + 7 * 3600e3);
  const tk2 = s.apiUnlock("2468").token;
  s.P._setNow(T0 + 14 * 3600e3);
  ok("6時間で token は切れる", throws(() => s.apiSetup(tk2)) === "LOCKED");
  const logs = s.P.rows("操作記録").map(r => r[1]);
  ok("間違いと開いたことが操作記録に残る", logs.includes("暗証番号の間違い") && logs.includes("先生の画面を開いた"), logs);
}

console.log("■ 先生が品目・名簿・過去の日を直す");
{
  const s = fresh();
  const tk = pin(s);
  const day = s.apiSaveDay(tk, "2026-09-25", [{slot:1, name:"漢字ドリル"}, {slot:4, name:"音読カード"}]);
  ok("その日の品目を入れ替える", day.items.map(i => i.slot).join() === "1,4", day.items);
  ok("係の画面にも出る", s.apiToday().items.map(i => i.name).join() === "漢字ドリル,音読カード");
  s.apiSaveDay(tk, "2026-09-25", []);
  ok("品目を0にした日は「提出物なし」", s.apiToday().items.length === 0 && s.P.rows("日の品目").length === 1);

  s.apiSaveDay(tk, "2026-09-24", [{slot:1, name:"漢字ドリル"}]);
  s.apiMark([{id:"ev-past-01", date:"2026-09-24", no:1, slot:1, op:"on", at:T0, via:"teacher"}], tk);
  const row = s.P.rows("提出記録")[0];
  ok("先生は前の日に印を付けられる（先生の印として残る）", row && row[1] === "2026-09-24" && row[6] === "先生", row);
  ok("先生の画面は理由と時刻まで持つ", s.apiTeacherDay(tk, "2026-09-24").cells["1:1"].via === "teacher");
  s.P.append("提出記録", [["ev-late-01", "2026-09-24", 2, 1, "提出", "2026-09-24 16:00:00", "タップ", "", ""]]);
  s.apiMark([{id:"ev-past-03", date:"2026-09-24", no:2, slot:1, op:"forgot", at:T0, via:"teacher"}], tk);
  ok("前の日の直しは、その日のどの記録よりあと（朝に直しても勝つ）",
     s.apiTeacherDay(tk, "2026-09-24").cells["2:1"].state === "forgot");
  s.P.replace("提出記録", s.P.rows("提出記録").slice(0, 1));
  ok("token が無ければ前の日は直せない",
     (s.apiMark([{id:"ev-past-04", date:"2026-09-24", no:1, slot:1, op:"off"}]), s.P.rows("提出記録").length === 1));
  ok("8日より前は直せない", (s.apiMark([{id:"ev-past-02", date:"2026-09-10", no:1, slot:1, op:"on"}], tk), s.P.rows("提出記録").length === 1));

  const su = s.apiSaveRoster(tk, [{no:2, name:"いし"}, {no:1, name:"あお"}, {no:1, name:"だぶり"}, {no:0, name:"x"}]);
  ok("名簿は番号順・重複と0番を捨てる", su.roster.map(r => r.no).join() === "1,2", su.roster);
  const sl = s.apiSaveSlots(tk, [{slot:1, name:"漢字", icon:"book", daily:true}, {slot:2, name:"", icon:"calc", daily:true}, {slot:3, icon:"evil"}]);
  ok("名前の無い枠は「いつも出す」にしない", sl.slots[1].daily === false && sl.slots[0].daily === true, sl.slots.slice(0, 2));
  ok("知らないアイコンは既定に戻す", sl.slots[2].icon === "note", sl.slots[2]);
  const se = s.apiSaveSettings(tk, {ratePct:70, streakMin:2, showNames:false, from:"2026/9/1"});
  ok("設定を保存", se.settings.ratePct === 70 && se.settings.streakMin === 2 && se.settings.from === "2026-09-01", se.settings);
  ok("氏名を出さない設定では係の画面に名前が来ない", s.apiToday().roster.every(r => r.name === ""));
}

console.log("■ 分析");
{
  const s = fresh();
  const tk = pin(s);
  const d = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"];
  d.forEach(x => s.apiSaveDay(tk, x, [{slot:1, name:"漢字ドリル"}, {slot:2, name:"計算ドリル"}]));
  const ev = [];
  let n = 0;
  const on = (date, no, slot, hm, via) => ev.push([`e${++n}`, date, no, slot, "提出", `${date} ${hm}:00`, via || "タップ", "", ""]);
  d.forEach(x => { on(x, 1, 1, "08:00"); on(x, 1, 2, "08:10"); });
  on(d[0], 2, 1, "08:30"); on(d[0], 2, 2, "08:30");
  const put = (date, no, slot, hm, op) => ev.push([`e${++n}`, date, no, slot, op, `${date} ${hm}:00`, "タップ", "", ""]);
  put(d[1], 2, 1, "08:00", "忘れた"); put(d[2], 2, 1, "08:00", "やっている");
  put(d[3], 2, 1, "08:00", "提出"); put(d[3], 2, 1, "08:01", "取消");
  on(d[0], 3, 1, "08:00"); on(d[1], 3, 1, "08:20"); on(d[2], 3, 1, "15:00", "先生");
  s.P.append("提出記録", ev);
  s.apiSetAbsent(tk, d[3], [3]);
  s.apiSaveExemptions(tk, [{no:3, slot:2}]);
  const r = s.apiStats(tk);
  const by = {}; r.students.forEach(x => by[x.no] = x);
  ok("既定はきのうまで（きょうの 9/25 は入れない）", r.to === "2026-09-24" && r.dates.length === 4, r.dates);
  ok("全部出した子は 100%", by[1].rate === 1 && by[1].flag === false, by[1]);
  ok("平均時刻", by[1].avg === "8:05", by[1].avg);
  ok("2番は 2/8、続けて3日出ていない", by[2].submitted === 2 && by[2].required === 8 && by[2].streak === 3 && by[2].flag, by[2]);
  ok("忘・△は未提出として数え、数も出す", by[2].forgot === 1 && by[2].doing === 1, by[2]);
  ok("前の形の「取消」も空白として読む", by[2].submitted === 2);
  ok("免除は分母から外し、休みは提出として数える（3番は 4/4）", by[3].required === 4 && by[3].submitted === 4 && by[3].rest === 1, by[3]);
  ok("先生が後から付けた印は時刻の平均に入れない", by[3].avg === "8:10", by[3].avg);
  ok("品目ごとの数", by[2].perItem["漢字ドリル"].sub === 1 && by[2].perItem["漢字ドリル"].req === 4, by[2].perItem);
  const r2 = s.apiStats(tk, "2026-09-23", "2026-09-24");
  ok("期間を絞れる", r2.dates.join() === "2026-09-23,2026-09-24");
  s.apiSaveDay(tk, "2026-09-22", []);
  ok("「提出物なし」にした日は数えない", s.apiStats(tk).dates.length === 3);
}

console.log("■ 関門（教職員だけ）");
{
  const s = load({gate:true});
  const deny = (e) => { s.EMAIL = e; return throws(() => s.apiToday()); };
  ok("児童のドメインは通さない", !!deny("12345678@kyoiku.edu.nishi.or.jp"));
  ok("教職員ドメインでも8桁の数字は通さない", !!deny("12345678@edu.nishi.or.jp"));
  ok("メールが取れないと通さない", !!deny(""));
  ok("よそのドメインは通さない", !!deny("sensei@gmail.com"));
  ok("末尾だけ似たドメインは通さない", !!deny("a@xedu.nishi.or.jp"));
  s.P._reset();
  s.EMAIL = "tanaka@edu.nishi.or.jp";
  ok("教職員は通る", throws(() => s.apiToday()) === null);
  ok("全角の＠でも寄せて比べる", s.Gate.judge("ＴＡＮＡＫＡ＠edu.nishi.or.jp").ok === true);
}

console.log("■ 係の児童のアカウント（係シート）");
{
  const s = load({gate:true});
  s.P._reset(); s.P._setNow(T0);           /* 日本時間 2026-09-25 → 学期末は 2026-12-31 */
  s.P.replace("名簿", [[1, "あお"], [2, "いし"]]);
  s.P.replace("係", [["12345678@kyoiku.edu.nishi.or.jp", "2026-12-31", "テスト係"],
                     ["87654321@kyoiku.edu.nishi.or.jp", "2026-09-24", "期限切れ"],
                     ["55555555@kyoiku.edu.nishi.or.jp", "", "期限なし"]]);

  s.EMAIL = "12345678@kyoiku.edu.nishi.or.jp";
  ok("係リストの児童は helper", s.Gate.who().role === "helper", s.Gate.who());
  ok("係はきょうの表を見られる", throws(() => s.apiToday()) === null);
  const hp = s.apiMark([{id:"hp-000001", date:"2026-09-25", no:1, slot:1, op:"on", at:JST("2026-09-25","08:30"), via:"tap"}]);
  ok("係もタップを書ける", hp.state.cells["1:1"] === "on", hp.state.cells);
  s.apiMark([{id:"hp-000002", date:"2026-09-24", no:1, slot:1, op:"on", at:JST("2026-09-24","08:30"), via:"tap"}]);
  ok("きのう分は書けない（本日だけ）", s.P.rows("提出記録").length === 1);
  ok("先生の口は呼べない", !!throws(() => s.apiSetup("bad-token")));
  ok("暗証番号は係には発行されない", !!throws(() => s.apiUnlock("2468")));
  s.apiLog("leave", "係の操作");
  ok("係の操作もアドレスが操作記録に残る", s.P.rows("操作記録").some(r => String(r[3]).indexOf("12345678") >= 0), s.P.rows("操作記録"));

  s.EMAIL = "87654321@kyoiku.edu.nishi.or.jp";
  ok("期限切れの係は入れない", s.Gate.who().role === "none" && !!throws(() => s.apiToday()));
  s.EMAIL = "55555555@kyoiku.edu.nishi.or.jp";
  ok("期限の無い行は開けない（閉じる側）", s.Gate.who().role === "none");
  s.EMAIL = "99999999@kyoiku.edu.nishi.or.jp";
  ok("リストにない児童は入れない", s.Gate.who().role === "none" && !!throws(() => s.apiToday()));
  s.EMAIL = "tanaka@edu.nishi.or.jp";
  ok("先生はそのまま staff", s.Gate.who().role === "staff" && throws(() => s.apiToday()) === null);
}

console.log("■ 係の期限は学期末が上限");
{
  const s = load({gate:true});
  s.P._reset(); s.P._setNow(T0);
  s.EMAIL = "tanaka@edu.nishi.or.jp";
  s.apiSetPin(null, "2468");
  const tk = s.apiUnlock("2468").token;

  const r = s.apiSaveHelpers(tk, [{email:"12345678@kyoiku.edu.nishi.or.jp", until:"", memo:""},
                                  {email:"87654321@kyoiku.edu.nishi.or.jp", until:"2026-10-15", memo:""},
                                  {email:"55555555@kyoiku.edu.nishi.or.jp", until:"2027-06-30", memo:"学期末を越える"},
                                  {email:"not-an-email", until:"", memo:""}]);
  ok("空なら学期末（12/31）が入る", r.helpers[0].until === "2026-12-31", r.helpers);
  ok("早い期限はそのまま", r.helpers[1].until === "2026-10-15");
  ok("学期末より後は学期末に切る", r.helpers[2].until === "2026-12-31");
  ok("メールの形でない行は捨てる", r.helpers.length === 3, r.helpers);
  ok("シートにも同じ期限が書かれる", s.P.rows("係")[0][1] === "2026-12-31", s.P.rows("係"));

  s.EMAIL = "12345678@kyoiku.edu.nishi.or.jp";
  s.P._setNow(JST("2026-12-31", "20:00"));       /* 日本時間 12/31 */
  ok("学期末当日は開ける", s.Gate.who().role === "helper");
  s.P._setNow(JST("2027-01-01", "08:00"));       /* 日本時間 1/1 */
  ok("学期を越えると失効する", s.Gate.who().role === "none" && !!throws(() => s.apiToday()));

  s.EMAIL = "tanaka@edu.nishi.or.jp";
  const tk2 = s.apiUnlock("2468").token;    /* 時間を進めたので暗証番号の通し直し */
  const r2 = s.apiSaveHelpers(tk2, [{email:"12345678@kyoiku.edu.nishi.or.jp", until:"", memo:""}]);
  ok("新学期に保存し直すと次の学期末になる", r2.helpers[0].until === "2027-03-31", r2.helpers);
  s.EMAIL = "12345678@kyoiku.edu.nishi.or.jp";
  ok("再登録すれば開ける", s.Gate.who().role === "helper");
}

done();
