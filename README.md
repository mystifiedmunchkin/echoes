This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

## Memory discovery

- Map searches are capped at 2,500 m. The map shows both the 2,500 m search circle and the 50 m discovery circle.
- Once a GPS position is available, the map displays the native user-location marker with a compass heading indicator (subject to device sensor availability).
- Before opening AR, the app obtains a fresh GPS fix, fetches nearby memories, filters them to a maximum of 50 m, and downloads their media. An unsuccessful preparation does not open AR.
- Map and history details show only a title and description for distant memories. Within 50 m, full viewer access is reserved for Samsung Galaxy A devices (Galaxy A names or SM-A model identifiers), where AR is disabled. Other devices discover content in AR.
- Collected items can still be placed again from the collection.

## Customizable experiences

The mobile runtime provides four separate UX extension points in
[`src/experiences/ExperienceTemplates.tsx`](src/experiences/ExperienceTemplates.tsx):
`aiming`, `treasure`, `discovery`, and `images`. These are template foundations,
not finished games: scoring/win rules, geolocated quest progression, collection of
individual keys/clues, scoring and persistence remain to be implemented.
Existing map proximity restrictions and legacy memory viewers remain unchanged.

The nearby endpoint returns a **direct JSON list of interactive games**, not
legacy `memory` records and not JSON-encoded strings. Each game carries its
own GPS coordinates and required `type`; there is no root-level type fallback.
`title` and `description` are game metadata. All templates use the same
`assets` / `objects` structure.
Legacy string-encoded fields remain readable for backwards compatibility.

```json
[
  {
    "id": 1,
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
  game/collection. The game `id`, `latitude`, `longitude`, `title`,
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
  `friction` (both 0..1), `useGravity`, `velocity`.
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
  as scripts or interpreted as game rules. Implement each template's mechanics
  behind these extension points. The shell currently displays the pressed
  object's ID; it does not award inventory items or scores.
- Invalid types, target dimensions, references and physics data reject
  preparation with an explicit error rather than silently choosing a template.

### Aiming: server configuration

Add `settings` to a game whose own `type` is `aiming` to enable plane preparation
and camera-axis shooting. Games without this section retain the original
objects-only behavior.
The backend supplies this JSON through the same experience API; this repository
contains the mobile consumer, not a server editor or backend.

```json
[
  {
    "id": 100,
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
        "lifetimeMs": 10000,
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
- Once ready, the runtime snapshots the plane's center, yaw and measured extents
  into a fixed world-space static box, 5 cm thick with its upper face at floor
  height. Later plane updates do not move the floor. Choose a clear physical
  floor: a sufficiently large tabletop is also a valid horizontal plane to the
  tracker. The floor is an invisible collider, not a rendered ground mesh.
- Targets use positions/rotations relative to the locked floor center.
  Their OBJ geometry should be centered on the configured collider. Targets
  default to `Static`; optional `physics` can specify `Static`, `Dynamic` or
  `Kinematic` and the usual physical parameters. All configured targets must
  reference OBJ assets and a collider. The projectile template must reference
  a GLB or OBJ asset and a collider; it is not mounted before shooting.
- Tap the scene to spawn a dynamic projectile from the camera position plus
  `spawnDistance` along its normalized forward axis. Defaults: distance 0.3 m,
  speed 5 m/s, lifetime 10000 ms, maximum 12 active projectiles. All are positive
  finite values; `maxActive` is an integer. The initial rotation follows the
  camera (author the projectile facing local -Z). The template's position and
  initial velocity are replaced by the launch pose and velocity.
  Select a spawn distance outside the projectile and tune speed/size to avoid
  discrete-physics tunneling. Expired projectiles are unmounted automatically.
- Tracking loss blocks new shots and requests a fresh camera pose on recovery;
  the floor remains fixed and existing physics simulation continues. Neither
  collisions nor basket entry award points in this version.
- Colliders have an explicit `size: [width, height, length]` in meters,
  centered on their object's origin. Unlike the generic object contract,
  configured projectile/target `scale` changes **only the visual model**;
  collider dimensions stay in meters. `physics.shape` is optional and overridden
  by `collider`. Rotating animations on these physical objects are rejected;
  use the object's initial rotation instead.

| Collider   | Configuration / implementation                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `bounding` | Explicit box dimensions; no automatic OBJ/GLB bounds extraction.                                                                     |
| `sphere`   | Equal X/Y/Z dimensions; radius is half the width.                                                                                    |
| `capsule`  | Vertical, X = Z and Y >= X; compound approximation using overlapping spheres and a central box. Y = X becomes a sphere.              |
| `diamond`  | Octahedron approximation, made of 8 vertical layers with 5 box strips each.                                                          |
| `basket`   | Open rectangular basket: bottom and four walls, no lid. Requires positive `thickness` smaller than height and half the width/length. |

Viro supports boxes, spheres and their compounds, not native capsule or convex
octahedron shapes. The two approximations are intentional and not exact smooth
surfaces. All five choices work for projectiles and targets independently of the
visual asset; a visually hollow OBJ needs `basket` rather than a solid bounding
box for projectiles to enter.

The 3D fallback uses the same physical objects and launch mechanics with an
immediate synthetic floor centered at `[0, -1, -2]` and the configured minimum
dimensions; it does not claim to track a real plane.
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

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

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
