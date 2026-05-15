@echo off
chcp 65001 > nul
title نظام جداول الكلية التقنية - تشغيل شامل
color 0A

echo ========================================
echo    🎓 نظام جداول الكلية التقنية
echo    تشغيل السيرفر والواجهة معاً
echo ========================================
echo.

echo [1/3] 🔍 التحقق من المتطلبات...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ خطأ: Node.js غير مثبت!
    echo الرجاء تثبيت Node.js من: https://nodejs.org
    pause
    exit /b 1
)
echo ✅ Node.js مثبت

echo.
echo [2/3] 🚀 تشغيل السيرفر (Backend)...
cd /d "%~dp0server"
start "Server - Backend" cmd /k "echo 🔧 السيرفر (Backend) - المنفذ 3001 && echo. && node index.js"
timeout /t 3 /nobreak >nul

echo.
echo [3/3] 🎨 تشغيل الواجهة (Frontend)...
cd /d "%~dp0"
start "Frontend - Vite" cmd /k "echo 🎨 الواجهة (Frontend) - المنفذ 3000 && echo. && npm run dev"

echo.
echo ========================================
echo ✅ تم تشغيل النظام بنجاح!
echo ========================================
echo.
echo 📡 السيرفر: http://localhost:3001
echo 🌐 الواجهة: http://localhost:3000
echo.
echo 🔐 بيانات دخول المدير:
echo    - اسم المستخدم: postgres
echo    - كلمة المرور: admin123
echo.
echo 💡 ملاحظة: لا تغلق نوافذ الـ CMD حتى يستمر النظام بالعمل
echo.
echo انتظر 5 ثوانٍ ثم سيفتح المتصفح تلقائياً...
timeout /t 5 /nobreak >nul

echo.
echo 🌐 فتح المتصفح...
start http://localhost:3000

echo.
echo ✨ جاهز! استمتع بالنظام
echo.
pause
