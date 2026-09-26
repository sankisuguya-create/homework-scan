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
  ok("次の登校日：金→月", D.nextSchoolDay("2026-09-25") === "2026-09-28");
  ok("次の登校日：土→月", D.nextSchoolDay("2026-09-26") === "2026-09-28");
  ok("次の登校日：日→月", D.nextSchoolDay("2026-09-27") === "2026-09-28");
  ok("次の登校日：月→火", D.nextSchoolDay("2026-09-28") === "2026-09-29");
  ok("登校日読み替え：平日はそのまま", D.schoolDay("2026-09-25") === "2026-09-25");
  ok("登校日読み替え：土→月", D.schoolDay("2026-09-26") === "2026-09-28");
  ok("登校日読み替え：日→月", D.schoolDay("2026-09-27") === "2026-09-28");
  ok("分を時刻に", D.hhmm(8 * 60 + 5) === "8:05");
  ok("シートの Date を日付に", D.asDate(new Date(JST("2026-09-25", "00:10"))) === "2026-09-25");
  ok("スラッシュ区切りの日付", D.asDate("2026/9/5") === "2026-09-05");
  ok("開室の境目 8:00", D.openAt(JST("2026-09-25", "08:00")) === true && D.openAt(JST("2026-09-25", "07:59")) === false);
  ok("閉室の境目 14:00", D.openAt(JST("2026-09-25", "13:59")) === true && D.openAt(JST("2026-09-25", "14:00")) === false);
  ok("猶予ありなら14:10まで", D.openAt(JST("2026-09-25", "14:09"), 10) === true && D.openAt(JST("2026-09-25", "14:10"), 10) === false);
  ok("土日は開かない", D.openAt(JST("2026-09-26", "10:00")) === false && D.openAt(JST("2026-09-26", "10:00"), 10) === false && D.openAt(JST("2026-09-27", "12:00")) === false);

  ok("IP許可: 空なら無制限", D.ipAllowed("1.2.3.4", "") === true && D.ipAllowed("x", "  ") === true);
  ok("IP許可: 完全一致", D.ipAllowed("203.0.113.5", "203.0.113.5") === true && D.ipAllowed("203.0.113.6", "203.0.113.5") === false);
  ok("IP許可: CIDR", D.ipAllowed("203.0.113.99", "203.0.113.0/24") === true && D.ipAllowed("203.0.114.1", "203.0.113.0/24") === false);
  ok("IP許可: 並びと端の範囲", D.ipAllowed("10.0.0.1", "203.0.113.5, 10.0.0.0/8") === true
     && D.ipAllowed("0.0.0.0", "0.0.0.0/0") === true && D.ipAllowed("9.9.9.9", "10.0.0.0/8, 203.0.113.5") === false);
  ok("IP許可: 変なIPは合わない", D.ipAllowed("999.1.1.1", "0.0.0.0/0") === false && D.ipAllowed("", "0.0.0.0/0") === false);
  ok("IP許可: 壊れた範囲は無視", D.ipAllowed("1.2.3.4", "abc, 1.2.3.4/99") === false && D.ipAllowed("1.2.3.4", "abc, 1.2.3.4") === true);
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
  const r4 = D.parseRoster("番号\t氏名\t組\n1\t青木\t3組\n2\t石川\t3組");
  ok("見出しに余分列があっても捨てる", r4.length === 2 && r4[0].name === "青木" && r4[1].name === "石川", r4);
  const r5 = D.parseRoster("氏名\tふりがな\n青木\tあおき\n石川\tいしかわ");
  ok("番号の列が無い見出しも捨てて連番", r5.length === 2 && r5[0].no === 1 && r5[1].no === 2, r5);
}

function fresh(){
  const s = load();
  s.P._reset();
  s.P._setNow(T0);
  s.P.replace("名簿", [[1, "あお"], [2, "いし"], [3, "うえ"], [19, "てら"]]);
  return s;
}

