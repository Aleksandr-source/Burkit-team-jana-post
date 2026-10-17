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
if exist "%ASAR_NODE%" goto accounts
set "ASAR_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  echo Asar: Node.js не найден. Используйте комплектный Node.js или установите Node.js 24.11 и новее.
  popd
  pause
  exit /b 1
)
:accounts
echo Демонстрационные учётные записи. Не публикуйте показанные пароли.
echo.
"%ASAR_NODE%" "%~dp0scripts\accounts.mjs"
set "ASAR_EXIT=%ERRORLEVEL%"
echo.
popd
pause
exit /b %ASAR_EXIT%
