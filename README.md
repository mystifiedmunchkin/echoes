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
not finished games: aiming rules, geolocated quest progression, collection of
individual keys/clues, scoring and persistence remain to be implemented.
Existing map proximity restrictions and legacy memory viewers remain unchanged.

The API returns **JSON objects**, not JSON-encoded strings. Use a response-level
`type` and `interactive.logic`, or response-level `logic`. A definition-level
`interactive.type` overrides the response type, and each game's optional `type`
overrides both. All templates use the same `assets` / `objects` structure.
Legacy string-encoded fields remain readable for backwards compatibility.

```json
{
  "id": 42,
  "type": "images",
  "interactive": {
    "logic": {
      "gravity": [0, -9.81, 0],
      "games": [
        {
          "id": "animated-poster",
          "assets": [
            { "id": "butterfly", "type": "GLB", "url": "https://example.com/butterfly.glb" }
          ],
          "target": {
            "id": "poster",
            "imageUrl": "https://example.com/poster.jpg",
            "physicalWidth": 0.6,
            "orientation": "Up"
          },
          "objects": [
            {
              "id": "butterfly-on-poster",
              "properties": {
                "asset": "butterfly",
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
    }
  }
}
```

- IDs are non-empty strings, unique within their game/collection. Game IDs can
  be omitted (the array index is then used). Asset types: `GLB`, `GLTF`, `OBJ`,
  `image`, `video`, `audio`. Asset IDs referenced by `properties.asset` must exist
  in that game's asset list. An object can instead contain `properties.text`.
  `properties.active: false` hides the object.
- Positions and physical dimensions use meters; rotations use degrees.
  `scale` must contain three positive numbers. All vectors contain three finite
  numbers. Scenes default to gravity `[0, -9.81, 0]`.
- Every template supports optional physics in both AR and the 3D fallback:
  `Dynamic`, `Static`, or `Kinematic`, with an explicit `Box` shape
  (`params: [width, height, length]`) or `Sphere` (`params: [radius]`).
  Optional fields: `mass` (positive for dynamic bodies), `restitution`,
  `friction` (both 0..1), `useGravity`, `velocity`.
  Include static collider objects when needed; detecting an AR plane does not
  automatically create a physical floor. Dynamic bodies are simulated by Viro.
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
  scenes start two meters in front of the session origin. Image scenes use the
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
