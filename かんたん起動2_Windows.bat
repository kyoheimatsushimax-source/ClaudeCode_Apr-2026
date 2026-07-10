@echo off
rem ============================================================
rem  関東マンション割安マップ かんたん起動（Windows用）
rem  このファイルをダブルクリックするだけで起動します。
rem  ※このファイルは Shift_JIS(CP932)・CRLF で保存すること
rem ============================================================
setlocal
cd /d "%~dp0"

rem --- Python を探す（py ランチャー優先。Store のダミーは除外） ---
set "PYCMD="
where py >nul 2>nul
if not errorlevel 1 set "PYCMD=py -3"
if not defined PYCMD (
    python --version >nul 2>nul
    if not errorlevel 1 set "PYCMD=python"
)
if not defined PYCMD (
    echo Python がインストールされていません。
    echo ダウンロードページを開きます。インストールしてから、
    echo もう一度このファイルをダブルクリックしてください。
    start https://www.python.org/downloads/
    pause
    exit /b 1
)

rem --- 初回セットアップ ---
if not exist .venv (
    echo 初回セットアップ中です。1～2分ほどお待ちください...
    %PYCMD% -m venv .venv
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
