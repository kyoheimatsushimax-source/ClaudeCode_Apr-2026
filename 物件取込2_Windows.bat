@echo off
rem ============================================================
rem  物件取込（Windows用）
rem  data\my_listings.csv に書いた掲載物件を地図に取り込みます。
rem  CSV は Excel で編集できます（例の行は消して使ってください）。
rem  ※このファイルは Shift_JIS(CP932)・CRLF で保存すること
rem ============================================================
setlocal
cd /d "%~dp0"

if not exist .venv (
    echo 先に「かんたん起動2_Windows.bat」を一度実行してください。
    pause
    exit /b 1
)
call .venv\Scripts\activate.bat

if not exist data\my_listings.csv (
    echo data\my_listings.csv が見つかりません。
    pause
    exit /b 1
)

echo 物件を取り込んでいます（住所から位置を調べるため少し時間がかかります）...
python -m app.cli import data\my_listings.csv
if errorlevel 1 goto err
python -m app.cli stats
python -m app.cli score

echo.
echo 完了しました。「かんたん起動2_Windows.bat」で地図を開くと反映されています。
pause
exit /b 0

:err
echo.
echo エラーが発生しました。CSV の内容を確認してください。
pause
exit /b 1
