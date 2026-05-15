Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the directory of this script
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Create batch file path
batFile = scriptDir & "\START-SILENT.bat"

' Run the batch file completely hidden (window style 0 = hidden)
WshShell.Run """" & batFile & """", 0, False

' Show a simple notification
WshShell.Popup "تم تشغيل نظام جداول الكلية التقنية في الخلفية!" & vbCrLf & vbCrLf & "السيرفر: http://localhost:3001" & vbCrLf & "الواجهة: http://localhost:3000" & vbCrLf & vbCrLf & "سيتم فتح المتصفح خلال لحظات...", 5, "نظام الجداول", 64

Set WshShell = Nothing
Set fso = Nothing
