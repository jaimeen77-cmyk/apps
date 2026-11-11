# Store runtime templates

These are **SDK-free UI/framework templates**, not installable app releases.
`tools/store-build.js` combines them with the current `apps/<id>/*.js` on the
head unit and writes one SDK-free `<id>@<version>.tgz` into `MGU_OUT`.
MGU Store supplies the vehicle's stock SDK during installation.

Public templates are stored as small `.tgz.part-00`, `.tgz.part-01`, … files.
The JSON lists their order; the builder joins them offline and verifies the
original archive size and SHA-256 before extraction. The preparer also keeps
a local complete `.tgz` for checks; only its parts need to be published.

Each template excludes all `node_modules` and the app's own JavaScript.
The JSON beside it records size, SHA-256 and a fingerprint of the UI manifest
and Korean additions. `*.en.tgz`/`*.en.json` are the English UI templates;
the existing unsuffixed templates remain Korean. Version-only and app-code changes do not require new
UI templates; UI/permissions/translation changes do.

Refresh each language with `python tools/prepare-store.py --language ko --dist <build dist>`
and `--language en` after building English packages. This also synchronizes
the small English edition manifests and icons in `store/apps/<id>_en/`.
Those folders contain no duplicate app logic: English builds read the current
`apps/<original-id>/` through `--source`, then assign their own package/RHMI ids.
Publish version bumps with these manifests (the builder rejects mismatched versions).
Preserve the included upstream MIT, MPL-2.0 client and OFL font attribution.
The templates retain the original runtime/font license files.

Registration: add `jaimeen77-cmyk/apps` in MGU Store and select
the `main` branch. Each app has a **한국어** and **English** listing.
They install separately and retain separate settings; use only one Cluster Redline
edition's Sport auto-display. See the [installation guide](../docs/INSTALL.md) / [설치 설명서](../docs/INSTALL.ko.md).

Both Cluster Redline entries declare `cluster-render >= 0.4.0` and
`mgu-deploy >= 0.7.17`. The Store queues missing/older requirements before
the app; a compatible installed renderer is reused. Its registered upstream
source must offer the dependency (normally the default
`robertnisipeanu/idrive-apps` Releases source). A missing/incompatible source
blocks the install plan instead of installing a renderer-less app.

`tests/renderer-dependencies.test.js` runs the upstream Store's actual
dependency and queue methods against both parsed listings. Set
`MGU_STORE_UPDATER_JS` to an upstream `native/mgu-updater/js` folder.

Storage 1.0.1 uses `python3 tools/prepare-storage.py --kit-root <appsKOR checkout>`
to generate both SDK-free language templates directly from the MIT kit,
without an SDK build. Its translation dictionary is in `apps/storage/app.json`.
Keep the template provenance and all font/framework notices.
