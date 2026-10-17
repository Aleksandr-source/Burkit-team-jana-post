@echo off
setlocal
chcp 65001 >nul
pushd "%~dp0"
if errorlevel 1 (
  echo Asar: не удалось открыть папку приложения.
  pause
  exit /b 1
)
set "ASAR_NODE=%~dp0.runtime\windows-x64\node.exe"
if exist "%ASAR_NODE%" goto launch
set "ASAR_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  echo Asar: Node.js не найден. Нужен комплектный .runtime\windows-x64\node.exe или Node.js 24.11 и новее в PATH.
  popd
  pause
  exit /b 1
)
:launch
"%ASAR_NODE%" "%~dp0scripts\portable-start.mjs"
set "ASAR_EXIT=%ERRORLEVEL%"
echo.
echo Asar остановлен. Это окно можно закрыть.
popd
pause
exit /b %ASAR_EXIT%
