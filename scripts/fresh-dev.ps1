$ErrorActionPreference = "SilentlyContinue"

$connections = netstat -ano | Select-String ":3000"
$pids = @()

foreach ($line in $connections) {
  $parts = ($line.ToString() -split "\s+") | Where-Object { $_ -ne "" }
  if ($parts.Length -ge 5 -and $parts[3] -eq "LISTENING") {
    $pids += [int]$parts[4]
  }
}

$pids | Sort-Object -Unique | ForEach-Object {
  Stop-Process -Id $_ -Force
}

Get-Process -Name node | Where-Object {
  $_.Path -eq "C:\Program Files\nodejs\node.exe"
} | Stop-Process -Force

Remove-Item -LiteralPath ".next" -Recurse -Force

npm run dev
