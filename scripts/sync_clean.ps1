# ==============================================================================
# SCRIPT ĐỒNG BỘ CODE SẠCH (CLEAN CODE SYNC)
# Mục tiêu: Chỉ copy src, AI_MEMORY và các file cấu hình quan trọng.
# Loại bỏ: node_modules, .next, .git và các file rác khác.
# ==============================================================================

$sourceDir = "C:\hotel-app"

# Tự động chọn thư mục Google Drive nếu có, fallback về thư mục sạch cục bộ
$defaultTargetDir = "C:\hotel-app-clean"
$candidateRoots = @(
    "$env:USERPROFILE\Google Drive",
    "$env:USERPROFILE\My Drive",
    "G:\My Drive"
)
$targetRoot = $null
foreach ($root in $candidateRoots) {
    if (Test-Path $root) { $targetRoot = $root; break }
}

if ($targetRoot) {
    $targetDir = Join-Path $targetRoot "hotel-app-clean"
} else {
    $targetDir = $defaultTargetDir
}

$watch = $true  # Bật chế độ theo dõi thay đổi để tự sync

Write-Host "--- Bat dau quy trinh thanh loc code ---" -ForegroundColor Cyan

# 1. Tạo thư mục đích nếu chưa có
if (!(Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir | Out-Null
    Write-Host "[+] Da tao thu muc sach tai: $targetDir" -ForegroundColor Green
}

# 2. Danh sách các thư mục cần đồng bộ (Mirror)
$foldersToSync = @("src", "AI_MEMORY", "public", "supabase")

foreach ($folder in $foldersToSync) {
    $srcFolder = Join-Path $sourceDir $folder
    $destFolder = Join-Path $targetDir $folder
    
    if (Test-Path $srcFolder) {
        Write-Host "[>] Dang dong bo thu muc: $folder..." -ForegroundColor Yellow
        robocopy $srcFolder $destFolder /MIR /R:0 /W:0 /MT:16 /NDL /NFL /NJH /NJS
    }
}

# 3. Copy các file cấu hình quan trọng ở gốc (không mirror, chỉ copy)
$filesToSync = @(
    "package.json", 
    "tsconfig.json", 
    "next.config.js", 
    "tailwind.config.ts", 
    "README.md",
    "DOCS_DEBT_MANAGEMENT.md",
    ".gitignore",
    "components.json"
)

Write-Host "[>] Dang copy cac file cau hinh..." -ForegroundColor Yellow
foreach ($file in $filesToSync) {
    $srcFile = Join-Path $sourceDir $file
    if (Test-Path $srcFile) {
        Copy-Item $srcFile $targetDir -Force
    }
}

Write-Host "`n--- HOAN THANH ---" -ForegroundColor Cyan
Write-Host "Code sach da san sang tai: $targetDir" -ForegroundColor Green
Write-Host "Doc code khong bi vuong mat boi node_modules hoac .next nua!" -ForegroundColor Green

if ($watch) {
    Write-Host "`n[WATCH] Bat theo doi thay doi de tu dong sync..." -ForegroundColor Cyan
    $fsw = New-Object System.IO.FileSystemWatcher
    $fsw.Path = $sourceDir
    $fsw.IncludeSubdirectories = $true
    $fsw.EnableRaisingEvents = $true
    $fsw.Filter = "*.*"

    $shouldSync = $false
    $debounceMs = 1000

    $onChanged = Register-ObjectEvent $fsw Changed -Action {
        # Loai bo cac thu muc rac
        if ($Event.SourceEventArgs.FullPath -match "\\node_modules\\" -or $Event.SourceEventArgs.FullPath -match "\\.next\\" -or $Event.SourceEventArgs.FullPath -match "\\.git\\") {
            return
        }
        $Script:shouldSync = $true
    }
    $onCreated = Register-ObjectEvent $fsw Created -Action { $Script:shouldSync = $true }
    $onDeleted = Register-ObjectEvent $fsw Deleted -Action { $Script:shouldSync = $true }
    $onRenamed = Register-ObjectEvent $fsw Renamed -Action { $Script:shouldSync = $true }

    while ($true) {
        if ($shouldSync) {
            Start-Sleep -Milliseconds $debounceMs
            $shouldSync = $false
            Write-Host "[WATCH] Phat hien thay doi. Dang sync..." -ForegroundColor Yellow
            foreach ($folder in $foldersToSync) {
                $srcFolder = Join-Path $sourceDir $folder
                $destFolder = Join-Path $targetDir $folder
                if (Test-Path $srcFolder) {
                    robocopy $srcFolder $destFolder /MIR /R:0 /W:0 /MT:16 /NDL /NFL /NJH /NJS | Out-Null
                }
            }
            foreach ($file in $filesToSync) {
                $srcFile = Join-Path $sourceDir $file
                if (Test-Path $srcFile) {
                    Copy-Item $srcFile $targetDir -Force
                }
            }
            Write-Host "[WATCH] Da sync xong." -ForegroundColor Green
        }
        Start-Sleep -Milliseconds 500
    }
}
