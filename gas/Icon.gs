// タブ・ブックマークのアイコン。外部の置き場を使わず、画像をここに base64 で持つ。
// 仕組みと注意は design リポジトリの app-icons/README.md。
// setupSheets から ensureIcon_() が呼ばれ、所有者のドライブに PNG を作る。doGet が setFaviconUrl に渡す。
// 画像を替えた版を貼って setupSheets（または selfTestIcon）を実行すれば作り直す。

var ICON_PNG_B64 = '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';
var ICON_NAME = '宿題チェック-icon.png';

function ensureIcon_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('ICON_ID');
  var ver = String(ICON_PNG_B64.length) + ICON_PNG_B64.slice(-16);
  if (id && props.getProperty('ICON_VER') === ver) { try { DriveApp.getFileById(id); return id; } catch (e) { /* 消されていたら作り直す */ } }
  if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* 前の画像が無くても続ける */ } }
  var f = DriveApp.createFile(Utilities.newBlob(Utilities.base64Decode(ICON_PNG_B64), 'image/png', ICON_NAME));
  try { f.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  props.setProperty('ICON_ID', f.getId()); props.setProperty('ICON_VER', ver);
  return f.getId();
}
function iconUrl_() {
  var id = PropertiesService.getScriptProperties().getProperty('ICON_ID');
  return id ? 'https://drive.google.com/uc?export=view&id=' + id + '&.png' : '';
}
// 画面に付ける。失敗しても、アイコンが無くても画面は開く
function withIcon_(out) {
  try { var u = iconUrl_(); if (u) out.setFaviconUrl(u); } catch (e) { /* アイコンは無くてよい */ }
  return out;
}
// エディタから実行すると、実行の記録に ○✕ を出す
function selfTestIcon() { try { console.log('○ タブのアイコン：' + ensureIcon_()); } catch (e) { console.log('✕ タブのアイコン：' + e.message); } }