console.log("■ 係の画面");
{
  const s = fresh();
  const st = s.apiToday();
  ok("きょうの日付", st.date === "2026-09-25" && st.wd === "金", st.date);
  ok("「いつも出す」3品目が並ぶ", st.items.map(i => i.name).join() === "漢字ドリル,計算ドリル,連絡帳", st.items);
  ok("開いただけでは数える日にならない（休日に開いても分母が増えない）", s.P.rows("日の品目").length === 0);

  const r = s.apiMark([{id:"ev-000001", date:st.date, no:2, slot:1, op:"on", at:JST(st.date, "08:12"), via:"tap"}]);
  ok("○が付く", r.state.cells["2:1"] === "on", r.state.cells);
  ok("記録は1日×児童ごとの1行", s.P.rows("記録").length === 1 && s.P.rows("記録")[0].slice(0, 2).join() === "2026-09-25,2", s.P.rows("記録"));
  ok("最初の印で、その日が数える日になる", s.P.rows("日の品目").length === 3);
  s.apiMark([{id:"ev-000009", date:st.date, no:3, slot:3, op:"on", at:JST(st.date, "08:12")}]);
  ok("2回目の印では品目は増えない", s.P.rows("日の品目").length === 3);
  ok("セルの形（○と時刻）", s.P.rows("記録")[0][2] === "○ 8:12" && s.P.rows("記録")[1][4] === "○ 8:12", s.P.rows("記録"));
  s.apiMark([{id:"ev-000001", date:st.date, no:2, slot:1, op:"on", at:JST(st.date, "08:12")}]);
  ok("同じ記録を送り直しても増えない", s.P.rows("記録").length === 2 && s.P.rows("記録")[0][2] === "○ 8:12");
  const r2 = s.apiMark([{id:"ev-000002", date:st.date, no:2, slot:1, op:"off", at:JST(st.date, "08:13")}]);
  ok("空白に戻すと外れる", !r2.state.cells["2:1"]);
  ok("空白に戻した印は「消」で残る", s.P.rows("記録")[0][2] === "消 8:13", s.P.rows("記録")[0]);
  const cyc = ["rest", "forgot", "doing"].map((op, i) =>
    s.apiMark([{id:"ev-cyc-0" + i, date:st.date, no:2, slot:2, op, at:JST(st.date, "08:1" + i)}]).state.cells["2:2"]);
  ok("休・忘・△ をそのまま記録する", cyc.join() === "rest,forgot,doing", cyc);
  ok("セルの文字は休・忘・△", s.P.rows("記録")[0][3] === "△ 8:12", s.P.rows("記録")[0]);

  const bad = s.apiMark([
    {id:"ev-000003", date:st.date, no:5, slot:1, op:"on"},
    {id:"ev-000004", date:st.date, no:1, slot:7, op:"on"},
    {id:"ev-000005", date:"2026-09-24", no:1, slot:1, op:"on"},
    {id:"x", date:st.date, no:1, slot:1, op:"on"},
    {id:"ev-000006", date:st.date, no:1, slot:1, op:"zap"}]);
  ok("名簿に無い番号・きょう無い品目・きのう・変なID・変な操作は書かない", s.P.rows("記録").length === 2, s.P.rows("記録"));
  ok("書かなかった分も「処理した」として返す（端末で消せる）", bad.processed.length === 4, bad.processed);

  s.P.replace("記録", []);
  /* 端末の時計が10分進んでいても、送った時の差で直す */
  s.apiMark([{id:"ev-skew-01", date:st.date, no:1, slot:2, op:"forgot", at:T0 + 10 * 60000 - 60000}], T0 + 10 * 60000);
  ok("端末の時計のずれを直して記録する", s.P.rows("記録")[0][3] === "忘 8:29", s.P.rows("記録")[0]);
  s.apiMark([{id:"ev-skew-02", date:st.date, no:1, slot:2, op:"on", at:T0 - 30000}], T0);
  ok("あとで押した方が、いまの状態になる", s.apiToday().cells["1:2"] === "on", s.apiToday().cells);

  s.apiMark([{id:"ev-000007", date:st.date, no:1, slot:1, op:"on", at:JST(st.date, "08:20"), via:"teacher"}]);
  ok("教職員は先生の印を付けられる", s.P.rows("記録")[0][2] === "*○ 8:20", s.P.rows("記録")[0]);
  s.apiMark([{id:"ev-000008", date:st.date, no:3, slot:1, op:"on", at:T0 + 3600e3}]);
  ok("未来の時刻は受け取った時刻にする", s.P.rows("記録").filter(r => r[1] === "3")[0][2] === "○ 8:30", s.P.rows("記録"));
}

