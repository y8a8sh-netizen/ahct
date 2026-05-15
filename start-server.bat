@echo off
echo ========================================
echo    نظام جداول الكلية التقنية
echo    تشغيل السيرفر
echo ========================================
echo.

cd /d "%~dp0server"

echo جارٍ تشغيل السيرفر...
echo.

node index.js

pause
