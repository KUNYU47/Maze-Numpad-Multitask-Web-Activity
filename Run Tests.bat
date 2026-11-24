@echo off
REM Runs all tests for The Getaway Route (needs Node.js and Microsoft Edge or Chrome).
cd /d "%~dp0"
node --test tests/unit.test.js
if errorlevel 1 goto end
node tests/e2e.mjs
:end
pause