console.log("■ 欠席は「休」、免除は係に理由を見せない");
{
  const s = fresh();
  s.apiSetAbsent("2026-09-25", [3]);
  s.apiSaveExemptions([{no:19, slot:2, from:"2026-09-01", to:"2026-09-30", memo:"けが"}]);
  const st = s.apiToday();
  ok("先生が欠席にした子は全品目が「休」", [1, 2, 3].every(n => st.cells["3:" + n] === "rest"), st.cells);
  ok("免除は枠ごとに excused", !!st.excused["19:2"] && !st.excused["19:1"], st.excused);
  const r = s.apiMark([{id:"ev-abs-01", date:st.date, no:3, slot:1, op:"off", at:JST(st.date, "08:10")}]);
  ok("欠席の子でも係が空白に戻せる（消は休より強い）", !r.state.cells["3:1"] && r.state.cells["3:2"] === "rest", r.state.cells);
  ok("理由（メモ）は係に渡さない", JSON.stringify(st).indexOf("けが") < 0);
}

console.log("■ 係が名前をタップして休みを切り替える（apiMark の abs イベント）");
{
  const s = fresh();
  const st = s.apiToday();
  ok("はじめは欠席なし", (st.absent || []).length === 0, st.absent);

  const r = s.apiMark([{id:"ab-000001", date:st.date, no:2, abs:true, at:JST(st.date, "08:30"), via:"tap"}]);
  ok("欠席シートに行が増える", s.P.rows("欠席").some(x => x[0] === st.date && Number(x[1]) === 2), s.P.rows("欠席"));
  ok("state.absent に番号が入る", r.state.absent.indexOf(2) >= 0, r.state.absent);
  ok("その子の全マスが「休」", [1, 2, 3].every(n => r.state.cells["2:" + n] === "rest"), r.state.cells);

  const r2 = s.apiMark([{id:"ab-000002", date:st.date, no:2, abs:false, at:JST(st.date, "08:35"), via:"tap"}]);
  ok("出席に戻すと欠席行が消える", !s.P.rows("欠席").some(x => x[0] === st.date && Number(x[1]) === 2));
  ok("state.absent から消え、マスは元に戻る", r2.state.absent.indexOf(2) < 0 && !r2.state.cells["2:1"], r2.state);

  /* 先に○を付けてから休み→出席に戻すと、押した印が残っている */
  s.apiMark([{id:"ab-000003", date:st.date, no:3, slot:1, op:"on", at:JST(st.date, "08:10"), via:"tap"}]);
  s.apiMark([{id:"ab-000004", date:st.date, no:3, abs:true, at:JST(st.date, "08:20"), via:"tap"}]);
  const r3 = s.apiMark([{id:"ab-000005", date:st.date, no:3, abs:false, at:JST(st.date, "08:40"), via:"tap"}]);
  ok("戻すと押した○が残る", r3.state.cells["3:1"] === "on", r3.state.cells);

  /* 同じ abs:true を2回送っても行は1行だけ（送り直しに強い） */
  s.apiMark([{id:"ab-000006", date:st.date, no:19, abs:true, at:JST(st.date, "08:50"), via:"tap"},
             {id:"ab-000007", date:st.date, no:19, abs:true, at:JST(st.date, "08:50"), via:"tap"}]);
  ok("重複して欠席行が増えない", s.P.rows("欠席").filter(x => Number(x[1]) === 19).length === 1, s.P.rows("欠席"));
}

