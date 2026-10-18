This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

This app reads games and contents added to locations on the map.
Make your own contents for wherever you are by creating an account here :
https://echoes.sophiehorner.art
Payment test mode is on, you'll be able to "pay" for subscriptions by giving the test credit card number:
4242 4242 4242 4242 - Put whatever you like in the other fields, it'll pass.
Editor account creation isn't quite intuitive yet. 
Note : Only "aiming" type games can be read by the app for now.
Send me inquireries or bug reports through my contact page here :
https://sophiehorner.art/?page_id=228


## Source guide

Source comments are written in English; user-facing strings remain localized in
[`constants/i18n.js`](constants/i18n.js).

- [`App.js`](App.js) coordinates map discovery, authentication, viewer transitions,
  and AR preparation. An AR session snapshots nearby memories only after location
  lookup and asset downloads succeed.
- [`src/hooks/useRadar.js`](src/hooks/useRadar.js) normalizes API responses and
  caches media. [`src/utils/memoryAccess.js`](src/utils/memoryAccess.js) defines
  proximity limits and the Galaxy A viewer policy.
- [`src/experiences/experience.ts`](src/experiences/experience.ts) validates scene
  definitions. Templates and `SceneObject` render declarative content; aiming
  helpers and the configured aiming template handle colliders, shots, and scoring.
- [`src/hooks/useProgress.js`](src/hooks/useProgress.js) owns account-scoped local
  progression and queued uploads. The standalone inventory, score, and visited-place
  hooks retain the legacy storage format.
- [`native/android/`](native/android/) holds the custom location module copied
  into the Android project by [`plugins/withEchoesLocation.js`](plugins/withEchoesLocation.js).
  Keep both tracked native copies aligned when changing the module.
- [`src/services/geolocation.ios.js`](src/services/geolocation.ios.js) provides
  foreground iOS location through Expo Location. Metro selects it on iOS;
  Android keeps [`src/services/geolocation.js`](src/services/geolocation.js)
  and the custom native module. Expo Location is excluded from Android
  autolinking to avoid introducing Google Play Services into that GPS path.
  Both providers return `{ coords, timestamp }`, accept `timeout` (20 seconds
  by default) and `maximumAge` (10 seconds by default), and report failures to
  the caller. iOS stops its temporary watcher after a fix, an error or timeout.
  Its live fixes target 10 m accuracy (best available with `enableHighAccuracy`),
  rather than the 100 m balanced mode, for the 50 m discovery radius. Actual
  accuracy still depends on device conditions and the user's location settings.

## Memory discovery

- The nearby endpoint is queried with the current latitude and longitude; the map
  shows both the 2,500 m search circle and the 50 m discovery circle.
- Once a GPS position is available, the map displays the native user-location marker with a compass heading indicator (subject to device sensor availability).
- Before opening AR, the app obtains a fresh GPS fix, fetches nearby memories, filters them to a maximum of 50 m, and downloads their media. An unsuccessful preparation does not open AR.
- Map and history details show only a title and description for distant memories. Within 50 m, full viewer access is reserved for Samsung Galaxy A devices (Galaxy A names or SM-A model identifiers), where AR is disabled. Other devices discover content in AR.
- Legacy collected memories can still be placed again from the collection.
  Individual game objects appear in the inventory without a placement action.

## Customizable experiences

The mobile runtime provides four separate UX extension points in
[`src/experiences/ExperienceTemplates.tsx`](src/experiences/ExperienceTemplates.tsx):
`aiming`, `treasure`, `discovery`, and `images`. These are template foundations,
not finished games: general victory rules and geolocated quest progression remain
to be implemented. Aiming scores, long-press object collection and authenticated
progress synchronization are implemented.
Existing map proximity restrictions and legacy memory viewers remain unchanged.

Every game type accepts an optional, non-empty string `subtype` alongside `type`.
For `treasure`, `discovery`, and `images`, it is preserved as custom metadata.
For `aiming`, the supported values are `basket`, `dartboard`, and `bowling`;
these require `settings` and select the rules below. Omitting `subtype` preserves
existing definitions and their behavior.

