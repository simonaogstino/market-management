@echo off
cd /d "%~dp0"
echo Market Management - setup
echo.
call npm.cmd run setup
if errorlevel 1 (
  echo.
  echo Setup failed. See errors above.
  pause
  exit /b 1
)
echo.
echo Done! Run dev.bat to start the app.
pause
