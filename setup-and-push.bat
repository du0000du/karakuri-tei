@echo off
chcp 65001 > nul
echo ============================================
echo  カラクリ庭 - GitHub Push Setup
echo ============================================
echo.

cd /d "C:\Users\daiki\Desktop\000_Uematsu\003_事業\05_新規ゲーム開発\001_[カラクリ庭]\04_開発環境\karakuri-tei-webapp"

echo [1/6] npm install...
call npm install
if errorlevel 1 (
  echo ERROR: npm install failed
  pause
  exit /b 1
)

echo.
echo [2/6] git init...
git init

echo.
echo [3/6] git add...
git add -A

echo.
echo [4/6] git commit...
git commit -m "feat: initial release - Vite + React + Firebase"

echo.
echo [5/6] git branch -M main...
git branch -M main

echo.
echo [6/6] git remote add + push...
git remote add origin https://github.com/du0000du/karakuri-tei.git
git push -u origin main

echo.
echo ============================================
echo  Done! GitHub push complete.
echo  Next: go to vercel.com/new to import the repo.
echo ============================================
pause
