# MGU Monitor 1.1.1

[한국어](README.ko.md)

Previously **Storage**. The `storage` / `storage_en` IDs are preserved so existing
installs update normally to **MGU Monitor / MGU 모니터 1.1.1**.

Storage and resource monitor for BMW MGU / iDrive 7 (ID7). Displays disk usage,
free space on the apps filesystem, RAM usage and allocated disk space per app
under `/var/opt/public/oap`. The home widget shows usage and highlights the
configured warning threshold (80% by default). It only writes/prunes its own usage logs and does not change vehicle settings; the warning is within the app/widget.

In MGU Store add source **`jaimeen77-cmyk/apps`**, branch **`main`**, refresh,
then install **MGU Monitor (English) 1.1.1** or **MGU 모니터 (한국어) 1.1.1**.
Both editions install independently. Requires `mgu-deploy >= 0.7.17` and the
vehicle's SDK donor, supplied by MGU Store during installation.

Use Refresh to rescan; Next page switches disks/apps/CPU-Memory. Settings control the
warning threshold, initial page, RAM/read-only partitions, units and theme.
Leave Preview data at **Auto** for vehicle readings. Forced demo options use
example values and show a DEMO badge. Off-car Auto also uses example values.
An asterisk marks an incomplete app measurement; unreadable files and scan
limits can make the reported size a lower bound. Per-app totals do not equal
the whole partition's used space. `df` free space can differ from size minus
used because of filesystem reservations.

Host package, parser and renderer checks were run for this release. Actual
vehicle installation and widget behavior still need verification; this does
not claim real-car testing. See [NOTICE](NOTICE) for source attribution.

These examples use the installed package's renderer and demo values:

![Disks, example data](screenshots/disks-ok-en.png)
![Widget, example 95% usage](screenshots/widget-crit-en.png)

## Per-app CPU / memory (1.1.1)

The **CPU / Memory** tab lists running apps by CPU usage. Select a row with
Touch/iDrive or use **Next app** to switch the two graphs between the whole
head unit and an app. Every tab keeps the latest whole-unit CPU/RAM percentages
in its header. Samples and logs update every **10 seconds**; the graphs retain
the last **30 minutes of the current session**. CPU needs two samples, so its
first value appears about 10 seconds after start. This app must be running;
shutdown/closed-process periods have no samples. No auto-start change is made.

Apps are grouped by the effective Linux UID corresponding to `oap_<uid>`;
helpers under the same UID are included. CPU is a share of all CPU cores,
normalized to 0–100%. RAM is the sum of the app's readable process RSS (MB in
this view means MiB); shared pages can be counted in multiple processes. The
whole-unit RAM percentage uses MemAvailable and is a different measure. Only
readable live processes are covered; root/system services without an app UID
are excluded from the app list. Access failures are shown. `*` means partial
CPU/RSS coverage, including process startup; a missing value is not zero.

The table shows each app's RAM change over five minutes. App growth alerts need
at least +16 MiB over five minutes, with the readings across the last minute at least
8 MiB above the baseline. **Possible memory leak** requires at least 15 minutes
of uninterrupted valid samples, +32 MiB overall, and +8 MiB in each of three
five-minute segments. System thresholds are +5 percentage points/5 min and
+10 points/15 min (at least +2 per segment). CPU rising means +15 points/5 min,
confirmed by elevated readings throughout the last minute. Raw trends remain visible below these
thresholds. A rising RSS can have legitimate causes; these flags require
investigation and do not identify an allocation leak or its code location.

## Logs

Recording is on by default; **Save CPU / memory usage logs** switches it off.
Real samples are collected every 10 seconds. Three samples share one gzip block
written every 30 seconds to the app's persistent data folder:

`usage-logs/usage-YYYY-MM-DD.csv.gz`

The full path is usually `/var/opt/public/oap/oap_<MGU Monitor UID>/data/usage-logs/`.
Each file is a standard concatenated-member gzip CSV; `gzip -cd` or Python's
`gzip.open` reads it. Daily dates/timestamps are UTC according to the car clock.
The CSV includes whole-unit CPU/RAM, five-minute changes, growth flags, coverage
counts and `apps_json`. That field is an array of
`[uid, name, cpuPercent, rssBytes, processCount, cpuDeltaPp, rssDeltaMiB, flags]`;
flags bits: 1 partial, 2 CPU rising, 4 RAM rising, 8 leak suspected. Missing values
are blank/null. Demo values are never saved.

A 30-day cutoff is applied on startup and hourly while running (including when
recording is off). Expired daily files are deleted and the boundary day's old
rows are removed. No other app's files are touched. The chart history resets
on restart; existing logs remain. Limits are 3 MiB/day and 96 MiB total, without
preallocating space. The package permits 128 MiB for code/data. If the filesystem
is full, access is denied or a limit is hit, the UI reports a log error and retries
at the next sample without deleting unexpired records. Log size varies with
app count. Closed-process periods are cleaned up at the next start.

![Per-app graphs, simulated increasing RSS](screenshots/usage-app-en.png)

### App names and the 1.1.1 update

MGU Store also installs **mgu-monitor-names 0.1.0**. Other OAP app folders
and MainApp's UID registry are protected from an ordinary app. This small root
metadata exporter reads package display names, App Kit titles, installed RHMI
entry titles and the real UID registry, then writes only UID/id/title data to
`/dev/shm/mgu-monitor-names/apps.json` (root-owned, readable by apps).
It exports on install and every minute through a oneshot systemd timer. It does
not change OAP permissions, app settings or vehicle configuration. If the Store
reports the helper pending, complete its requested head-unit restart once.
UIDs are never guessed. Until a name is available the row says App name pending,
with its UID still shown below. The names also enter the app list and logs.

The 30-minute graph now holds up to 181 readings. Growth confirmation still
covers a whole minute (7 samples), with the existing five/fifteen-minute windows.
Logs keep every 10-second timestamp, grouped losslessly into 30-second gzip
blocks to limit storage overhead. Pending rows flush on graceful process exit
and when recording is disabled; abrupt termination can lose up to 20 seconds
of buffered samples. Existing 1.1.0 logs remain readable and expire normally.
