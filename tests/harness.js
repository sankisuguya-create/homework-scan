/* サーバ側（gas/Domain.gs・gas/Api.gs）を、Google なしで node の中で動かす。
   シートの代わりに src/js/mock-platform.js の P を使う。 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");

function load(opts){
  opts = opts || {};
  const sb = {console, Math, Date, JSON, Array, Object, String, Number, isFinite, RegExp, Error};
  sb.window = sb;
  vm.createContext(sb);
  const files = ["gas/Domain.gs", "gas/Api.gs"];
  if(opts.gate) files.unshift("gas/Gate.gs");
  files.push("src/js/mock-platform.js");
  for(const f of files)
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, {filename:f});
  if(opts.gate) vm.runInContext("Session = {getActiveUser: () => ({getEmail: () => EMAIL})}; var EMAIL = '';", sb);
  return sb;
}

let ng = 0, count = 0;
function ok(name, cond, got){
  count++;
  const pass = cond === true;
  if(!pass) ng++;
  console.log((pass ? "  ○ " : "  × ") + name + (pass ? "" : "   → " + JSON.stringify(got)));
}
function done(){
  console.log(ng ? `\n${ng} / ${count} 件が通らなかった` : `\n${count} 件すべて通った`);
  process.exit(ng ? 1 : 0);
}
function throws(fn){ try{ fn(); return null; }catch(e){ return e.message; } }

module.exports = {load, ok, done, throws, ROOT};
