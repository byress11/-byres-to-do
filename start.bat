@echo off
echo TaskMaster Pro Widget - Kurulum ve Baslat
echo ==========================================
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo Node_modules bulunamadi. Paketler yukleniyor...
    echo.
    call npm install
    echo.
    echo Yukleme tamamlandi!
    echo.
)

echo Uygulama baslatiliyor...
echo.
npm start