The nearby endpoint returns a **direct JSON list of interactive games**, not
legacy `memory` records and not JSON-encoded strings. Each game carries its
own GPS coordinates and required `type`; there is no root-level type fallback.
Each entry requires `location_id` (its location ID), alongside `latitude` and
`longitude`. The server `id` field is not used as a game identity. The client
assigns each entry a zero-based game index within its location; games sharing a
`location_id` therefore remain separate map, AR, and history entries. The same
game index can occur at different locations and is always paired with
`location_id`. Map selection uses this location/game pair, not a
nearest-coordinate lookup. Missing or invalid location identifiers cause an
explicit loading error.
`title` and `description` are game metadata. All templates use the same
`assets` / `objects` structure.
Legacy string-encoded fields remain readable for backwards compatibility.

```json
[
  {
    "id": 1,
    "location_id": 12,
    "latitude": 44.0,
    "longitude": 1.0,
    "title": "Papillon animé",
    "description": "Une expérience interactive",
    "type": "images",
    "assets": [
      {
        "id": 10,
        "name": "Papillon",
        "type": "GLB",
        "url": "https://example.com/butterfly.glb"
      }
    ],
    "target": {
      "id": 20,
      "imageUrl": "https://example.com/poster.jpg",
      "physicalWidth": 0.6,
      "orientation": "Up"
    },
    "objects": [
      {
        "id": 30,
        "properties": {
          "asset": 10,
          "position": [0, 0, 0],
          "rotation": [0, 0, 0],
          "scale": [0.2, 0.2, 0.2],
          "physics": {
            "type": "Kinematic",
            "shape": { "type": "Sphere", "params": [0.1] }
          },
          "animation": { "rotateY": 360, "duration": 3000, "loop": true }
        },
        "actions": { "onClick": { "type": "customAction" } }
      }
    ]
  }
]
```

- All `id` fields are non-negative safe integers, unique within their
  game/collection. The game `id`, `location_id`, `latitude`, `longitude`, `title`,
  `description` and `type` are supplied directly by the server.
  Assets may additionally have an optional non-empty string `name`; `name` is
  not supported on games, objects or image targets. Asset types: `GLB`, `GLTF`, `OBJ`,
  `image`, `video`, `audio`. Asset IDs referenced by `properties.asset` must exist
  in that game's asset list. An object can instead contain `properties.text`.
  `properties.active: false` hides the object. A response without a valid
  interactive game is ignored.
- Positions and physical dimensions use meters; rotations use degrees.
  `scale` must contain three positive numbers. All vectors contain three finite
  numbers. Scenes default to gravity `[0, -9.81, 0]`.
- Every template supports optional physics in both AR and the 3D fallback:
  `Dynamic`, `Static`, or `Kinematic`, with an explicit `Box` shape
  (`params: [width, height, length]`) or `Sphere` (`params: [radius]`).
  Optional fields: `mass` (positive for dynamic bodies), `restitution`,
  `friction` (both 0..1), `useGravity`, `velocity`. Aiming projectiles receive
  their initial velocity separately, so their configured `velocity` does not
  override gravity.
  Include static collider objects when needed; only a configured aiming game
  automatically creates a physical floor. Dynamic bodies are simulated by Viro.
- `animation` defines relative Y rotation in degrees over `duration`
  milliseconds (positive), looping by default. Media load errors are reported
  to the application. Scene video loops and audio plays when its object mounts.
- An `images` game requires `target.imageUrl`, a positive `physicalWidth` in
  meters and a target ID. Orientation defaults to `Up`; other values are `Down`,
  `Left`, `Right`. AR registers a uniquely named Viro image target, anchors its
  children to the detected image and hides/unmounts them when tracking is lost
  (`notTracking`) or the anchor is removed. Targets are released on unmount.
  Image quality, feature richness and the measured printed width affect native
  tracking; recognition must still be validated on physical ARCore/ARKit devices.
- Scene assets and target images are downloaded before opening the experience,
  using the existing authenticated private-file resolver/cache. Change resource
  URLs (for example a version query parameter) when replacing an asset. Prefer
  self-contained GLB files: external GLTF/OBJ texture or buffer dependencies are
  not automatically downloaded or rewritten.
- Only one game is active at a time; the overlay allows switching games.
  AR exposes nearby memory droplets until a memory is selected. Non-image
  scenes without aiming configuration start two meters in front of the session origin. Image scenes use the
  native image anchor. On Galaxy A, the authorized details modal opens the same
  template in a physics-enabled 3D scene, including for experiences without a
  legacy `model_url`. Image mode then explicitly displays a preview, without
  camera recognition.
