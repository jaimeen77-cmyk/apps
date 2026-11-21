# Seats Easy Access

English is the default. Add the source overlay to an existing iDrive app kit:

```sh
python tools/install-overlay.py ../idrive7-apps --apps seats_easy_access
```

Inside that target project:

```sh
python kit/tools/build.py seats_easy_access
python kit/tools/make_kit.py seats_easy_access
# Korean:
python kit/tools/make_kit.py seats_easy_access --language ko
```

MGU Store offers **Seats Easy Access (English)** (`seats_easy_access`) and **시트 Easy Access (한국어)** (`seats_easy_access_ko`). Both provide driver/passenger controls, memories, Easy Access and Make room. Install the original Comfort tool separately from IterioDev/car-apps.

Version 0.7.2 recognizes the active BMW driver profile and displays its name when available. With their own BMW profile selected, each driver can adjust the seat, press **Save memory → M1**, and turn on **Ignition M1**. Manual M1 and Ignition M1 both recall the recognized driver's personal position. Each personal M1 uses one free slot of Comfort's three driver-seat memories. Allocated slots are locked in the shared driver M2/M3 controls. Existing shared memories keep their positions when a driver registers. A 0.7.1 M1 opt-in is carried over when exactly one profile matches the stored shared M1. Requires Comfort 0.6.1 or later.

Version 0.7.5 retries missing profile names. If only occupied shared slots remain, repeat Save memory → M1 within 30 seconds to confirm replacing the indicated common slot.

Version 0.7.4 starts checking for ignition M1 at 3 seconds. If the seat stays idle off target for 2 seconds, the app retries, up to five total calls within the original 45-second window. A running seat job delays the next attempt.

Version 0.7.3 adds a shared power-off exit position. With the driver's seat adjusted back, press **Save exit** on the driver page. The car must be stationary and the active driver must have **Ignition M1** on. An observed power-off moves the driver seat to the saved exit position even with the door closed. Power-on then recalls the recognized driver's personal M1. The shared exit takes one additional free Comfort driver-memory slot. The head unit and Comfort must still be running when power-off is reported.

In GPU full-screen mode, touch and iDrive controller adjustments move while held and stop on release. The regular HMI buttons make short adjustments.

Starting in 0.7.1, with Ignition M1 on for any driver, Seats turns off Comfort's automatic Easy Access switch for both front seats. Manual Easy Access remains available. A return Comfort already stored can still run after the switch is turned off. To use automatic Easy Access again, turn off all enabled Ignition M1 profiles and then turn the automatic Easy Access switch on.

Version 0.6.6 adds an opt-in **Ignition M1** button on the driver page (off by default). Save the desired driver M1 first. After an observed off→on cycle, the app waits 8 seconds (on the car 6 s was too early, 10 s and 15 s arrived), refreshes status and calls driver M1 once, only while stationary with saved M1/position data and after Comfort has been idle for at least 3 seconds. A busy service can defer the call up to 45 seconds from power-on. Driving, power-off, connection loss, manual controls, STOP or disabling the option cancels a waiting call. The target is the fixed driver M1, not the position before exit. Passenger memories are unaffected.

The app autostarts and monitors Comfort with the screen hidden. A stopped app process cannot observe events. Observed power-off is retained across process restarts; launching on an already-on car without an observed off, or enabling the option, never initiates a recall. Comfort's original automation remains in place. M1 does not clear Comfort's pending-return flag. Vehicle execution still needs validation.

Version 0.6.6 extends the initial wait from 5 to 15 seconds and requires 3 seconds of idle status. This addresses a possible start-up readiness issue, not a confirmed cause. Both manual and automatic driver M1 calls now log the reported position before, stored target, job-end position-change observation and position after. Counter changes do not prove physical arrival, and the Comfort service's detailed failure reason may still require its own journal.

Version 0.6.7 checks arrival: when Comfort's memory job ends, the reported driver position is compared with the stored M1. If any axis is more than 80 counts away (for example the seat module holding its motors right after the engine starts: only a relay click is heard), the app calls M1 **once more** after 2 seconds of idle Comfort status, under the same guards; never a third time.

Version 0.6.11 removes the Logs tab and keeps no vehicle or seat history: nothing is collected or written, and the history file older versions kept in the app data folder is deleted at start. Car tests (0.6.7 to 0.6.10): a recall 6 s after power-on did not move; 8, 10 and 15 s arrived at once.

The shared canvas runtime also works in `node kit/tools/emu.js seats_easy_access`. The PC preview uses a socket-free demo client and displays a PREVIEW badge; it never sends commands to a vehicle. Driver/passenger tabs, circular adjustment controls, memories and Make room are interactive in the emulator.

The default existing app ID is now English; choose the Korean listing to keep a Korean UI. Vehicle hardware and position sensors determine supported functions. Real vehicle installation and motion have not been validated here.
