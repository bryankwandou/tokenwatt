' Runs the collector with no window, for the scheduled task. An hourly console
' would steal focus, and closing it by accident would kill the run.
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
cmd = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "run-collector.cmd")
WScript.Quit shell.Run("cmd.exe /c """"" & cmd & """""", 0, True)