- Template callbacks expose typed `press`, `collision`, `targetFound`,
  `targetUpdated`, and `targetRemoved` events, including game/object IDs.
  `press.data` contains the object's unchanged `actions`; custom game settings
  and object properties are preserved. These declarations are **not executed**
  as scripts. Only documented settings are interpreted as game rules. Implement each template's mechanics
  behind these extension points. The shell currently displays the pressed
  object's ID. Configured aiming games also award inventory items and persistent
  scores for qualifying impacts, with optional radial scoring and fall conditions.
- Invalid types, target dimensions, references and physics data reject
  preparation with an explicit error rather than silently choosing a template.

### Aiming: server configuration

See [Aiming architecture: API, JSON and Mermaid diagrams](docs/jeux-adresse.md)
for the request flow, a complete payload example and the internal game lifecycle.

Add `settings` to a game whose own `type` is `aiming` to enable plane preparation
and camera-axis shooting. Games without this section retain the original
objects-only behavior.
The backend supplies this JSON through the same experience API; this repository
contains the mobile consumer, not a server editor or backend.

```json
[
  {
    "id": 100,
    "location_id": 12,
    "latitude": 44.0,
    "longitude": 1.0,
    "title": "Lancer dans le panier",
    "description": "Visez puis touchez l'écran pour lancer.",
    "type": "aiming",
    "assets": [
      {
        "id": 101,
        "name": "Ballon",
        "type": "GLB",
        "url": "https://example.com/ball.glb"
      },
      {
        "id": 102,
        "name": "Panier",
        "type": "OBJ",
        "url": "https://example.com/basket.obj"
      }
    ],
    "settings": {
      "plane": { "minWidth": 2, "minLength": 3, "stableMs": 1000 },
      "projectile": {
        "objectId": 103,
        "speed": 5,
        "spawnDistance": 0.3,
        "maxActive": 12
      },
      "targets": [104]
    },
    "objects": [
      {
        "id": 103,
        "properties": {
          "asset": 101,
          "scale": [1, 1, 1],
          "collider": { "type": "sphere", "size": [0.2, 0.2, 0.2] },
          "physics": { "type": "Dynamic", "mass": 0.5, "restitution": 0.4 }
        }
      },
      {
        "id": 104,
        "properties": {
          "asset": 102,
          "position": [0, 0.5, 0],
          "collider": {
            "type": "basket",
            "size": [1, 1, 1],
            "thickness": 0.05
          }
        }
      }
    ]
  }
]
```

- AR waits for normal tracking and an upward-facing horizontal plane meeting
  **both** minimum dimensions. During `stableMs` (default 1000 ms), a change of
  anchor, a displacement over 3 cm, a yaw change over 3 degrees, anchor removal
  or loss of tracking restarts preparation. This is a pose-stability heuristic,
  not a guarantee of tracking accuracy.
- Once ready, the runtime snapshots the plane's center and yaw into a fixed
  world-space static box, **100 x 100 m and 1 m deep**, with its upper face at floor
  height. Its dimensions are independent of the detected plane's extents. This
  approximates an infinite ground for nearby AR play, but has finite edges 50 m
  from its center. Later plane updates do not move the floor. Choose a clear physical
  floor: a sufficiently large tabletop is also a valid horizontal plane to the
  tracker. The floor is an invisible collider, not a rendered ground mesh.
- Targets use positions/rotations relative to the locked floor center.
  Their GLB, GLTF or OBJ geometry should be centered on the configured collider. Targets
  default to `Static`; optional `physics` can specify `Static`, `Dynamic` or
  `Kinematic` and the usual physical parameters. All configured targets must
  reference GLB, GLTF or OBJ assets and a collider.
- Every configured aiming game, with or without `subtype`, displays its projectile
  centered at `spawnDistance` in front of the native camera before throwing.
  This held preview follows camera translation and rotation without JS pose updates,
  preserves the model's scale, and has no physics or collection behavior.
  Once the floor is ready, a white outlined hand with three concentric fingertip
  arcs invites the player to press and hold. The hint does not intercept input.
  The projectile stays attached during the press and launches on release.
  Another preview appears while a shot slot is available; preview and hint are
  hidden on tracking loss or when `maxActive` is reached. The preview itself
  does not consume a slot, score, or become collectible.
