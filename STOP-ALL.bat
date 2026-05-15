@echo off
chcp 65001 > nul
title نظام جداول الكلية التقنية - إيقاف النظام
color 0C

echo ========================================
echo    🛑 نظام جداول الكلية التقنية
echo    إيقاف السيرفر والواجهة
echo ========================================
echo.

echo [1/2] 🔍 البحث عن عمليات Node.js...

:: Kill all node processes
echo.
echo [2/2] 🛑 إيقاف جميع عمليات Node.js...
taskkill /F /IM node.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✅ تم إيقاف السيرفر والواجهة بنجاح
) else (
    echo ⚠️ لا توجد عمليات Node.js قيد التشغيل
)

echo.
echo ========================================
echo ✅ تم إيقاف النظام بنجاح!
echo ========================================
echo.
echo 💡 يمكنك الآن تشغيل النظام مرة أخرى باستخدام:
echo    - START-ALL.bat (عادي مع نوافذ)
echo    - START-SILENT.bat (صامت في الخلفية)
echo.
pause
