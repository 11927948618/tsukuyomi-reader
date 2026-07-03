param(
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $Root

function Pause-IfNeeded {
  if (-not $NoPause) {
    Write-Host ""
    Read-Host "Press Enter to close"
  }
}

function Run-Native {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Command
  )

  $global:LASTEXITCODE = 0
  & $Command
  if ($LASTEXITCODE) {
    throw "Command failed with exit code $LASTEXITCODE"
  }
}

try {
  $now = Get-Date -Format "yyyy/MM/dd HH:mm:ss"
  Write-Host "===== [$now] backup_push start ($Root) ====="
  Write-Host "[backup] Repo: $Root"

  Run-Native { git rev-parse --is-inside-work-tree }

  $manifestScript = Join-Path $Root "scripts\generate-book-manifest.mjs"
  if (Test-Path -LiteralPath $manifestScript) {
    Write-Host "[backup] Updating bundled-book manifest..."
    Run-Native { node $manifestScript }
  }

  Write-Host "[backup] status:"
  Run-Native { git status -sb }

  $changes = @(& git status --porcelain)
  if (-not $changes.Count) {
    Write-Host "[backup] No changes. Nothing to do."
    $latest = & git log -1 --oneline
    Write-Host "[backup] Latest: $latest"
    Pause-IfNeeded
    exit 0
  }

  Write-Host ""
  Write-Host "[backup] Changed files:"
  foreach ($line in $changes) {
    Write-Host $line
  }
  Write-Host ""

  if ($NoPause) {
    Write-Host "[backup] Changes detected. NoPause mode stops before commit."
    exit 2
  }

  $answer = Read-Host "[backup] Commit & Push? (Y/N)"
  if ($answer -ine "Y") {
    Write-Host "[backup] Cancelled."
    Pause-IfNeeded
    exit 0
  }

  $versionScript = Join-Path $Root "scripts\update-version-meta.mjs"
  if (Test-Path -LiteralPath $versionScript) {
    Write-Host "[backup] Updating version metadata..."
    Run-Native { node $versionScript --bump }
  }

  Run-Native { git add -A }
  $message = "backup $(Get-Date -Format 'yyyy/MM/dd HH:mm:ss')"
  Run-Native { git commit -m $message }
  Run-Native { git push -u origin main }

  Write-Host "[backup] pushed."
  Write-Host "===== [$now] backup_push end ====="
  Pause-IfNeeded
  exit 0
} catch {
  Write-Host "[backup] ERROR: $($_.Exception.Message)"
  Pause-IfNeeded
  exit 1
}
