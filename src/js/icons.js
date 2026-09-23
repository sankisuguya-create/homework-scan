/* アイコン。24×24 の線画を1ファイルに持つ（外部の配信には頼らない）。
   線は太く（2.4）、角は丸く。色は currentColor なので、置いた場所の文字色になる。 */
var ICON_PATHS = {
  book:   '<path d="M4 4.5h6a2 2 0 0 1 2 2V20a1.8 1.8 0 0 0-1.8-1.8H4z"/><path d="M20 4.5h-6a2 2 0 0 0-2 2V20a1.8 1.8 0 0 1 1.8-1.8H20z"/>',
  calc:   '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 7h7M8.5 12h1M12 12h0M15.5 12h0M8.5 16h1M12 16h0M15.5 16h0"/>',
  note:   '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18M12 8h4M12 12h4"/>',
  pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  paper:  '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  star:   '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  music:  '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  bag:    '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  abc:    '<path d="M3 17l3-9 3 9M4 14h4M12 8v9h3a2.2 2.2 0 0 0 0-4.5H12M12 12.5h2.6a2.2 2.2 0 0 0 0-4.5H12M21 9.3a3 3 0 1 0 0 6.4"/>',
  check:  '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  done:   '<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="M7.5 12.3l3 3 6-6.3" stroke="var(--on-done,#fff)"/>',
  todo:   '<circle cx="12" cy="12" r="8.5"/>',
  lock:   '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5"/>',
  cloud:  '<path d="M7 18.5h10a4 4 0 0 0 .6-8A5.5 5.5 0 0 0 7 9.5a4.5 4.5 0 0 0 0 9z"/><path d="M9.5 14l2 2 3.5-3.5"/>',
  cloudOff:'<path d="M7 18.5h10a4 4 0 0 0 .6-8A5.5 5.5 0 0 0 7 9.5a4.5 4.5 0 0 0 0 9z"/><path d="M3 3l18 18"/>',
  sync:   '<path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  back:   '<path d="M10 5l-7 7 7 7M3 12h18"/>',
  left:   '<path d="M15 5l-7 7 7 7"/>',
  right:  '<path d="M9 5l7 7-7 7"/>',
  close:  '<path d="M6 6l12 12M18 6L6 18"/>',
  undo:   '<path d="M9 4L4 9l5 5"/><path d="M4 9h10a5.5 5.5 0 0 1 0 11h-3"/>',
  gear:   '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1"/>',
  chart:  '<path d="M4 20V4M4 20h16"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/>',
  users:  '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 5.5 5.8"/>',
  calendar:'<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.3 8-8 9-4.7-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  door:   '<path d="M14 4H6v16h8"/><path d="M11 12h10M17 8l4 4-4 4"/>',
  flag:   '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  alert:  '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h0"/>',
  bell:   '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  hand:   '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V5.5a1.5 1.5 0 0 1 3 0V13M17 11a1.5 1.5 0 0 1 3 0v3a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.5L3.5 14a1.5 1.5 0 0 1 2.6-1.5L8 15"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  plus:   '<path d="M12 5v14M5 12h14"/>',
  trash:  '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  save:   '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  download:'<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  bed:    '<path d="M3 18V6M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>',
  minus:  '<path d="M6 12h12"/>',
  paste:  '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6"/>',
  clock:  '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
var ICON_LABEL = {book:"本", calc:"計算", note:"連絡帳", pencil:"えんぴつ", paper:"プリント",
                  star:"星", music:"音楽", bag:"かばん", abc:"英語"};
function icon(name, cls){
  var p = ICON_PATHS[name] || ICON_PATHS.paper;
  return '<svg class="ic' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" aria-hidden="true" '
       + 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'
       + p + '</svg>';
}
