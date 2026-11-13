# Storage 1.0.4

[한국어](README.ko.md)

Read-only storage monitor for BMW MGU / iDrive 7 (ID7). Displays disk usage,
free space on the apps filesystem, RAM usage and allocated disk space per app
under `/var/opt/public/oap`. The home widget shows usage and highlights the
configured warning threshold (80% by default). It does not delete files or
change vehicle settings; the warning is within the app/widget.

In MGU Store add source **`jaimeen77-cmyk/apps`**, branch **`main`**, refresh,
then install **Storage (English) 1.0.4** or **저장공간 (한국어) 1.0.4**.
Both editions install independently. Requires `mgu-deploy >= 0.7.17` and the
vehicle's SDK donor, supplied by MGU Store during installation.

Use Refresh to rescan; Next page switches disks/apps. Settings control the
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
