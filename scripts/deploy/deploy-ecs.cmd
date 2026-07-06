@echo off
setlocal

set SCRIPT_DIR=%~dp0

where py >nul 2>nul
if %ERRORLEVEL%==0 (
  py -3 "%SCRIPT_DIR%deploy-ecs.py" %*
  exit /b %ERRORLEVEL%
)

set CODEX_PY=C:\Users\jranl\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe
if exist "%CODEX_PY%" (
  "%CODEX_PY%" "%SCRIPT_DIR%deploy-ecs.py" %*
  exit /b %ERRORLEVEL%
)

where python >nul 2>nul
if %ERRORLEVEL%==0 (
  python "%SCRIPT_DIR%deploy-ecs.py" %*
  exit /b %ERRORLEVEL%
)

echo Python not found. Please install Python 3 first.
exit /b 1
