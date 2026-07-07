@echo off
cd /d "%~dp0"
echo Updating database schema...
call npm.cmd run db:generate
call npm.cmd run db:push
echo Done.
pause
