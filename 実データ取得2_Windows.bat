@echo off
rem ============================================================
rem  実データ取得（Windows用）
rem  国交省「不動産情報ライブラリ」から実際の成約・取引データを
rem  取得します。事前に APIキー（無料）の取得が必要です。
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

if exist apikey.txt goto haskey
echo 不動産情報ライブラリのAPIキーを貼り付けて Enter を押してください。
echo （この黒い画面の上で右クリックすると貼り付けできます）
set /p APIKEY=APIキー:
if "%APIKEY%"=="" (
    echo 入力がありませんでした。もう一度ダブルクリックしてください。
    pause
    exit /b 1
)
>apikey.txt echo %APIKEY%
:haskey

echo.
echo これから今あるデータを消して、国交省の実データ（1都3県・約3年分）を
echo 取得し直します。完了まで30分～1時間ほどかかります。
echo 途中でこの画面を閉じないでください。
echo.
echo よろしければ何かキーを押してください。やめる場合は右上の×で閉じてください。
pause >nul

if exist data\app.db del data\app.db
python -m app.cli fetch --from 2022Q3 --to 2025Q2
if errorlevel 1 goto err
echo エリア統計と地図用の位置情報を計算しています（ここが一番長いです）...
python -m app.cli stats --geocode-areas
if errorlevel 1 goto err
python -m app.cli score

echo.
echo ============================================
echo  完了しました！
echo  「かんたん起動2_Windows.bat」をダブルクリックすると
echo  実データの地図が開きます。
echo ============================================
pause
exit /b 0

:err
echo.
echo エラーが発生しました。
echo APIキーの間違いが原因の場合は、このフォルダの apikey.txt を削除してから
echo もう一度このファイルをダブルクリックしてください。
pause
exit /b 1
