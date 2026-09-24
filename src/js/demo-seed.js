/* デモ版の初期データ。名前は架空。
   過去2週間ぶんの「記録」行を作って、分析の画面に中身が出るようにする。 */
function demoSeed(){
  if(!P._empty()) return;
  var names = ["あおき はると", "いしかわ めい", "うえだ そうた", "えんどう ゆい", "おおの れん",
    "かとう ひまり", "きむら ゆうと", "くどう あおい", "けんもち りく", "こばやし さくら",
    "さいとう はやと", "しみず こはる", "すずき たいが", "せきぐち みお", "そのだ いつき",
    "たなか ゆな", "ちば けんた", "つじ りこ", "てらだ かいと", "ながい ひなた",
    "にしだ あかり", "ぬまた こうき", "のむら ことね", "はしもと そら", "ひらの ゆづき",
    "ふじい しょう", "ほんだ まな", "まつもと だいち", "みやざき えま", "むらかみ はる",
    "もりた あんな", "やまだ ゆうま", "よしだ かのん"];
  P.replace("名簿", names.map(function(n, i){ return [i + 1, n]; }));

  var seed = 7;
  function rnd(){ seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  var today = Domain.jstDate(P.now());
  var days = [], recs = [], abs = [];
  var d = today, n = 0;
  while(days.length < 10 && n < 30){
    d = Domain.addDays(d, -1); n++;
    var wd = Domain.weekday(d);
    if(wd === "土" || wd === "日") continue;
    days.push(d);
  }
  days.reverse().forEach(function(date, di){
    var items = [[1, "漢字ドリル"], [2, "計算ドリル"], [3, "連絡帳"]];
    if(di % 3 === 1) items.push([4, "音読カード"]);
    items.forEach(function(it){ P.append("日の品目", [[date, it[0], it[1]]]); });
    names.forEach(function(_, i){
      var no = i + 1;
      if(no === 12 && di === 6){ abs.push([date, no]); return; }
      var weak = no === 7 || no === 23;
      var row = [date, String(no), "", "", "", "", "", "", "", "", ""], wrote = false;
      items.forEach(function(it){
        if(no === 15 && it[0] === 2) return;
        var p = weak ? 0.55 : 0.96;
        if(no === 29 && di >= 6) p = 0;
        var base = weak ? 8 * 60 + 25 : 8 * 60 + 5;
        var m = Math.round(base + rnd() * 20 - 5);
        var hm = "0" + Math.floor(m / 60) + ":" + Domain.pad(m % 60);
        var cell = "○ " + hm;
        if(rnd() > p){
          var r = rnd();
          if(r < 0.2) return;                     /* 空白（押されなかった） */
          cell = (r < 0.75 ? "忘 " : "△ ") + hm;
        }
        row[1 + it[0]] = cell; wrote = true;
      });
      if(wrote) recs.push(row);
    });
  });
  P.append("記録", recs);
  P.append("欠席", abs);
  P.append("免除", [[days[0], "", 15, 2, "計算ドリルは別の課題"]]);
  P.replace("設定", DEFAULT_ROWS["設定"].map(function(r){ return r.slice(); }).map(function(r){
    if(r[0] === "集計の開始日") r[1] = days[0];
    return r;
  }));
}
demoSeed();
