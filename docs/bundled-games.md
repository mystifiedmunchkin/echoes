# Collection: complete games and bundled demos

The Collection can contain complete games, legacy memories and individual
collected game objects. Only complete games and memories have a replay action;
individual game objects are inventory entries, not playable scenes.

## Adding and replaying a discovered game

Use **Add game to Collection** from a nearby game's details, or from its active
AR/3D scene. Adding a discovered game requires an account. The app validates the
game and caches all its assets before saving its complete definition, including
objects, colliders, projectile settings, rewards and multiple games. Adding a
complete game upgrades an earlier model-only entry with the same location/game
identity. Collection contents remain account-scoped.

**Place here again** opens that saved definition without another nearby search
or GPS position. The original server IDs and coordinates are retained. Nothing
is published or duplicated at the player's physical position. AR still requires
camera permission and a suitable tracked floor for aiming games. Galaxy A
devices use the existing 3D game viewer instead. Ordinary map discovery keeps
its proximity restrictions.

## Registering games shipped with the application

The registry is [assets/demos/index.js](../assets/demos/index.js). Three demos
are registered and playable in **local-only mode**:
[demo1.json](../assets/demos/demo1.json) (ball/skittle bowling),
[demo2.json](../assets/demos/demo2.json) (unicorn/basket), and
[demo3.json](../assets/demos/demo3.json) (dart/dartboard with freezing).
They reference the six `demo*.glb` files in `assets/models/` through `bundle:`
keys matching their filenames.

Each entry has a stable positive `localId` (`1`, `2`, `3`). This explicitly
disables server synchronization, even for signed-in users. The loader uses
negative on-device location keys (`-1`, `-2`, `-3`) and supplies numeric scene
game IDs when the JSON IDs are null, without modifying the JSON. Negative
location keys are excluded from **every** progress payload, including later
uploads for ordinary server games. Do not reuse/change local IDs after release:
they identify the stored scores. The Collection labels these games as having
local scores.

To enable server synchronization later, first create the real locations/games,
fill in the top-level `id`, `location_id` and `interactive.logic.games[0].id`
(currently `null`), then **remove `localId`** from that registry entry. The
top-level `id` and the game's `id` must match. Asset/object IDs within the
definition must also match the server's game definition (demo1 has three target
objects, IDs `2`, `3`, `4`). Coordinates remain `0,0`. Local-only scores are
kept separate and are not automatically migrated to the server identity.

Scales, collider sizes, positions, masses and launch speeds are starting values,
not device-calibrated measurements. The supplied models have different origins
and orientations: verify alignment between visuals and colliders before shipping.
In particular, the dart mesh's long axis is X, while shots travel along the
camera's forward direction; reorient its GLB if the dart should fly nose-first.
The runtime uses the camera rotation for launched projectiles, so editing the
projectile's initial `properties.rotation` alone does not change shot orientation.

Add each game's JSON and self-contained GLB models, images, audio or video under
`assets/demos/`, then add an entry using **literal** Metro `require` calls:

```js
export default [
  {
    localId: 4,
    definition: require('./basket/game.json'),
    assets: {
      'ball.glb': require('./basket/ball.glb'),
      'basket.glb': require('./basket/basket.glb'),
    },
  },
];
```

Dynamic paths such as `require(variable)` do not work with Metro. JSON resources
use `bundle:<registered-key>` URLs. Every game asset and image-tracking target
must resolve through this map; remote resources and missing bindings fail
explicitly. Bundled 3D models must use GLB with embedded textures; external
GLTF/OBJ dependencies are not supported by this registry.

The game JSON uses the same memory/`interactive.logic` schema as server games.
There is no separate demo gameplay schema. Without `localId`, the loader requires
real, reserved server identifiers. Example server-backed definition below:
**replace 900 and 101 with real identifiers before enabling synchronization**.

```json
{
  "id": 101,
  "location_id": 900,
  "name": "Demo basket",
  "description": "A complete basket game available everywhere.",
  "lat": 0,
  "lng": 0,
  "interactive": {
    "logic": {
      "gravity": [0, -9.81, 0],
      "games": [
        {
          "id": 101,
          "type": "aiming",
          "subtype": "basket",
          "assets": [
            { "id": 1, "type": "GLB", "url": "bundle:ball.glb" },
            { "id": 2, "type": "GLB", "url": "bundle:basket.glb" }
          ],
          "objects": [
            {
              "id": 1,
              "properties": {
                "asset": 1,
                "collider": { "type": "sphere", "size": [0.1, 0.1, 0.1] }
              }
            },
            {
              "id": 2,
              "properties": {
                "asset": 2,
                "position": [0, 0.5, -2],
                "collider": {
                  "type": "basket",
                  "size": [1, 1, 1],
                  "thickness": 0.05
                }
              }
            }
          ],
          "settings": {
            "plane": { "minWidth": 1, "minLength": 1 },
            "projectile": { "objectId": 1, "speed": 5 },
            "targets": [2],
            "multiplier": 5
          }
        }
      ]
    }
  }
}
```

The top-level `id` identifies one of `logic.games`. Multiple games may be
included. Game and object IDs must match the server definitions. Duplicate
location/game entries are rejected. Coordinates are always `0,0` (omitted/null
coordinates are normalized to zero). For server-backed entries, `location_id` is a real positive server
identifier, **not** latitude/longitude or a fabricated ID of zero.

## Availability and progression

- Registered games are always prepended to the Collection, even without an
  account, GPS, a nearby server response or an asset download. The catalog is not
  copied into per-user storage, so clearing the Collection cannot remove it.
- Included games use **Play here**. Gameplay is the existing full experience
  runtime, not the legacy single-model renderer. Their catalog data is never
  rewritten to the player's coordinates.
- Guest scores persist locally in `@progress:v2:guest`. Signed-in scores and
  collected objects persist separately under `@progress:v2:user:{userId}`.
  Signing in does not merge guest scores into an account.
- Local-only games never upload scores, visits or objects, regardless of the
  authenticated account. Their scores use the same account/guest-scoped local
  storage and survive app restarts.
- At game switch or close, authenticated **server-backed** demo scores use the existing
  `POST /api/progress` endpoint with the original `location_id`, `game_type` and
  absolute `score`. The demo request contains empty `visited_location_ids` and
  `collected_items`; it never registers a new place or publishes a placement.
  A demo with no stored score does not send an empty request.
- Demo visits are not recorded. Collected demo objects can remain in the local
  Collection but are excluded from subsequent regular-game uploads as well.
  Failed score uploads remain locally saved, report an error and retry with
  absolute totals on a later game-end upload.
- Scores keep the existing server aggregation by location and game type, not by
  placement or game ID. Reserve distinct locations if demos need separate
  leaderboards for games of the same type.

The server must already contain the matching demo locations/games before
enabling server-backed entries; local-only entries require no server records.
No new API endpoint or location-creation request is introduced.
Physical-device validation is still required for AR placement,
collisions and loading packaged media in release mode.
