# Quantum Reflex - HTML5 Hypercasual Engine

## Technical Specifications
* **Architecture:** Decoupled (HTML, CSS, Vanilla JS)
* **Rendering:** Canvas 2D API (Locked at max 60FPS using requestAnimationFrame)
* **Time Calculation:** Delta Time (Protected against Tab Freeze & Race Conditions)
* **Audio Engine:** Native Web Audio API (Zero external `.mp3` dependencies)
* **Responsiveness:** Viewport constrained to 100vh / touch-action optimized.

## Customization Guide
Open `core.js` and locate the `CONFIG` object at line 6. You can modify:
* Hex color palettes (Background, UI, Node states).
* Algorithmic variables (Speed multiplier, Combo timeout, Anomaly probability).
* Storage keys for local persistence tracking.

## Monetization / Ad Integration
To inject rewarded ads or interstitials:
1. Locate the `handleFailure()` function in `core.js`.
2. Insert your Ad Network SDK call immediately before the `renderGameOverUI()` timeout.
3. Example: `if(timeToShowAd) { showInterstitial(); } else { setTimeout(renderGameOverUI, 600); }`
