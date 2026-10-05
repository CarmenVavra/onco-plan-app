@echo off
setlocal EnableExtensions
title OncoPlan Start
cd /d "%~dp0"

rem ================================================================
rem  OncoPlan - startet Datenbank, Backend und Frontend
rem    Datenbank : localhost:5433 (eingebetteter PostgreSQL)
rem    Backend   : http://localhost:3000
rem    Frontend  : http://localhost:4300
rem  Beenden mit stop.bat
rem ================================================================

set "FRONTEND_PORT=4300"

where npm >nul 2>&1
if errorlevel 1 (
  echo [FEHLER] Node.js/npm wurde nicht gefunden. Bitte Node.js 22 oder neuer installieren.
  pause
  exit /b 1
)

rem --- Laeuft OncoPlan bereits? -----------------------------------
call :isListening 3000
if not errorlevel 1 (
  echo OncoPlan laeuft bereits.
  call :openBrowser
  exit /b 0
)

rem --- Erststart: Abhaengigkeiten ---------------------------------
if not exist "backend\node_modules" goto install
if not exist "frontend\node_modules" goto install
goto env

:install
echo [1/5] Installiere Abhaengigkeiten (einmalig, dauert einige Minuten) ...
call npm run install:all
if errorlevel 1 (
  echo [FEHLER] Installation fehlgeschlagen.
  pause
  exit /b 1
)

:env
rem --- Erststart: Umgebungsvariablen ------------------------------
echo [2/5] Pruefe Konfiguration ...
call node backend\scripts\init-env.mjs
if errorlevel 1 (
  echo [FEHLER] backend\.env konnte nicht angelegt werden.
  pause
  exit /b 1
)

set "FIRST_DB_RUN=0"
if not exist "backend\.pgdata\PG_VERSION" set "FIRST_DB_RUN=1"

rem --- Datenbank ---------------------------------------------------
echo [3/5] Starte Datenbank ...
call :isListening 5433
if errorlevel 1 (
  start "OncoPlan Datenbank" /min cmd /k "npm --prefix backend run db:embedded"
)
call :waitFor 5433 120 "Datenbank"
if errorlevel 1 goto failed

if "%FIRST_DB_RUN%"=="1" (
  echo       Erststart: lege Schema und Demo-Daten an ...
  call npm run setup
  if errorlevel 1 (
    echo [FEHLER] Datenbank-Einrichtung fehlgeschlagen.
    goto failed
  )
)

rem --- Backend -----------------------------------------------------
echo [4/5] Starte Backend ...
start "OncoPlan Backend" /min cmd /k "npm --prefix backend run dev"
call :waitFor 3000 90 "Backend"
if errorlevel 1 goto failed

rem --- Frontend ----------------------------------------------------
echo [5/5] Starte Frontend ...
call :isListening %FRONTEND_PORT%
if not errorlevel 1 (
  echo [FEHLER] Port %FRONTEND_PORT% ist bereits von einem anderen Programm belegt.
  goto failed
)
start "OncoPlan Frontend" /min cmd /k "npm --prefix frontend start -- --port %FRONTEND_PORT%"
call :waitFor %FRONTEND_PORT% 180 "Frontend"
if errorlevel 1 goto failed

echo.
echo ================================================================
echo  OncoPlan laeuft:  http://localhost:%FRONTEND_PORT%
echo  Demo-Konten und Passwort: siehe README.md bzw. backend\.env
echo  Beenden mit stop.bat
echo ================================================================
call :openBrowser
timeout /t 5 >nul 2>&1
exit /b 0

:failed
echo.
echo Start abgebrochen. Details stehen in den minimierten Fenstern "OncoPlan ...".
echo Mit stop.bat raeumst du bereits gestartete Teile wieder auf.
pause
exit /b 1

rem ================================================================
rem  Hilfsroutinen
rem ================================================================

rem :isListening <port>  ->  errorlevel 0 = Port belegt
rem (Get-NetTCPConnection statt netstat: sprachunabhaengig, IPv4 + IPv6)
:isListening
powershell -NoProfile -NonInteractive -Command "if (Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
exit /b %errorlevel%

rem :waitFor <port> <sekunden> <name>
:waitFor
set /a "_left=%~2"
:waitLoop
call :isListening %~1
if not errorlevel 1 (
  echo       %~3 bereit.
  exit /b 0
)
if %_left% LEQ 0 (
  echo [FEHLER] %~3 ist nach %~2 Sekunden nicht erreichbar - Port %~1.
  exit /b 1
)
set /a "_left-=1"
rem 1 Sekunde warten (ping funktioniert auch ohne interaktive Konsole)
ping -n 2 127.0.0.1 >nul
goto waitLoop

:openBrowser
if "%ONCOPLAN_NO_BROWSER%"=="1" exit /b 0
start "" "http://localhost:%FRONTEND_PORT%"
exit /b 0
