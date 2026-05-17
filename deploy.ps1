# カラクリ庭 デプロイスクリプト
# このファイルをダブルクリックして実行してください

Set-Location $PSScriptRoot

Write-Host "=== カラクリ庭 デプロイ ===" -ForegroundColor Cyan

# npm install
Write-Host "`n[1/4] npm install..." -ForegroundColor Yellow
npm install

# git 初期化＆プッシュ
Write-Host "`n[2/4] GitHubにプッシュ..." -ForegroundColor Yellow
git init
git add -A
git commit -m "feat: initial release - Vite + React + Firebase web app"
git branch -M main
git remote add origin https://github.com/du0000du/karakuri-tei.git 2>$null
git push -u origin main

# Vercel デプロイ
Write-Host "`n[3/4] Vercelにデプロイ..." -ForegroundColor Yellow
npx vercel --yes --name karakuri-tei

Write-Host "`n[4/4] 環境変数を設定してください（Vercelダッシュボード）" -ForegroundColor Green
Write-Host "  VITE_FIREBASE_API_KEY=AIzaSyBCszwye3AjzbV3IAcT55Uvv5SIOKbajiU"
Write-Host "  VITE_FIREBASE_AUTH_DOMAIN=tekuteku-log.firebaseapp.com"
Write-Host "  VITE_FIREBASE_PROJECT_ID=tekuteku-log"
Write-Host "  VITE_FIREBASE_STORAGE_BUCKET=tekuteku-log.firebasestorage.app"
Write-Host "  VITE_FIREBASE_MESSAGING_SENDER_ID=944373620226"
Write-Host "  VITE_FIREBASE_APP_ID=1:944373620226:web:35e37bef4de6791fa5111b"

Write-Host "`n完了！" -ForegroundColor Green
Read-Host "Enterキーで閉じる"