console.log("■ 先生が品目・名簿・過去の日を直す");
{
  const s = fresh();
  const day = s.apiSaveDay("2026-09-25", [{slot:1, name:"漢字ドリル"}, {slot:4, name:"音読カード"}]);
  ok("その日の品目を入れ替える", day.items.map(i => i.slot).join() === "1,4", day.items);
  ok("係の画面にも出る", s.apiToday().items.map(i => i.name).join() === "漢字ドリル,音読カード");
  s.apiSaveDay("2026-09-25", []);
  ok("品目を0にした日は「提出物なし」", s.apiToday().items.length === 0 && s.P.rows("日の品目").length === 1);

  /* 「きょうとあした」画面の前提：あしたは未決定で品目が空、決めると hasDay になる */
  const tm = s.apiTeacherDay("2026-09-26");
  ok("あしたはまだ決まっていない", tm.hasDay === false && tm.items.length === 0, tm);
  const tm2 = s.apiSaveDay("2026-09-26", [{slot:2, name:"計算ドリル"}]);
  ok("あしたの宿題を先に決められる", tm2.hasDay === true && tm2.items.length === 1 && tm2.items[0].name === "計算ドリル", tm2.items);
  ok("あしたを決めても、きょうの「提出物なし」は変わらない", s.apiToday().items.length === 0);

  s.apiSaveDay("2026-09-24", [{slot:1, name:"漢字ドリル"}]);
  s.apiMark([{id:"ev-past-01", date:"2026-09-24", no:1, slot:1, op:"on", at:T0, via:"teacher"}]);
  const row = s.P.rows("記録").filter(r => r[0] === "2026-09-24")[0];
  ok("先生は前の日に印を付けられる（先生の印として残る）", row && row[0] === "2026-09-24" && row[2] === "*○", row);
  ok("先生の画面は理由と時刻まで持つ", s.apiTeacherDay("2026-09-24").cells["1:1"].via === "teacher");
  s.P.append("記録", [["2026-09-24", "2", "○ 8:40", "", "", "", "", "", "", "", ""]]);
  s.apiMark([{id:"ev-past-03", date:"2026-09-24", no:2, slot:1, op:"forgot", at:T0, via:"teacher"}]);
  ok("前の日の直しはあと勝ち（係の印を上書きする）",
     s.apiTeacherDay("2026-09-24").cells["2:1"].state === "forgot");
  ok("直す前の係の印は残らない（セル上書き）", s.P.rows("記録").filter(r => r[0] === "2026-09-24" && r[1] === "2")[0][2] === "*忘");
  ok("8日より前は直せない", (s.apiMark([{id:"ev-past-02", date:"2026-09-10", no:1, slot:1, op:"on"}]), !s.P.rows("記録").some(r => r[0] === "2026-09-10")));

  const su = s.apiSaveRoster([{no:2, name:"いし"}, {no:1, name:"あお"}, {no:1, name:"だぶり"}, {no:0, name:"x"}]);
  ok("名簿は番号順・重複と0番を捨てる", su.roster.map(r => r.no).join() === "1,2", su.roster);
  const sl = s.apiSaveSlots([{slot:1, name:"漢字", icon:"book", daily:true}, {slot:2, name:"", icon:"calc", daily:true}, {slot:3, icon:"evil"}]);
  ok("名前の無い枠は「いつも出す」にしない", sl.slots[1].daily === false && sl.slots[0].daily === true, sl.slots.slice(0, 2));
  ok("知らないアイコンは既定に戻す", sl.slots[2].icon === "note", sl.slots[2]);
  const se = s.apiSaveSettings({ratePct:70, streakMin:2, showNames:false, from:"2026/9/1", netIps:"203.0.113.0/24, 210.1.2.3"});
  ok("設定を保存", se.settings.ratePct === 70 && se.settings.streakMin === 2 && se.settings.from === "2026-09-01"
     && se.settings.netIps === "203.0.113.0/24, 210.1.2.3", se.settings);
  ok("氏名を出さない設定では係の画面に名前が来ない", s.apiToday().roster.every(r => r.name === ""));
  ok("係の画面に校内のIPの設定が届く", s.apiToday().net === "203.0.113.0/24, 210.1.2.3");
}

