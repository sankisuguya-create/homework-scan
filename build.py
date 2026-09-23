#!/usr/bin/env python3
"""src/ を組み立てて、GAS 用の1枚とデモ用の1枚を書き出す。

    python3 build.py          生成する
    python3 build.py --check  生成物が src と一致するか調べる（ずれたら終了コード1）

書き出すもの
    gas/Index.html     Apps Script に貼る画面。サーバは gas/*.gs
    dist/demo.html     ブラウザで開くだけで動くデモ。gas/Domain.gs と gas/Api.gs を
                       そのまま差し込み、シートの代わりに localStorage を使う
    dist/launcher.html 教室の PC に置く起動用ファイル（launcher/launcher.html の写し）
    gas/Launcher.gs    起動用ファイルを文字列にしたもの。doGet(?launcher=1) が URL を入れて渡す

**直すのは src/ と launcher/ のほう。** 生成物を直しても次のビルドで消える。

書き方
    /* @include js/app.js */       ファイルを差し込む（src/ からの相対。../gas/… も可）
    <!-- @demo-only -->            デモ版でだけ、モックの script を差し込む
    <?!= boot ?>                   GAS では doGet が値を入れる。デモ版は DEMO_BOOT に置き換える
    "@@LAUNCHER@@"                 起動用ファイルの中身を JS の文字列として入れる
"""
import sys, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
LAUNCHER = ROOT / "launcher" / "launcher.html"
OUT_GAS = ROOT / "gas" / "Index.html"
OUT_DEMO = ROOT / "dist" / "demo.html"
OUT_LAUNCHER = ROOT / "dist" / "launcher.html"
OUT_LAUNCHER_GS = ROOT / "gas" / "Launcher.gs"

INCLUDE = re.compile(r'^([ \t]*)/\* @include ([\w./\-]+) \*/[ \t]*$', re.M)
DEMO_SCRIPTS = ["../gas/Api.gs", "js/mock-platform.js", "js/demo-seed.js", "js/mock-run.js"]
DEMO_BOOT = ('{view: /teacher/.test(location.hash) ? "teacher" : "helper", '
             'url: "", demo: true}')
BANNER = ("<!-- このファイルは src/ から build.py が作る。\n"
          "     直すのは src/ のほう。ここを直しても次のビルドで消える。 -->\n")


def expand(text, base, depth=0):
    if depth > 5:
        raise SystemExit("@include が深すぎる")

    def sub(m):
        path = (base / m.group(2)).resolve()
        if not path.exists():
            raise SystemExit("見つからない: " + m.group(2))
        body = path.read_text(encoding="utf-8").rstrip("\n")
        return expand(body, path.parent, depth + 1)
    return INCLUDE.sub(sub, text)


def build(demo):
    html = (SRC / "index.html").read_text(encoding="utf-8")
    launcher = LAUNCHER.read_text(encoding="utf-8")
    if demo:
        scripts = "\n".join("<script>\n/* @include %s */\n</script>" % s for s in DEMO_SCRIPTS)
        html = html.replace("<!-- @demo-only -->", scripts)
        html = html.replace("<?!= boot ?>", DEMO_BOOT)
    else:
        html = html.replace("<!-- @demo-only -->\n", "")
    html = expand(html, SRC)
    html = html.replace('"@@LAUNCHER@@"', json.dumps(launcher, ensure_ascii=False).replace("</", "<\\/"))
    if "@@LAUNCHER@@" in html or "@include" in html:
        raise SystemExit("置き換え残りがある")
    head, rest = html.split("\n", 1)
    return head + "\n" + BANNER + rest


def launcher_gs():
    body = json.dumps(LAUNCHER.read_text(encoding="utf-8"), ensure_ascii=False)
    return ("/* このファイルは launcher/launcher.html から build.py が作る。直すのは launcher/ のほう。 */\n"
            "var LAUNCHER_HTML = " + body + ";\n")


def main():
    check = "--check" in sys.argv
    outs = {OUT_GAS: build(False), OUT_DEMO: build(True),
            OUT_LAUNCHER: LAUNCHER.read_text(encoding="utf-8"),
            OUT_LAUNCHER_GS: launcher_gs()}
    bad = []
    for path, text in outs.items():
        if check:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                bad.append(str(path.relative_to(ROOT)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
            print("書き出した:", path.relative_to(ROOT))
    if bad:
        print("生成物が src と合っていない:", ", ".join(bad), "→ python3 build.py を回す")
        sys.exit(1)
    if check:
        print("生成物は src と一致している")


if __name__ == "__main__":
    main()
