@echo off
REM Nightly TokenWatt reading. Invoked by the scheduled task; also fine to
REM double-click. Everything is appended to collector.log, which is the only
REM way to see what a task that ran at 00:00 actually did.

cd /d "%~dp0.."

echo.>> collector.log
echo ==== %DATE% %TIME% ====>> collector.log

node collector\collect.mjs --push>> collector.log 2>&1
set RESULT=%ERRORLEVEL%

REM A non-zero result means either the database or the push was refused. The
REM daily files are on disk regardless, so replay them — it costs twenty
REM seconds, it is idempotent, and it means a database that was unreachable at
REM midnight does not leave a hole in the record until tomorrow.
if not "%RESULT%"=="0" (
  echo ---- repair pass ---->> collector.log
  node scripts\sync-db.mjs>> collector.log 2>&1
  echo repair exit=%ERRORLEVEL%>> collector.log
)

echo exit=%RESULT%>> collector.log
exit /b %RESULT%
