@echo off
rem GeneTune launcher: serves this folder on localhost (secure context for Web Serial) and opens the browser.
cd /d "%~dp0"
start "GeneTune server" /min python -m http.server 8765
timeout /t 2 >nul
start "" http://localhost:8765/index.html
