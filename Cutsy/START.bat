@echo off
cd /d "%~dp0"
echo ====================================
echo   2D Modeler - Запуск сервера
echo ====================================
echo.
start http://localhost:8080/index.html
node server.js
pause
