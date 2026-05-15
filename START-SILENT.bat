@echo off
chcp 65001 > nul

REM Start Server in background
cd /d "%~dp0server"
start /MIN "" cmd /c "node index.js > server.log 2>&1"

REM Wait 3 seconds
timeout /t 3 /nobreak >nul

REM Start Frontend in background
cd /d "%~dp0"
start /MIN "" cmd /c "npm run dev > frontend.log 2>&1"

REM Wait 5 seconds then open browser
timeout /t 5 /nobreak >nul
start http://localhost:3000

REM Exit silently
exit
