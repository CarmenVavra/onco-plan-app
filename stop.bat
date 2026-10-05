@echo off
setlocal EnableExtensions
title OncoPlan Stop
cd /d "%~dp0"

rem ================================================================
rem  OncoPlan - stoppt Frontend, Backend und Datenbank
rem  Es werden nur OncoPlan-Prozesse beendet (Ports 4300, 3000, 5433).
rem ================================================================

echo Stoppe OncoPlan ...

rem --- Datenbank sauber herunterfahren -----------------------------
set "PG_CTL=backend\node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe"
if exist "backend\.pgdata\postmaster.pid" (
  if exist "%PG_CTL%" (
    echo  - Datenbank wird heruntergefahren ...
    "%PG_CTL%" -D "backend\.pgdata" stop -m fast -w >nul 2>&1
  )
)

rem --- Server-Fenster schliessen (inkl. Unterprozesse) -------------
for %%T in ("OncoPlan Frontend" "OncoPlan Backend" "OncoPlan Datenbank") do (
  taskkill /FI "WINDOWTITLE eq %%~T*" /T /F >nul 2>&1
)

rem --- Absicherung: Prozesse, die noch auf den Ports lauschen -------
for %%P in (4300 3000 5433) do call :killPort %%P

echo.
echo OncoPlan wurde gestoppt.
timeout /t 3 >nul 2>&1
exit /b 0

rem :killPort <port> - beendet den Prozessbaum, der auf dem Port lauscht
rem (Get-NetTCPConnection statt netstat: sprachunabhaengig, IPv4 + IPv6)
:killPort
for /f %%I in ('powershell -NoProfile -NonInteractive -Command "Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"') do (
  if not "%%I"=="0" (
    echo  - Beende Prozess %%I auf Port %~1
    taskkill /PID %%I /T /F >nul 2>&1
  )
)
exit /b 0
