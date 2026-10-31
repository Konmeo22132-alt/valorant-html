@echo off
cd /d "%~dp0"
node --max-old-space-size=256 ..\server\server.cjs
if errorlevel 1 pause
