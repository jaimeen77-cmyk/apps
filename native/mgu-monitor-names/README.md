# MGU Monitor app names 0.1.0

Required by both MGU Monitor 1.1.1 language editions. MGU Store packages this
component directly with its standard tool packer; no build step or SDK.

A root oneshot reads only installed app identity metadata and exports
`/dev/shm/mgu-monitor-names/apps.json`, mode 0644 in a root-owned 0755 folder.
The map includes UID, app id, display title and available RHMI title languages.
Other apps' data/settings and permission modes are untouched. Only the name map
is written. Files outside a real app home and oversized/nonregular metadata
are ignored. No network request, credentials or updater secret is used.

`postInstall` writes the initial map. A systemd timer refreshes once a minute,
starting after boot. A newly installed tool may require the Store's normal
restart step before its timer starts. Source/license: this repository's MIT.
