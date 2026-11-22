param(
    [string]$Message = "Update daily English study PDF & vocab"
)
Set-Location "D:\english-study-hub"
git add .
git commit -m $Message
git push origin main
Write-Host "Published to GitHub Pages!" -ForegroundColor Green
