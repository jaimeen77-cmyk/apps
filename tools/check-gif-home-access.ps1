[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$')]
    [string]$CarIp,

    [Parameter(Mandatory = $true)]
    [string]$IdentityFile,

    [string]$OutputFile = (Join-Path (Get-Location).Path ('gif-home-access-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt'))
)

# Read-only check for the parked "My picture" layout: can Cluster Redline read GIF Home's GIF library?
# Finds the installed OAP apps (/var/opt/public/oap/oap_*), which one is GIF Home (data/gifs, data/library.json)
# and which is Cluster Redline (data/my-pictures, data/driver-profiles.json), the user and groups the running
# Cluster Redline process has, and whether those may read GIF Home's files (each folder on the way and the files).
# Prints the start of library.json (the GIF names and groups) so the layout can later pick GIFs by group.
# Nothing on the car is written, started, stopped or changed. The key file is only passed to ssh.

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

# Literal POSIX sh, sent to SSH stdin without local PowerShell expansion. Read-only.
$remoteScript = @'
root=/var/opt/public/oap
printf '%s\n' 'GIF HOME ACCESS CHECK (read-only)' '=== START (UTC) ==='
date -u '+%Y-%m-%dT%H:%M:%SZ'
uname -a 2>/dev/null
command -v id >/dev/null 2>&1 && id

# may uid $1 with groups "$2" use $3 for $4 (r = read a file, x = enter a folder)? (mode bits only)
can() {
    s=$(stat -c '%u %g %a' "$3" 2>/dev/null) || { echo no; return; }
    set -- "$1" "$2" "$3" "$4" $s
    [ "$1" = 0 ] && { echo yes; return; }
    m=$7; o=${m#${m%???}}; ou=${o%??}; og=${o#?}; og=${og%?}; ot=${o#??}
    if [ "$5" = "$1" ]; then d=$ou; else d=$ot; for g in $2; do [ "$g" = "$6" ] && d=$og; done; fi
    [ "$4" = r ] && b=4 || b=1
    [ $(( d & b )) -ne 0 ] && echo yes || echo no
}
# every folder from / down to $3 must be enterable, then $3 readable (or enterable, for a folder)
path_ok() {
    p=''; rest=${3#/}
    while [ -n "$rest" ]; do
        part=${rest%%/*}; [ "$part" = "$rest" ] && rest='' || rest=${rest#*/}
        p="$p/$part"
        if [ -n "$rest" ] || [ -d "$p" ]; then [ "$(can "$1" "$2" "$p" x)" = yes ] || { echo "no (cannot enter $p)"; return; }; fi
    done
    if [ -d "$3" ]; then [ "$(can "$1" "$2" "$3" r)" = yes ] && echo yes || echo "no (cannot list $3)"
    else [ "$(can "$1" "$2" "$3" r)" = yes ] && echo yes || echo "no (cannot read $3)"; fi
}

printf '\n%s\n' '=== INSTALLED OAP APPS ==='
gif_home=''; redline=''
for d in "$root"/oap_*; do
    [ -d "$d" ] || continue
    kind=other
    if [ -e "$d/data/library.json" ] || [ -d "$d/data/gifs" ]; then kind=gif_home; gif_home="$gif_home $d"; fi
    if [ -d "$d/data/my-pictures" ] || [ -e "$d/data/driver-profiles.json" ]; then kind=cluster_redline; redline="$redline $d"; fi
    name=$(grep -m1 -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$d/package.json" 2>/dev/null)
    printf '%s  kind=%s  %s\n' "$d" "$kind" "$name"
    ls -ld "$d" "$d/data" 2>/dev/null
done
[ -n "$gif_home" ] || printf '%s\n' 'GIF_HOME_NOT_FOUND (install GIF Home and upload one GIF first)'
[ -n "$redline" ] || printf '%s\n' 'CLUSTER_REDLINE_NOT_FOUND'

printf '\n%s\n' '=== GIF HOME LIBRARY ==='
for d in $gif_home; do
    printf '%s\n' "APP: $d"
    ls -ld "$d/data/gifs" "$d/data/library.json" 2>/dev/null
    ls -l "$d/data/gifs" 2>/dev/null | head -n 12
    printf '%s\n' '--- library.json (first 2000 bytes) ---'
    head -c 2000 "$d/data/library.json" 2>/dev/null; printf '\n'
done

printf '\n%s\n' '=== RUNNING APP PROCESSES (oap) ==='
for s in /proc/[0-9]*/status; do
    pid=${s#/proc/}; pid=${pid%/status}
    cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)
    cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null)
    case "$cmd $cwd" in *"$root"/oap_*) ;; *) continue ;; esac
    uid=$(awk '/^Uid:/{print $2}' "$s"); gid=$(awk '/^Gid:/{print $2}' "$s"); groups=$(awk '/^Groups:/{$1="";print}' "$s")
    printf 'PID %s uid=%s gid=%s groups=%s\n  cwd=%s\n  cmd=%.200s\n' "$pid" "$uid" "$gid" "$groups" "$cwd" "$cmd"
    for r in $redline; do
        case "$cmd $cwd" in *"$r"*)
            printf '  -> Cluster Redline process (%s)\n' "$r"
            for g in $gif_home; do
                for f in "$g/data" "$g/data/gifs" "$g/data/library.json" $(ls -d "$g"/data/gifs/* 2>/dev/null | head -n 1); do
                    printf '  VERDICT read %s: %s\n' "$f" "$(path_ok "$uid" "$gid $groups" "$f")"
                done
            done ;;
        esac
    done
done
printf '\n%s\n' '=== SECURITY MODULES ==='
[ -e /sys/fs/selinux/enforce ] && printf 'SELinux enforce=%s\n' "$(cat /sys/fs/selinux/enforce)" || printf '%s\n' 'SELinux: none'
[ -d /sys/kernel/security/smack ] && printf '%s\n' 'SMACK: present' || printf '%s\n' 'SMACK: none'
cat /proc/self/attr/current 2>/dev/null; printf '\n'
printf '\n%s\n' '=== END (UTC) ==='
date -u '+%Y-%m-%dT%H:%M:%SZ'
exit 0
'@
$remoteScript = $remoteScript.Replace("`r", '')
$remoteScript += "`n"

Write-Host 'Read-only check: takes a few seconds. Start Cluster Redline (and have GIF Home installed with at least one GIF).'
Write-Host ('Report: ' + $reportPath)
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
$capture | ForEach-Object { $_.ToString() } | Where-Object { $_ -match 'VERDICT|NOT_FOUND|kind=(gif_home|cluster_redline)|SELinux|SMACK' } | ForEach-Object { Write-Host $_ }
Write-Host ('Saved: ' + $reportPath)
