@echo off
cd /d "%~dp0"
echo Starting Market Management...
echo.
echo   POS:   http://localhost:3000/pos
echo   Admin: http://localhost:3000/admin
echo.
call npm.cmd run dev
