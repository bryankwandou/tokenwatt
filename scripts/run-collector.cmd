@echo off
REM Nightly TokenWatt reading. Invoked by the scheduled task; also fine to
REM double-click. Everything is appended to collector.log, which is the only
REM way to see what a task that ran at 00:00 actually did.

cd /d "%~dp0.."

echo.>> collector.log
echo ==== %DATE% %TIME% ====>> collector.log

node collector\collect.mjs --push>> collector.log 2>&1

echo exit=%ERRORLEVEL%>> collector.log
exit /b %ERRORLEVEL%