- Press and release the scene or held projectile to spawn a dynamic projectile from the camera position plus
  `spawnDistance` along its normalized forward axis. Defaults: distance 0.3 m,
  base speed 5 m/s, gravity enabled, unlimited lifetime, maximum 12 active projectiles.
  Holding increases the launch speed linearly: base speed for an immediate release,
  1.5x after 1 second, and a maximum of **2x after 2 seconds**. Longer holds do not
  increase it further. The camera pose at release determines the launch direction.
  Scene and object click-state handlers share the same charge, so a release fires
  only once even when tapping a target. Losing tracking or switching games cancels
  a pending charge. The same interaction is available in the 3D viewer.
  An optional `useGravity: false` disables gravity. Projectile lifetime is
  currently forced to unlimited in the runtime, even if the server sends a
  positive `lifetimeMs` (older game definitions may still contain `1000`).
  The field remains validated for compatibility but does not schedule removal.
  The initial rotation follows the camera (author the
  projectile facing local -Z). The template's position and initial velocity are
  replaced by the launch pose and velocity. Configured constant `velocity` is
  omitted from the projectile body so it cannot override the launch or gravity.
  The ground has zero restitution; its depth reduces tunneling risk but does not
  guarantee continuous collision detection at arbitrary speeds.
  Select a spawn distance outside the projectile and tune speed/size to avoid
  discrete-physics tunneling.
- Tracking loss blocks new shots and requests a fresh camera pose on recovery;
  the floor remains fixed and existing physics simulation continues.
  Unless `settings.freeze` is true (automatically for `dartboard`), collisions do not freeze projectiles: they retain their
  dynamic bodies, gravity and physical interaction with the walls and bottom.
  They count toward `maxActive` until leaving the game, including after an impact,
  except successful `basket` shots, which are removed and release their slot.
  Reaching this limit blocks further shots.
- With neither `subtype` nor the optional impact rules below, a contact on the interior top face of a box/basket bottom awards one point per
  projectile across all targets in the current game instance. Classification uses
  the contact position and normal in the body's current native world transform,
  including moved/rotated targets; wall faces, top rims, the underside and
  non-projectile bodies do not score. Native transform failures are reported.
  Scores persist per account, location and game type and appear in the menu's
  Scores tab; in AR, a scoring contact also adds the memory to the legacy collection.
- `subtype` belongs to the game, not to `settings` or the collider:

  | Aiming subtype | Impact behavior | Score |
  | --- | --- | --- |
  | `basket` | Open `basket` or `bounding` target; remove the projectile only on the interior bottom, not walls or rim. | Constant `multiplier`, default 1, once per projectile. |
  | `dartboard` | Solid target (`basket` colliders are rejected); freeze the projectile at its native contact pose and keep it visible. | Radial decrease from `multiplier` (default 10) at the center to 1 at the edge. |
  | `bowling` | Dynamic targets (`basket` colliders are rejected); keep the projectile moving and wait for a tilt of at least 60 degrees, including target-to-target chains. | Constant `multiplier`, default 1, once per fallen target; touching alone awards nothing. |

  The subtype imposes `freeze: true, fall: false` for `dartboard`,
  `freeze: false, fall: true` for `bowling`, and both false for `basket`.
  Contradictory explicit settings are rejected rather than silently ignored.
  Example: `{ "type": "aiming", "subtype": "dartboard", "assets": [...],
  "objects": [...], "settings": { "plane": { "minWidth": 2, "minLength": 3 },
  "projectile": { "objectId": 103 }, "targets": [104], "multiplier": 20 } }`.
