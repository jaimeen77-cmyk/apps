# iDrive Circuit 1.0.0

[한국어](README.ko.md)

A parked-only circuit puzzle for iDrive 7: rotate tiles until every module has power. 30 levels, MIT licensed.

- [Installation guide](../../docs/INSTALL.md)
- [User guide](../../docs/USER-GUIDE.md#idrive-circuit)

![Circuit puzzle](../../screenshots/circuit-board-en.png)

Development: `puzzle.js` holds the game rules, `levels.js` the boards, `main.js` the HMI integration and `icon.png` the tile artwork. After merging into the upstream project, test with `node kit/tools/test_idrive_circuit.js`.
