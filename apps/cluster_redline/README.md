# Cluster Redline 1.2.53

**Experimental HUD traffic-sign alerts**: HUD settings → Traffic sign alerts → Speed limit + children. Off by default; visible only with the selected Redline HUD face. A fresh camera KM_H speed sign must agree with the observed TSR class (only the recorded 10/30/40/50 pairs). Stale/invalid/unavailable inputs hide the alert. Overspeed highlight uses +3 km/h for 1 second and clears at +1; children-sign detection lasts 6 seconds with a 30-second repeat cooldown. No sound, school-zone boundaries, enforcement-camera alerts or map distance. The badge is fixed at the lower left. Vehicle validation is still pending. [Detailed Korean guide](../../docs/HUD-TRAFFIC.ko.md)

[한국어](README.ko.md)

An iDrive 7 app for cluster/HUD RPM, gear, shift alerts and received navigation guidance.

- [Installation](../../docs/INSTALL.md)
- [User guide](../../docs/CLUSTER-REDLINE.md)
- [Complete new screenshot gallery](../../screenshots/README.md)
- [Changelog](../../CHANGELOG.md)

![HUD circle](../../screenshots/cluster_redline/hud-circle-en.png)
![Cluster bar](../../screenshots/cluster_redline/cluster-bar-en.png)
