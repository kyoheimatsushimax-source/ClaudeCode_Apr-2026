@echo off
rem 関東マンション割安マップ かんたん起動（Windows用）
rem このファイルをダブルクリックするだけで、セットアップから起動まで自動で行います。
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo Python がインストールされていません。
    echo https://www.python.org/downloads/ からインストールしてください。
    echo ※インストール画面で「Add python.exe to PATH」に必ずチェックを入れてください。
    pause
    exit /b 1
)

if not exist .venv (
    echo 初回セットアップ中です。1〜2分お待ちください...
    python -m venv .venv
)
call .venv\Scripts\activate.bat
pip install -r requirements.txt -q

if not exist data\app.db (
    echo デモデータを準備しています...
    python -m app.cli demo
)

echo.
echo ブラウザが自動で開きます。終了するときはこの黒い画面を閉じてください。
start "" http://127.0.0.1:8000
python -m app.cli serve
pause