console.log("■ 分析");
{
  const s = fresh();
  const d = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"];
  d.forEach(x => s.apiSaveDay(x, [{slot:1, name:"漢字ドリル"}, {slot:2, name:"計算ドリル"}]));
  /* 「記録」はセルが最後の状態を持つので、書くのは各マスの最終形だけ */
  const rows = [];
  const cell = (date, no, slot, txt) => {
    let r = rows.find(r => r[0] === date && String(r[1]) === String(no));
    if(!r){ r = [date, String(no), "", "", "", "", "", "", "", "", ""]; rows.push(r); }
    r[1 + slot] = txt;
  };
  d.forEach(x => { cell(x, 1, 1, "○ 8:00"); cell(x, 1, 2, "○ 8:10"); });
  cell(d[0], 2, 1, "○ 8:30"); cell(d[0], 2, 2, "○ 8:30");
  cell(d[1], 2, 1, "忘"); cell(d[2], 2, 1, "△");
  cell(d[3], 2, 1, "消");                    /* 出してから取消 → 最後は空白 */
  cell(d[0], 3, 1, "○ 8:00"); cell(d[1], 3, 1, "○ 8:20"); cell(d[2], 3, 1, "*○ 15:00");
  s.P.append("記録", rows);
  s.apiSetAbsent(d[3], [3]);
  s.apiSaveExemptions([{no:3, slot:2}]);
  const r = s.apiStats();
  const by = {}; r.students.forEach(x => by[x.no] = x);
  ok("既定はきのうまで（きょうの 9/25 は入れない）", r.to === "2026-09-24" && r.dates.length === 4, r.dates);
  ok("全部出した子は 100%", by[1].rate === 1 && by[1].flag === false, by[1]);
  ok("平均時刻", by[1].avg === "8:05", by[1].avg);
  ok("2番は 2/8、続けて3日出ていない", by[2].submitted === 2 && by[2].required === 8 && by[2].streak === 3 && by[2].flag, by[2]);
  ok("忘・△は未提出として数え、数も出す", by[2].forgot === 1 && by[2].doing === 1, by[2]);
  ok("「消」（空白に戻した印）は空白として読む", by[2].submitted === 2);
  ok("免除と欠席の日は分母から外す（3番は 3/3、欠席は休の数に入れない）", by[3].required === 3 && by[3].submitted === 3 && by[3].rest === 0, by[3]);
  ok("先生が後から付けた印は時刻の平均に入れない", by[3].avg === "8:10", by[3].avg);
  ok("品目ごとの数", by[2].perItem["漢字ドリル"].sub === 1 && by[2].perItem["漢字ドリル"].req === 4, by[2].perItem);
  const r2 = s.apiStats("2026-09-23", "2026-09-24");
  ok("期間を絞れる", r2.dates.join() === "2026-09-23,2026-09-24");
  s.apiSaveDay("2026-09-22", []);
  ok("「提出物なし」にした日は数えない", s.apiStats().dates.length === 3);
}

