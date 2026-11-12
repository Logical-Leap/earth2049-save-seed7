# Earth 2049 in VR (WebXR)

The whole game runs natively in a VR headset as a fully immersive WebXR session, not as a floating screen. That covers the title, the Rebel Haven (Fitting Room included), Operation Unsubscribe, the district runs and co-op. The code lives in `js/vr.js`.

## Playing on a Meta Quest 3 / 3S
1. Put the headset on and open the **Meta Quest Browser**.
2. Go to https://logical-leap.github.io/earth2049-save-seed7/ (HTTPS is required, and GitHub Pages provides it).
3. Press **Enter VR**. It's on the title screen and in the pause menu, and it only appears when the browser reports a headset.
4. Stand or sit; the floor height comes from your Guardian.

Nothing needs installing on a computer: WebXR runs in the headset's own browser. To watch logs while you play, use the Meta Quest Developer Hub or `chrome://inspect` with the headset plugged in over USB and developer mode on. That's optional.

## Controls
| Where | Control | Action |
|---|---|---|
| Everywhere | Left stick | Move, toward where you're looking |
| Everywhere | Right stick | Snap turn 30° (smooth turning is in Options) |
| Everywhere | Walk in your room | You walk in the game; walls still stop you |
| Everywhere | Hold Y | Pause |
| Everywhere | B / Y | Back out of a menu |
| Combat | Right trigger | Fire. The gun is in your right hand, so you aim it like a gun; a red dot shows where it points |
| Combat | A | Jump |
| Combat | B | Kick (in the arena) or ability 2 (in districts) |
| Combat | Duck for real, or click the right stick | Crouch / slide |
| Combat | Grip or X | Pick up / interact / reload |
| Combat | Y (tap) | Swap weapons |
| Combat | Left trigger | Hype grenade (arena) or ability 1 (districts) |
| Combat | Left stick click | Sprint, or dash with the JET DASH upgrade or Ghost Protocol |
| Haven | Grip or X | Talk to people, use services |
| Menus | Laser + trigger | Pick an option (title, armory, pause, dialogue, Fitting Room, upgrade cards, results) |

## What you see
- **Your body.** Look down and you see your legs. Your controllers wear the gloves you picked at the Fitting Room.
- **Left wrist.** HP, armour, ammo, level and XP, the objective, and your GigaTech and DRIP.
- **Message strip.** It floats in front of you and slowly follows your gaze. It shows banners, toasts, subtitles, LEVEL UP, and prompts (where the flat-screen prompts say [E], VR shows [GRIP]).
- **Menus.** The menu that's open on the flat screen shows on a panel in front of you, and you point at its buttons with your controller laser. Every menu that works on a gamepad works this way.
- **Comfort.** The edges dim while the stick moves you; you can turn this off in Options. Snap turning is the default. The game never shakes the camera, punches the FOV or rolls your view.
- **Haptics.** Shots, hits, menu hovers and turning all buzz the controllers.
- **Rendering.** The bloom and PS1 post effects are flat-screen only. In VR each eye renders directly, which keeps the frame rate up on Quest.

## How it works (for whoever touches it next)
- **Locomotion is a reference-space offset.**
  - Every frame, `VR.place(feet)` sets `XRReferenceSpace.getOffsetReferenceSpace(...)` so the head you're physically holding sits over the mode's player capsule.
  - The poses three.js returns are therefore in world space. `camera.position` and `quaternion` are your real head, so audio, prompts, networking and the district aim all keep working unchanged.
- **The head is read from `XRFrame.getViewerPose(base)`, in local-floor space.** This avoids a feedback loop with our own offsets, which lag by one frame.
- **Room-scale steps feed the capsule.** `VR.consumeWalk()` returns the step and the capsule moves it through the normal collision. Walk into a wall and the world pushes back.
- **Each mode keeps its own physics.** The arena (`AR.Player.vrTick` / `vrCamera`) and the Haven/districts (`vrGameplay` in game.js) map the controllers onto the same inputs keyboard, mouse and gamepad use.
- **Menus come from `Pad.layer()`.** That's the gamepad's menu detection, so there is one source of truth for "which menu is open"; clicking a panel button clicks the real DOM element.
- **The game loop is `renderer.setAnimationLoop(frame)`,** because the window's requestAnimationFrame stops inside a headset.
- **Co-op uses the same network state as flat players.** VR and flat players can share a room.

## Testing without a headset
- Open the game with `?xremu=1` to load Meta's Immersive Web Emulation Runtime (MIT, vendored in `tools/iwer`). It stands in for a Quest 3; add `&stereo=1` for side-by-side eyes.
- `window.__IWER_DEV` drives the emulated head and controllers:

  ```js
  __IWER_DEV.position.x += 0.5;                                     // step right in the room
  __IWER_DEV.controllers.left.updateAxes('thumbstick', 0, -1);      // push the left stick forward
  __IWER_DEV.controllers.right.updateButtonValue('trigger', 1);     // pull the trigger
  ```
- On a desktop browser, Meta's **Immersive Web Emulator** Chrome extension does the same with a UI.

## Next passes (once it's been played on a Quest 3S)
- **Fit:** the gun grip angle (`GUN_POS` / `GUN_ROT` in vr.js), the glove orientation (`dressHand`), the wrist panel placement and the life-size gun scale.
- **Two-handed hold:** grabbing the foregrip with your left hand to steady long guns.
- **Grabs and gestures:** physical grenade throws and pickups, and a reload gesture.
- **Co-op presence:** sending head and hand poses over the network so friends see you wave.
- **Fitting Room:** a 3D mirror view inside the shop, in place of the flat panel.