- Optional fields directly in `settings` configure impact behavior (the following
  defaults and freely combined rules describe games without `subtype`):
  `reward` references an asset in this game's `assets`, displayed at the impact
  position once scoring is validated; `freeze` stops the projectile at its
  native contact pose; `multiplier` is a positive safe integer defining the
  radial maximum score (default 1); `fall` delays scoring until a Dynamic target
  tilts at least 60 degrees from its initial orientation. Each fallen target
  scores once, including pin-to-pin chains; without `fall`, each projectile
  scores once. A radial hit scores `1 + round((multiplier - 1) * (1 - r))`,
  where `r` is the normalized radial distance in the struck face, capped at 1.
  Rewards remain visible until leaving the game, without becoming inventory items.
  Providing any of these fields, including explicit `false`, enables the new
  rules: `bounding` targets become solid boxes and all collider types can score
  on impact, while `basket` still requires an interior bottom contact.
  Omitting all four and `subtype` preserves legacy behavior. The scoring collision event
  carries `data.points`; progression stores and uploads their sum using the
  existing API. See the [complete impact contract](docs/jeux-adresse.md#regles-dimpact--contrat-serveurclient).
- Collider debug outlines are currently disabled with `physicsWorld.drawBounds: false`
  in both AR and the 3D viewer, including development builds. Physical collisions
  remain enabled.
- Configured projectiles emit targeted `[AimingPhysics]` diagnostic logs in
  both debug and release builds while investigating disappearing models.
  These record mount/unmount, the effective unlimited lifetime and the server's
  separate `configuredLifetimeMs`, model loading, and the first
  contact with each body tag. Native world transforms of the body and model,
  model bounds and floor height are sampled at contact and 250/1000/3000 ms
  afterwards. Sampling does not change position, velocity, colliders or scores;
  pending samples are cancelled on unmount. Non-finite values are preserved as
  strings in logs rather than converted to JSON `null`. Native query failures
  are logged explicitly. Read with `adb logcat -s ReactNativeJS` and filter for
  `AimingPhysics`; no model URLs or authentication data are logged.
- Colliders have an explicit `size: [width, height, length]` in meters
  (except `diamond`, which requires `base`, `middle` and `height` instead),
  centered on their object's origin. Unlike the generic object contract,
  configured projectile/target `scale` changes **only the visual model**;
  collider dimensions stay in meters. `physics.shape` is optional and overridden
  by `collider`. Rotating animations on these physical objects are rejected;
  use the object's initial rotation instead.

| Collider   | Configuration / implementation                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `bounding` | Explicit dimensions; no automatic OBJ/GLB bounds extraction. Projectiles and targets with impact rules use a solid box. Legacy aiming targets use an open compound basket with a bottom and four walls, up to 5 cm thick (reduced for small dimensions). |
| `sphere`   | Equal X/Y/Z dimensions; radius is half the width.                                                                                    |
| `capsule`  | Vertical, X = Z and Y >= X; compound approximation using overlapping spheres and a central box. Y = X becomes a sphere.              |
| `diamond`  | Solid box `[base, height, base]` with flat square ends, plus a centered sphere of radius `middle`. All three fields are required positive finite numbers; `middle <= height / 2`. No `size` field. |
| `basket`   | Open rectangular basket: bottom and four walls, no lid. Requires positive `thickness` smaller than height and half the width/length. All five parts remain physical; only projectile contacts on the interior top face of the bottom can score. |

Viro supports boxes, spheres and their compounds. The capsule uses an intentional
approximation; diamond uses exactly one box and one sphere. For example,
`{"type":"diamond","base":0.2,"middle":0.15,"height":0.6}` creates a 60 cm tall
collider with a 20 cm square base and a 15 cm middle radius. Its width/depth are
`max(base, 2 * middle)`. Old diamond definitions using `size` are rejected.
All five choices work for projectiles and targets independently of the
visual asset; basket targets and legacy aiming box targets remain open so projectiles can enter.
Physical dimensions and the visual asset's authored origin must agree; scaling
the model alone does not resize or recenter its collider.

The 3D fallback uses the same physical objects and launch mechanics with an
immediate synthetic floor centered at `[0, -1, -2]` and the configured minimum
dimensions; it does not claim to track a real plane.

### Collection and progress API

Set `properties.collectible: true` on a game object to enable collection after
a 600 ms press. The field must be a boolean; omission means not collectible.
A collectible requires an explicit game ID. A collection gesture cancels any
charged shot, and is cancelled by release before 600 ms, tracking loss or unmount.
Collecting a spawned projectile uses its server object ID, not its negative runtime ID.
Objects stay visible and physical after collection.

On game switch, experience close or camera/viewer close, authenticated players
send `POST /api/progress` with the same Bearer token as the other authenticated
requests. The payload contains absolute totals, not increments:

```json
{
  "scores": [{ "location_id": 12, "game_type": "aiming", "score": 125 }],
  "visited_location_ids": [12, 15],
  "collected_items": [
    { "location_id": 12, "game_id": 100, "item_id": 3, "quantity": 1 }
  ]
}
```

`item_id` is the ID of `logic.games[].objects[]`; all three IDs are needed
to disambiguate objects. Collection is unique per location/game/object.
`location_id` always comes from the game's top-level `location_id`, while
`game_id` is the zero-based index of that game within its location. History retains separate game entries, but
`visited_location_ids` contains each visited location only once.
Scores aggregate by location and game type, since the score API does not accept
a game ID. Both AR and the Galaxy A fallback participate; merely backgrounding
the app does not finish a game. No victory event is inferred.

Corrected progress is saved under `@progress:v2:user:{userId}` (guests use
`@progress:v2:guest` and do not upload). Earlier account/guest progress and the
standalone legacy score, visit, and inventory keys remain untouched on the device.
They are neither imported into the new history nor uploaded: their identifiers
may have confused games with locations and cannot be safely migrated without a
verified mapping. The corrected progression starts separately for each account.
No server progress retrieval/merge endpoint is implemented.

Writes include late contacts/collections before an exit; uploads are serialized
without blocking gameplay. Failed uploads display an error and retain the local
totals for the next game-end upload. Requests time out after 15 seconds.
Queued requests recheck the account and token before sending.
Additional callbacks: `planeReady.data` describes the locked floor;
`shot.objectId` identifies the spawned instance and `shot.data` contains its
`projectileId`, world position and velocity; `shotBlocked.data.reason` is
`plane`, `tracking`, `camera` or `limit`. Regular collision events identify the
projectile instance and the colliding target's tag (or `aiming-floor`).
Runtime-generated projectile instance IDs are negative and must not be supplied
by the server; server IDs are non-negative integers.
Tracking, contact accuracy, model alignment, and fast/small projectile behavior
must still be verified on physical ARCore/ARKit devices.

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

#### Requirements

- A Mac with Xcode and its command-line tools, a supported Node.js version
  (Node 22.21+ within the 22.x line, or another version allowed by
  [`package.json`](package.json)), Ruby/Bundler and CocoaPods 1.16.2+.
  A current Ruby 3.x installation is recommended instead of macOS's system Ruby.
- A **physical ARKit-capable iPhone or iPad running iOS/iPadOS 17.6 or later**.
  The installed ViroKit framework is an arm64 **device** binary with a 17.6
  deployment minimum, not a simulator framework. A simulator, including an
  Apple Silicon simulator, is not supported by this dependency set.
- ViroKit was built with the iOS 27 SDK. Check compatibility with the Mac's
  Xcode version; React Native's own minimum Xcode version alone is not enough
  to certify this prebuilt framework.
- An Apple signing team that can use `com.sophiehorner.echoes`. Select the
  team locally in Xcode; no personal team ID or signing credentials are stored
  in the repository. The app's display name is `echoes`, version `3.0.0`.

This is a custom native application, **not an Expo Go application**. The tracked
[`ios/`](ios/) project integrates Expo modules, Viro and MapLibre. Its internal
target/scheme remains `TestApp` to preserve existing project references.

#### Install native dependencies on the Mac

```sh
npm ci
bundle install
cd ios
bundle exec pod install
cd ..
```

Run `pod install` again after changing native dependencies. Open the generated
`ios/TestApp.xcworkspace`, not the `.xcodeproj`, when using Xcode. On first use,
select the `TestApp` target, configure **Signing & Capabilities**, connect and
trust the device, and enable its Developer Mode if requested.

#### Build commands (manual, on the Mac only)

The following commands **perform a native build**; dependency installation or
source checks do not require running them.

```sh
# Debug: choose the connected physical device, not a simulator.
npm run ios

# Release: verify startup without Metro before distribution.
npm run ios -- --configuration Release
```

`npm start` runs Expo's Metro server for the custom native app, not Expo Go.
Debug uses the Expo entry resolver and Release bundles through Expo CLI.
The JavaScript root component is `main` on both platforms.

Before distributing, test first-launch permission grants and denials, return
from Settings, GPS outside near a known location, map position/heading, AR plane
and image tracking, aiming/collection, cached models, audio/video playback,
account switching and progress uploads. Check both Debug and standalone Release.
JavaScript tests do not replace these physical-device checks or Xcode validation.

#### Regenerating the native project

For ordinary builds, use the tracked native project; no prebuild is required.
If regeneration is necessary, first save native changes in version control,
then use `npx expo prebuild --clean --platform ios --no-install` and reinstall
pods. **This replaces the iOS project** and may change the internal target name;
open the newly generated workspace. Keep `--platform ios` to avoid regenerating
Android. The configuration in [`app.json`](app.json) carries the bundle ID,
minimum OS, ARKit requirement, permissions, and Viro/MapLibre plugins. Nitro's
native dependencies are explicit in [`package.json`](package.json).
Do not repeatedly apply a non-clean prebuild to the manually integrated
Podfile: Viro's plugin can append duplicate pod declarations.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