console.log("■ 関門（アカウントで役を分ける）");
{
  const s = load({gate:true});
  s.P._reset(); s.P._setNow(T0);
  s.P.replace("名簿", [[1, "あお"], [2, "いし"]]);
  const as = (e, fn) => { s.EMAIL = e; return throws(fn); };
  const KID = "12345678@kyoiku.edu.nishi.or.jp", KID2 = "87654321@kyoiku.edu.nishi.or.jp";
  const SEN = "tanaka@edu.nishi.or.jp";
  ok("係に登録していない児童は係の画面も開けない", !!as(KID, () => s.apiToday()));
  ok("教職員ドメインでも8桁の数字は通さない", !!as("12345678@edu.nishi.or.jp", () => s.apiToday()));
  ok("メールが取れないと通さない", !!as("", () => s.apiToday()));
  ok("よそのドメインは通さない", !!as("sensei@gmail.com", () => s.apiToday()));
  ok("末尾だけ似たドメインは通さない", !!as("a@xedu.nishi.or.jp", () => s.apiToday()));
  ok("教職員は通る", as(SEN, () => s.apiToday()) === null);
  s.EMAIL = SEN;
  s.apiSaveHelpers([{email:KID, until:"", memo:""}]);
  ok("登録した係の児童は係の画面を開ける", as(KID, () => s.apiToday()) === null);
  ok("登録していない児童は開けない", !!as(KID2, () => s.apiToday()));
  ["apiSetup", "apiStats", "apiLogs", "apiTeacherDay"].forEach(f =>
    ok("係の児童は " + f + " を呼べない", /先生のアカウント/.test(as(KID, () => s[f]()) || "")));
  ok("係の児童は名簿を書きかえられない", !!as(KID, () => s.apiSaveRoster([{no:1, name:"x"}])) && s.P.rows("名簿").length === 2);
  s.EMAIL = KID;
  s.apiMark([{id:"kid-00001", date:"2026-09-25", no:1, slot:1, op:"on", at:T0, via:"teacher"}]);
  ok("係の児童の印は先生の印にならない", s.P.rows("記録")[0][2] === "○ 8:30", s.P.rows("記録")[0]);
  s.apiMark([{id:"kid-00002", date:"2026-09-24", no:1, slot:1, op:"on", at:T0}]);
  ok("係の児童は前の日を直せない", s.P.rows("記録").length === 1);
  ok("全角の＠でも寄せて比べる", s.Gate.judge("ＴＡＮＡＫＡ＠edu.nishi.or.jp").ok === true);
  ok("係の児童の役", s.Gate.who().role === "helper");
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
  ok("きのう分は書けない（本日だけ）", s.P.rows("記録").length === 1);
  ok("先生の口は呼べない", !!throws(() => s.apiSetup()));

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
  const r = s.apiSaveHelpers([{email:"12345678@kyoiku.edu.nishi.or.jp", until:"", memo:""},
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
  const r2 = s.apiSaveHelpers([{email:"12345678@kyoiku.edu.nishi.or.jp", until:"", memo:""}]);
  ok("新学期に保存し直すと次の学期末になる", r2.helpers[0].until === "2027-03-31", r2.helpers);
  s.EMAIL = "12345678@kyoiku.edu.nishi.or.jp";
  ok("再登録すれば開ける", s.Gate.who().role === "helper");
}

console.log("■ 係の画面は 8:00〜14:00（日本時間）だけ");
{
  const s = load({gate:true});
  s.P._reset(); s.P._setNow(JST("2026-09-25", "07:30"));
  s.P.replace("名簿", [[1, "あお"], [2, "いし"]]);
  s.EMAIL = "tanaka@edu.nishi.or.jp";
  s.apiSaveHelpers([{email:"12345678@kyoiku.edu.nishi.or.jp", until:"", memo:""}]);
  const KID = "12345678@kyoiku.edu.nishi.or.jp";

  s.EMAIL = KID;
  ok("8:00より前は閉室（closed を返す）", s.apiToday().closed === true);
  ok("8:00より前は書けない", s.apiMark([{id:"h-000001", date:"2026-09-25", no:1, slot:1, op:"on", at:JST("2026-09-25","07:59")}]).closed === true
                            && s.P.rows("記録").length === 0);

  s.P._setNow(JST("2026-09-25", "08:00"));
  ok("8:00ちょうどに開く", s.apiToday().date === "2026-09-25");

  s.P._setNow(JST("2026-09-25", "14:05"));
  ok("14:00を過ぎると係は読めない", s.apiToday().closed === true);
  const late = s.apiMark([{id:"h-000002", date:"2026-09-25", no:1, slot:1, op:"on", at:JST("2026-09-25","13:59")}]);
  ok("閉室直後の10分は、直前に押した分を受ける", late.state && late.state.cells["1:1"] === "on", late);

  s.P._setNow(JST("2026-09-25", "14:11"));
  const out = s.apiMark([{id:"h-000003", date:"2026-09-25", no:1, slot:2, op:"on", at:JST("2026-09-25","14:11")}]);
  ok("猶予を越えると書けない", out.closed === true && s.P.rows("記録")[0][3] === "", s.P.rows("記録"));

  s.EMAIL = "tanaka@edu.nishi.or.jp";
  ok("先生は時間外でもきょうの表を見られる", s.apiToday().date === "2026-09-25" && s.apiToday().cells["1:1"] === "on");
  const fix = s.apiMark([{id:"t-000001", date:"2026-09-25", no:1, slot:2, op:"forgot", at:JST("2026-09-25","14:11"), via:"teacher"}]);
  ok("先生は時間外でも直せる", !fix.closed && s.P.rows("記録")[0][3] === "*忘 14:11", s.P.rows("記録")[0]);

  s.EMAIL = KID;
  s.P._setNow(JST("2026-09-26", "10:00"));
  ok("土曜は終日閉室", s.apiToday().closed === true
     && s.apiMark([{id:"h-000004", date:"2026-09-26", no:1, slot:1, op:"on", at:JST("2026-09-26","10:00")}]).closed === true);
  s.P._setNow(JST("2026-09-27", "08:00"));
  ok("日曜の8:00も開かない", s.apiToday().closed === true);
  s.P._setNow(JST("2026-09-28", "08:00"));
  ok("月曜の8:00にはまた開く（金曜の行はそのまま）",
     s.apiToday().date === "2026-09-28" && s.P.rows("記録").length === 1);
}

done();
