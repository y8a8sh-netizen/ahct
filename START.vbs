Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the directory of this script
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Start Server (completely hidden)
WshShell.Run "cmd /c cd /d """ & scriptDir & "\server"" && node index.js > server.log 2>&1", 0, False

' Wait 3 seconds
WScript.Sleep 3000

' Start Frontend (completely hidden)
WshShell.Run "cmd /c cd /d """ & scriptDir & """ && npm run dev > frontend.log 2>&1", 0, False

' Wait 6 seconds for services to start
WScript.Sleep 6000

' Open browser
WshShell.Run "http://localhost:3000", 1, False

' Show notification
WshShell.Popup "مرحباً بكم في برنامج جداول الاختبارات" & vbCrLf & vbCrLf & "✅ تم تشغيل النظام بنجاح!" & vbCrLf & vbCrLf & "📡 السيرفر: http://localhost:3001" & vbCrLf & "🌐 الواجهة: http://localhost:3000" & vbCrLf & vbCrLf & "🔐 مدير النظام: postgres / admin123" & vbCrLf & vbCrLf & "🛑 للإيقاف: استخدم STOP-ALL.bat", 8, "نظام جداول الاختبارات 🎓", 64

Set WshShell = Nothing
Set fso = Nothing
