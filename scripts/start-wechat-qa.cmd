@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-wechat-qa.ps1" %*
exit /b %errorlevel%
