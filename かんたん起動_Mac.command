#!/bin/bash
# 関東マンション割安マップ かんたん起動（Mac用）
# このファイルをダブルクリックするだけで、セットアップから起動まで自動で行います。
# 初回に「開発元を確認できないため開けません」と出た場合は、
# ファイルを右クリック →「開く」を選んでください。
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
    echo "Python3 がインストールされていません。"
    echo "https://www.python.org/downloads/ からインストールしてください。"
    read -r -p "Enterキーで閉じます"
    exit 1
fi

if [ ! -d .venv ]; then
    echo "初回セットアップ中です。1〜2分お待ちください..."
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install -r requirements.txt -q

if [ ! -f data/app.db ]; then
    echo "デモデータを準備しています..."
    python -m app.cli demo
fi

echo
echo "ブラウザが自動で開きます。終了するときはこのウィンドウを閉じてください。"
if command -v open >/dev/null 2>&1; then
    (sleep 2 && open http://127.0.0.1:8000) &
fi
python -m app.cli serve
