[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$')]
    [string]$CarIp,

    [Parameter(Mandatory = $true)]
    [string]$IdentityFile,

    [string]$OutputFile = (Join-Path (Get-Location).Path ('cluster-redline-report-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt'))
)

Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'
$parsedAddress = $null
if (-not [System.Net.IPAddress]::TryParse($CarIp, [ref]$parsedAddress)) {
    throw 'CarIp must be the IPv4 address you use for the existing car SSH connection.'
}
$sshCommand = Get-Command ssh -CommandType Application -ErrorAction Stop | Select-Object -First 1
$keyPath = (Resolve-Path -LiteralPath $IdentityFile -ErrorAction Stop).ProviderPath
if (-not (Test-Path -LiteralPath $keyPath -PathType Leaf)) {
    throw 'IdentityFile must point to your existing SSH private key file.'
}
$reportPath = [System.IO.Path]::GetFullPath($OutputFile)

# Literal ASCII script: sent to SSH stdin, without local PowerShell expansion.
# Reads only renderer metadata/config/status/logs and this app's status JSON.
# No settings writes, service restarts, DCSM requests, or key content collection.
$remoteScript = @'
task_root=${1:-}
sample_count=${2:-18}
sample_seconds=${3:-3}
printf '%s\n' 'CLUSTER REDLINE READ-ONLY REPORT' '=== CAPTURE START (UTC) ==='
date -u '+%Y-%m-%dT%H:%M:%SZ'
printf '%s\n' '=== RENDERER METADATA ==='
metadata_found=0
for suffix in /var/opt/cluster-render/current/component.json /var/opt/cluster-render/component.json; do
    file="$task_root$suffix"
    if [ -r "$file" ]; then
        printf '%s\n' "PATH: $suffix"
        cat "$file"
        printf '\n'
        metadata_found=1
        break
    fi
done
[ "$metadata_found" -eq 1 ] || printf '%s\n' 'RENDERER_METADATA_NOT_FOUND'
printf '%s\n' '=== RENDERER DISPLAY CONFIG ==='
for suffix in /var/opt/cluster-render/current/cluster-render.conf /var/opt/cluster-render/cluster-render.conf /var/opt/cluster-render/cluster-render.local.conf; do
    file="$task_root$suffix"
    if [ -r "$file" ]; then
        printf '%s\n' "PATH: $suffix"
        grep -E '^[[:space:]]*(map_|panel_|hud_|guide_|targets[[:space:]]*=|generation[[:space:]]*=|scene_ids_allowed|guard_path|status_path|log_file|dcsm_hmi_client_handle)' "$file" || :
    fi
done
printf '%s\n' '=== BEFORE: RENDERER LOG TAIL ==='
log_file="$task_root/var/opt/cluster-render/log/cluster-render.log"
if [ -r "$log_file" ]; then tail -n 100 "$log_file"; else printf '%s\n' 'RENDERER_LOG_NOT_FOUND'; fi
sample=1
while [ "$sample" -le "$sample_count" ]; do
    printf '\n=== SAMPLE %s / %s (UTC) ===\n' "$sample" "$sample_count"
    date -u '+%Y-%m-%dT%H:%M:%SZ'
    printf '%s\n' '--- renderer status ---'
    status_file="$task_root/run/cluster-render/status.txt"
    if [ -r "$status_file" ]; then cat "$status_file"; else printf '%s\n' 'RENDERER_STATUS_NOT_FOUND'; fi
    printf '\n%s\n' '--- Cluster Redline app status (all installed instances) ---'
    app_found=0
    for file in "$task_root"/var/opt/public/oap/oap_*/data/cluster-redline-status.json; do
        [ -r "$file" ] || continue
        app_found=1
        printf '%s\n' "PATH: $file"
        cat "$file"
        printf '\n'
    done
    [ "$app_found" -eq 1 ] || printf '%s\n' 'APP_STATUS_NOT_FOUND'
    sample=$((sample + 1))
    if [ "$sample" -le "$sample_count" ]; then sleep "$sample_seconds"; fi
done
printf '\n%s\n' '=== AFTER: RENDERER LOG TAIL ==='
if [ -r "$log_file" ]; then tail -n 400 "$log_file"; else printf '%s\n' 'RENDERER_LOG_NOT_FOUND'; fi
printf '\n%s\n' '=== SPEED LIMIT DATA COLLECTION (hidden menu; only when it was turned on) ==='
probe_found=0
for file in "$task_root"/var/opt/public/oap/oap_*/data/speed-probe.log.1 "$task_root"/var/opt/public/oap/oap_*/data/speed-probe.log; do
    [ -r "$file" ] || continue
    probe_found=1
    printf '%s\n' "PATH: $file"
    head -n 3 "$file"
    printf '%s\n' '...'
    tail -n 600 "$file"
done
[ "$probe_found" -eq 1 ] || printf '%s\n' 'SPEED_PROBE_LOG_NOT_FOUND'
printf '\n%s\n' '=== CAPTURE END (UTC) ==='
date -u '+%Y-%m-%dT%H:%M:%SZ'
exit 0
'@
$remoteScript = $remoteScript.Replace("`r", '')
# Keep exit on an LF-terminated line before Windows appends its pipe newline.
$remoteScript += "`n"

Write-Host 'Capture takes about 55 seconds. Keep the car stationary.'
Write-Host 'Choose the output to test (map, panel or HUD) in the app before capture.'
Write-Host 'While capture runs, reproduce the missing display once, for example by switching Comfort to Sport.'
Write-Host 'Leave the resulting display as it is until capture finishes.'
Write-Host ('Report: ' + $reportPath)

# Windows PowerShell can turn native stderr into ErrorRecords. Preserve them in
# the report, then use the SSH exit code to distinguish connection failures.
$ErrorActionPreference = 'Continue'
try {
    $capture = @($remoteScript | & $sshCommand.Source -T -i $keyPath -o BatchMode=yes -o ConnectTimeout=10 ('root@' + $CarIp) 'sh -s' 2>&1)
    $sshExit = $LASTEXITCODE
} finally {
    $ErrorActionPreference = 'Stop'
}
$capture | ForEach-Object { $_.ToString() } | Out-File -LiteralPath $reportPath -Encoding utf8
if ($sshExit -ne 0) {
    throw ('SSH failed (exit ' + $sshExit + '). Details are in ' + $reportPath + '. Check your normal car SSH connection first.')
}
Write-Host ('Saved: ' + $reportPath)
