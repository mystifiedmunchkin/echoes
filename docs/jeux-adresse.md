# Jeux d'adresse : API, JSON et fonctionnement interne

Cette documentation decrit le fonctionnement actuellement implemente dans
l'application mobile, pour un jeu `type: "aiming"` disposant de `settings`.
Sans `settings`, le template affiche simplement les objets : il ne prepare pas
le sol et ne gere pas les lancers configures.

Les blocs `mermaid` peuvent etre affiches avec un visualiseur Mermaid compatible.
Les donnees et identifiants des exemples sont fictifs.

## 1. Requetes API et preparation des ressources

```mermaid
sequenceDiagram
    actor User as Utilisateur
    participant App as Application mobile
    participant Auth as Service auth
    participant Store as AsyncStorage
    participant Radar as useRadar
    participant API as API Echoes
    participant Parser as readExperience
    participant Cache as Cache fichiers local
    participant AR as Scene AR / viewer 3D

    opt Connexion utilisateur
        User->>App: Se connecter
        App->>Auth: login(credentials)
        Auth->>API: POST /api/login (JSON)
        API-->>Auth: token ou access_token, user ou data
        Auth->>Store: Conserver token et utilisateur
    end

    App->>Radar: Obtenir une position GPS et charger les lieux
    Radar->>Auth: getAuthToken()
    Auth->>Store: Lire le token local
    Store-->>Radar: Token si disponible
    Radar->>API: GET /api/memories-near-me?latitude=LAT&longitude=LNG
    Note over Radar,API: Accept: application/json ; Authorization si token disponible
    alt Erreur HTTP
        API-->>Radar: Statut non 2xx
        Radar-->>App: Erreur API
    else Reponse valide
        API-->>Radar: Tableau JSON ou enveloppe data / memories
        Radar->>Radar: Normaliser les lieux et interactive.logic.games
        Radar-->>App: Memoires disponibles sur la carte / en AR
    end

    User->>App: Choisir une memoire interactive
    App->>Radar: cacheMemoryAssets(memory)
    Radar->>Parser: Valider jeux, assets, objets et settings
    alt Definition invalide
        Parser-->>App: Erreur explicite de preparation
    else Definition valide
        loop Chaque asset du jeu
            Radar->>Cache: Le fichier est-il deja disponible ?
            alt Fichier absent
                Radar->>API: GET URL de l'asset / api/private-files/...
                Note over Radar,API: Authorization si token disponible
                API-->>Cache: Fichier GLB, GLTF, OBJ ou autre media
            end
            Cache-->>Radar: URI locale file://...
        end
        Radar-->>App: Experience avec URL des assets mises en cache
        App->>AR: ExperienceContent puis ConfiguredAimingTemplate
    end
```

### Requetes utilisees par le client

Base API : `https://echoes.sophiehorner.art`.

| Usage | Methode et chemin | Donnees / resultat |
| --- | --- | --- |
| Connexion facultative | `POST /api/login` | Credentials JSON ; retourne un token et l'utilisateur. |
| Decouverte des lieux | `GET /api/memories-near-me?latitude={lat}&longitude={lng}` | Retourne les memoires et leurs definitions interactives. |
| Telechargement des assets | `GET {asset.url}` | URL distante resolue par le client ; contenu mis en cache localement. |
| Fichiers prives | `GET /api/private-files/{userId}/model_3D/{filename}` | Forme construite pour les references 3D privees ; une URL deja complete peut aussi etre utilisee. |
| Progression utilisateur | `POST /api/progress` | Bearer token ; totaux absolus des scores, lieux visites et objets collectes, a la fermeture ou au changement de jeu. |

Les requetes de lecture utilisent le token stocke lorsqu'il existe. Les URL
externes d'assets restent possibles : tous les telechargements ne visent donc pas
necessairement le serveur Echoes.

Le chargement accepte les enveloppes suivantes :

```json
{ "data": [] }
```

```json
{ "memories": [] }
```

Un tableau directement a la racine est egalement accepte. La normalisation
accepte plusieurs variantes des definitions interactives, dont certains champs
serialises en chaines JSON. L'exemple ci-dessous utilise des objets JSON natifs.
Les memoires sont dedupliquees par ID avant d'alimenter la carte et les marqueurs
AR : `1` et `"1"` designent la meme memoire. La premiere occurrence valide est
conservee et les IDs repetes sont signales par un avertissement dans les logs.
Deux lieux avec des IDs distincts restent distincts, meme aux memes coordonnees.
Les telechargements paralleles attendent une creation partagee du dossier de
cache, notamment au premier lancement. Une erreur reelle de creation est propagee
a la preparation AR ; elle n'est pas masquee. Le cache des modeles utilise le meme
mecanisme pour son propre dossier.

Les impacts individuels ne sont pas envoyes. Les totaux locaux sont envoyes a
`POST /api/progress`, avec `Authorization: Bearer {token}` et un corps JSON :

```json
{
  "scores": [
    { "location_id": 12, "game_type": "aiming", "score": 125 }
  ],
  "visited_location_ids": [12, 15],
  "collected_items": [
    { "location_id": 12, "game_id": 100, "item_id": 3, "quantity": 1 }
  ]
}
```

Les valeurs sont absolues : renvoyer le meme payload ne doit pas incrementer
les totaux serveur. Le score est groupe par lieu et type de jeu ; le contrat
des scores ne contient pas de `game_id`. Pour la collection, `item_id` correspond
a `logic.games[].objects[].id`. Le triplet lieu/jeu/objet est unique et sa
quantite reste 1. Le backend doit accepter ces trois identifiants nommes.

Une fermeture d'experience, de camera ou de viewer, ou un changement de jeu,
declenche l'envoi pour le compte connecte. Les ecritures locales sont terminees
avant le snapshot ; les envois sont serialises sans bloquer le jeu suivant.
Un echec affiche une erreur, conserve les donnees et permet leur renvoi au
prochain changement ou fermeture de jeu. Pas d'envoi a chaque impact, au simple
passage en arriere-plan ni de synchronisation automatique au demarrage.

La progression est isolee par compte dans `@progress:user:{userId}`. L'ancien
historique (`@experience_scores`, `@visited_places`, `@collected_memories`) est
attribue une seule fois au premier compte connecte ; `@progress_legacy_owner`
empeche de l'importer dans un autre compte. Les anciens souvenirs restent dans
l'inventaire local, mais ne sont pas convertis artificiellement en objets.
Un invite conserve une progression locale distincte et n'envoie rien.
Le client ne recupere ni ne fusionne encore la progression depuis le serveur.
Le code du backend et son eventuel editeur de jeux ne font pas partie de ce depot.

## 2. Structure JSON d'un jeu d'adresse

### Relations entre les donnees

```mermaid
classDiagram
    Memory "1" --> "1" Interactive : interactive
    Interactive "1" --> "1" Logic : logic
    Logic "1" --> "1..*" Game : games
    Game "1" --> "1..*" Asset : assets
    Game "1" --> "1..*" SceneObject : objects
    Game "1" --> "1" AimingSettings : settings
    AimingSettings "1" --> "1" PlaneSettings : plane
    AimingSettings "1" --> "1" ProjectileSettings : projectile
    SceneObject "1" --> "1" ObjectProperties : properties
    ObjectProperties "1" --> "1" Collider : collider
    ObjectProperties "1" --> "0..1" PhysicsBody : physics
    ObjectProperties ..> Asset : asset references Asset.id
    ProjectileSettings ..> SceneObject : objectId references SceneObject.id
    AimingSettings ..> SceneObject : targets references target IDs

    class Memory {
        number id
        string title
        number latitude
        number longitude
    }
    class Logic {
        Vector3 gravity
    }
    class Game {
        number id
        string type = aiming
    }
    class Asset {
        number id
        string name
        string type
        string url
    }
    class AimingSettings {
        number[] targets
        number reward_optional
        boolean freeze_optional
        integer multiplier_optional
        boolean fall_optional
    }
    class PlaneSettings {
        number minWidth
        number minLength
        number stableMs
    }
    class ProjectileSettings {
        number objectId
        number speed
        number spawnDistance
        number lifetimeMs_or_null
        number maxActive
    }
    class SceneObject {
        number id
    }
    class ObjectProperties {
        number asset
        boolean collectible
        Vector3 position
        Vector3 rotation
        Vector3 scale
    }
    class Collider {
        string type
        Vector3 size
        number thickness
        number base_diamond
        number middle_diamond
        number height_diamond
    }
    class PhysicsBody {
        string type
        number mass
        number restitution
        number friction
        boolean useGravity
    }
```

`position`, `rotation`, `scale`, `physics` et plusieurs parametres sont
facultatifs. `thickness` est obligatoire uniquement pour un collider `basket`.
Pour `diamond`, `base`, `middle` et `height` sont obligatoires et remplacent `size`.
Le diagramme montre le sous-ensemble utile au jeu d'adresse configure, pas tous
les champs disponibles pour les autres types d'experiences.

### Exemple complet de reponse

Les URL `example.test` sont des placeholders a remplacer par de vraies ressources.

```json
{
  "data": [
    {
      "id": 900,
      "user_id": 7,
      "title": "Lancer dans le panier",
      "latitude": 44.0,
      "longitude": 1.0,
      "interactive": {
        "logic": {
          "gravity": [0, -9.81, 0],
          "games": [
            {
              "id": 100,
              "type": "aiming",
              "assets": [
                {
                  "id": 101,
                  "name": "Ballon",
                  "type": "GLB",
                  "url": "https://example.test/ball.glb"
                },
                {
                  "id": 102,
                  "name": "Panier",
                  "type": "GLB",
                  "url": "https://example.test/basket.glb"
                }
              ],
              "objects": [
                {
                  "id": 103,
                  "properties": {
                    "asset": 101,
                    "scale": [1, 1, 1],
                    "collider": {
                      "type": "sphere",
                      "size": [0.2, 0.2, 0.2]
                    },
                    "physics": {
                      "type": "Dynamic",
                      "mass": 0.5,
                      "restitution": 0.4,
                      "friction": 0.7,
                      "useGravity": true
                    }
                  }
                },
                {
                  "id": 104,
                  "properties": {
                    "asset": 102,
                    "position": [0, 0.5, 0],
                    "rotation": [0, 0, 0],
                    "scale": [1, 1, 1],
                    "collider": {
                      "type": "basket",
                      "size": [1, 1, 1],
                      "thickness": 0.05
                    },
                    "physics": {
                      "type": "Static",
                      "friction": 0.7,
                      "restitution": 0
                    }
                  }
                }
              ],
              "settings": {
                "plane": {
                  "minWidth": 2,
                  "minLength": 3,
                  "stableMs": 1000
                },
                "projectile": {
                  "objectId": 103,
                  "speed": 5,
                  "spawnDistance": 0.3,
                  "lifetimeMs": null,
                  "maxActive": 12
                },
                "targets": [104]
              }
            }
          ]
        }
      }
    }
  ]
}
```

### Interpretation des parametres

| Champ | Interpretation |
| --- | --- |
| `logic.gravity` | Gravite globale ; `[0, -9.81, 0]` par defaut. |
| `assets[].id` | Identifiant d'une ressource ; `properties.asset` la reference. |
| `objects[].id` | Identifiant d'un objet modele ; distinct des identifiants des tirs crees au runtime. |
| `settings.projectile.objectId` | Objet utilise comme modele pour chaque lancer. Il n'est pas affiche avant le premier tir. |
| `settings.targets` | Identifiants des objets physiques servant de cibles. |
| `settings.reward` | ID facultatif d'un asset du meme jeu, affiche lors de la validation du score. |
| `settings.freeze` | Booleen facultatif : immobiliser le projectile au premier impact eligible. |
| `settings.multiplier` | Entier strictement positif facultatif : score maximal au centre, 1 par defaut. |
| `settings.fall` | Booleen facultatif : attendre le renversement des cibles Dynamic pour valider le score. |
| `plane.minWidth`, `plane.minLength` | Dimensions minimales du plane detecte, en metres ; pas la taille du sol physique final. |
| `plane.stableMs` | Delai de stabilite avant verrouillage automatique ; un tap sur l'indicateur peut aussi verrouiller le plane. |
| `projectile.speed` | Vitesse de base, en m/s ; la charge du geste applique ensuite un multiplicateur de 1 a 2. |
| `projectile.spawnDistance` | Distance devant la camera au moment du relachement, en metres. |
| `projectile.lifetimeMs` | Champ valide pour compatibilite, mais actuellement ignore par le runtime : tous les projectiles ont une duree illimitee, meme si le serveur envoie `1000`. |
| `projectile.maxActive` | Nombre maximal de projectiles physiques presents, y compris ceux ayant deja touche un obstacle. |
| `position` / `rotation` des cibles | Position en metres et rotation en degres, relatives au sol verrouille. |
| `collider.size` | Dimensions physiques explicites, independantes de la taille native du modele 3D ; remplacees par `base`, `middle`, `height` pour `diamond`. |
| `scale` | Pour les projectiles et cibles configures, modifie seulement le visuel, pas le collider. |

Le sol **100 x 100 x 1 m**, la charge maximale **2 s**, le multiplicateur maximal
**x2** et le mode diagnostic `drawBounds` sont actuellement definis dans le client.
Ils ne sont pas des parametres JSON serveur.

Les colliders acceptes sont `sphere`, `bounding`, `basket`, `capsule` et
`diamond`. Sans regles d'impact, une cible `bounding` ou `basket` est ouverte en haut et possede un fond
et quatre parois physiques. Seules ces deux familles de cibles ont actuellement
la regle de score de fond. Les autres formes restent physiques sans attribution
automatique de score.

### Regles d'impact : contrat serveur/client

Les quatre champs sont directement dans `settings`, pas dans `projectile` ni
dans les proprietes d'une cible. Ils s'appliquent aux cibles de ce jeu `aiming`.
Exemple de flechettes (ajouter l'asset 105 au tableau `assets`) :

```json
{
  "plane": { "minWidth": 2, "minLength": 3 },
  "projectile": { "objectId": 103 },
  "targets": [104],
  "reward": 105,
  "freeze": true,
  "multiplier": 10,
  "fall": false
}
```

- Sans aucun de ces quatre champs, le comportement historique reste inchange :
  `bounding` ouvert et `basket`, score de fond uniquement, un point par tir.
- La presence d'au moins un champ, meme `freeze: false` ou `fall: false`, active
  les nouvelles regles. `bounding` devient une boite pleine, adaptee aux cibles
  de flechettes et aux quilles. Toutes les formes peuvent scorer sur contact ;
  `basket` conserve obligatoirement la condition de fond interieur.
- `reward` reference un asset existant du meme jeu (modele, image, video ou
  audio), prepare et mis en cache comme les autres assets. Il est ajoute sans
  collider au point d'impact, seulement lorsque le score est valide. Le visuel
  initial de la cible reste present. La recompense reste jusqu'a la sortie du
  jeu ; ce n'est pas un objet d'inventaire. Si le champ est absent, aucun asset
  supplementaire n'est affiche.
- `freeze: true` remplace le corps du projectile par un corps Static, sans
  gravite ni vitesse, a sa pose native au contact eligible. Le projectile reste
  visible et compte toujours dans `maxActive`. Par defaut il continue sa course.
- `multiplier` est le score maximal au centre du collider. Le point et la normale
  sont convertis dans le repere actuel de la cible (rotation incluse). L'axe
  principal de la normale est ignore pour ne pas penaliser la profondeur ;
  la distance radiale dans les deux axes restants est normalisee par les
  demi-dimensions du collider. Ainsi `r = min(1, hypot(u, v))` et
  `points = 1 + round((multiplier - 1) * (1 - r))`. Avec 10 : centre = 10,
  demi-rayon = 6, bord ou au-dela = 1. Sans `multiplier`, chaque validation
  rapporte 1. Ce sont des anneaux elliptiques dans la face projetee, pas les
  secteurs numerotes d'une cible de flechettes traditionnelle.
- Sans `fall`, un projectile ne rapporte qu'une seule fois dans le jeu, meme
  s'il touche plusieurs cibles ou declenche des callbacks repetes.
- `fall: true` exige `properties.physics.type: "Dynamic"` sur toutes les cibles.
  Un impact arme la cible mais ne rapporte rien tant que son axe vertical n'a
  pas bascule d'au moins **60 degres par rapport a sa pose initiale** (orientation
  du sol comprise). Une rotation autour de cet axe ne suffit pas. La pose native
  est echantillonnee toutes les 100 ms apres le premier tir ; pas de delai maximal
  artificiel. Les contacts entre cibles propagent l'attribution du tir pour les
  reactions en chaine du bowling. Chaque cible rapporte une seule fois par
  instance de jeu, et un meme tir peut donc faire scorer plusieurs quilles.
  Une cible jamais touchee par un tir ou par une cible de cette chaine ne score
  pas simplement parce qu'elle tombe.
- Pour un renversement direct ou indirect, les points et la position de recompense
  sont memorises au premier contact eligible de la cible avec le projectile ou
  une cible de sa chaine. Associer `freeze` et `fall` est accepte, mais
  immobiliser la balle peut empecher les renversements.
- Les types incorrects (`"true"`, nombres fractionnaires, `null`...), un
  `multiplier` hors entier positif sur, un asset absent ou des cibles non
  dynamiques avec `fall` provoquent une erreur explicite de preparation.
  Les erreurs de lecture des poses natives sont remontees via `onError`.

Exemple bowling : reprendre les champs de preparation habituels et definir
`"fall": true, "freeze": false, "multiplier": 1` ; utiliser des cibles `capsule`
ou `bounding` avec des corps Dynamic.

L'evenement de validation garde `name: "collision"` et `scoringContact: true`,
avec `projectileId`, `point`, `normal`, et desormais `points` (ainsi que
`fallen: true` pour les renversements). Les notifications brutes de collision
restent distinctes et n'ajoutent pas de points. L'application additionne
`points` (1 pour les anciens evenements) dans la progression existante.
Le payload de `POST /api/progress` reste identique : seulement des totaux absolus,
pas un appel supplementaire par impact. Ces regles sont communes a l'AR et au
viewer 3D ; aucune execution backend ou evaluation de script arbitraire n'est
ajoutee.

### Configurer `capsule` et `diamond`

Ces formes sont utilisables pour un projectile ou une cible, en AR comme dans le
viewer 3D. Toutes les dimensions sont en metres, dans le repere local de
l'objet ; `rotation` oriente le corps complet. `scale` ne modifie que le modele
visible, pas ces dimensions physiques.

Capsule verticale de 20 cm de diametre et 60 cm de hauteur totale :

```json
{
  "collider": { "type": "capsule", "size": [0.2, 0.6, 0.2] }
}
```

`X` doit etre egal a `Z` et `Y >= X`. La partie droite mesure `Y - X`.
Le collider est un `Compound` de spheres superposees et d'une boite centrale.
Lorsque `Y = X`, il devient une sphere.

Diamond a socle et haut plats : base carree de 20 cm de cote, hauteur de 60 cm,
sphere centrale de 15 cm de rayon :

```json
{
  "collider": { "type": "diamond", "base": 0.2, "middle": 0.15, "height": 0.6 }
}
```

Le collider `diamond` est un `Compound` de deux formes :

- Une boite pleine (comme un `bounding` solide), de dimensions
  `[base, height, base]`, assurant un socle et un haut carres et plats.
- Une sphere de rayon `middle`, centree a mi-hauteur de la boite.

Les deux formes sont centrees en `[0, 0, 0]`. Le bas est a `-height / 2` et le haut
a `height / 2` ; la hauteur est toujours portee par l'axe local Y. `base`,
`middle` et `height` sont des nombres finis strictement positifs obligatoires.
`middle <= height / 2` est impose pour que la sphere ne depasse pas les plans
du socle et du haut. Pour un renflement visible au milieu, choisir
`middle > base / 2`. La largeur et la profondeur totales valent
`max(base, 2 * middle)` ; ces dimensions sont aussi utilisees pour le calcul
radial du score et les formes physiques derivees.

L'ancien `diamond` en octaedre a couches n'est plus accepte :
`size` ne doit pas etre envoye pour `diamond`, et il n'existe pas de valeurs
par defaut pour les trois nouveaux champs. Les autres colliders conservent
`size: [X, Y, Z]` et n'acceptent pas ces nouveaux champs.
Le pont Viro utilise fournit les boites, spheres et corps composes necessaires ;
seule la capsule reste une approximation a spheres superposees.
Les collisions restent actives apres impact et ne suppriment pas le projectile.
Sans les nouvelles regles d'impact, leur utilisation comme cible n'ajoute pas
de score automatique.

### Configurer un objet collectible

Le serveur doit envoyer le booleen dans les proprietes de l'objet :

```json
{
  "id": 3,
  "properties": {
    "asset": 10,
    "collectible": true
  }
}
```

Le jeu parent doit posseder un `id` explicite ; l'ID du lieu est celui de la
memoire. L'absence de `collectible` ou sa valeur `false` desactive la collecte.
Les chaines `"true"` et `"false"` sont refusees. Un appui de 600 ms declenche la
collecte, annule le lancer charge et conserve le modele visible. Relacher avant
ce delai, perdre le tracking ou demonter l'objet annule l'appui long.
Pour un projectile lance, l'ID collecte reste celui de l'objet serveur, jamais
l'ID negatif genere pour le tir. Un compte connecte est requis pour collecter.

## 3. Cycle interne : preparation, lancer, physique et score

```mermaid
flowchart TD
    Start["ExperienceContent : jeu aiming"] --> Config{"settings presents ?"}
    Config -->|Non| ObjectsOnly["Afficher les objets sans mecanique de tir configuree"]
    Config -->|Oui| Mode{"Mode ?"}

    subgraph Preparation["Preparation du terrain"]
        Mode -->|AR| Scan["Tracking et detection ViroARPlane horizontal"]
        Scan --> Candidate["Plane candidat : evenement planeCandidate et indicateur bleu"]
        Candidate --> Selection{"Tap sur l'indicateur<br/>ou stabilite avec tracking normal ?"}
        Selection -->|Non| Scan
        Selection -->|Oui| Lock["Verrouiller centre et orientation : planeReady"]
        Mode -->|Viewer 3D| Synthetic["Sol synthetique immediat"]
        Lock --> Floor["Sol Static : 100 x 100 x 1 m<br/>Face superieure au niveau du plane"]
        Synthetic --> Floor
        Floor --> Targets["Monter les cibles<br/>bounding plein avec les nouvelles regles"]
    end

    subgraph Throw["Interaction et creation d'un projectile"]
        Targets --> Down["CLICK_DOWN : memoriser le debut du geste"]
        Down --> Hold["Maintien : aucun tir avant relachement"]
        Hold --> Up["CLICK_UP : calculer la duree"]
        Hold -->|Tracking perdu ou jeu change| Cancel["Annuler la charge"]
        Up --> Checks{"Sol, tracking, camera<br/>et maxActive valides ?"}
        Checks -->|Non| Block["shotBlocked : plane / tracking / camera / limit"]
        Checks -->|Oui| Launch["Vitesse = base x 1 a 2<br/>Charge plafonnee a 2 secondes"]
        Launch --> Spawn["Creer un tir : ID negatif<br/>Position et orientation de la camera au relachement"]
        Spawn --> Body["SceneObject : corps Dynamic<br/>instantVelocity et gravite par defaut"]
        Body --> ShotEvent["Evenement shot"]
    end

    subgraph Physics["Simulation Viro et qualification du contact"]
        Body --> Sim["Simulation physique native"]
        Sim --> Contact{"Contact ?"}
        Contact -->|Non| Sim
        Contact -->|Oui| Keep["Conserver le projectile et son collider<br/>Aucune suppression ou copie visuelle a l'impact"]
        Keep --> Rules{"Nouvelles regles d'impact ?"}
        Rules -->|Non| Eligible{"Callback d'une cible<br/>bounding / basket ?"}
        Rules -->|Oui| Impact["Contact cible / projectile actif<br/>basket : fond uniquement"]
        Impact --> Effects["Figer si freeze ; calcul radial des points"]
        Effects --> Fall{"fall ?"}
        Fall -->|Oui| Tilt["Attendre 60 degres ; une validation par cible<br/>Propager les contacts entre quilles"]
        Fall -->|Non| Once["Une validation par projectile"]
        Tilt --> Reward["Ajouter reward si configure"]
        Once --> Reward
        Reward --> ScoreEvent
        Eligible -->|Non| Continue["Pas de point : la simulation continue"]
        Eligible -->|Oui| Transform["SceneObject : getTransformAsync<br/>Position et rotation monde actuelles"]
        Transform -->|Erreur| Error["Signaler onError ; aucun point"]
        Transform --> Bottom{"Point et normale dans le repere local :<br/>face interieure du fond ?"}
        Bottom -->|Non| NoScore["collision : scoringContact false"]
        Bottom -->|Oui| Claim{"claimScore : projectile actif<br/>et pas encore score dans ce jeu ?"}
        Claim -->|Non| NoScore
        Claim -->|Oui| ScoreEvent["collision : scoringContact true<br/>projectileId = ID du tir"]
        Continue --> Sim
        NoScore --> Sim
        Error --> Sim
        ScoreEvent --> Sim
    end

    subgraph Scoring["Application et progression par compte"]
        ScoreEvent --> App["App.handleExperienceEvent"]
        App --> Memory{"Lieu actif AR ou viewer<br/>et ID de projectile valide ?"}
        Memory -->|Oui| Score["+points par lieu et type : useProgress<br/>1 pour les anciens evenements"]
        Memory -->|En AR| Inventory["Ajouter le souvenir a l'inventaire historique"]
        Score --> ScoreStore["AsyncStorage : @progress:user:{userId}"]
        Inventory --> ScoreStore
        Score --> Menu["Menu : onglet Scores"]
        Object["Objet avec properties.collectible = true"] --> HoldObject["Appui long 600 ms<br/>Annuler le tir charge"]
        HoldObject --> CollectObject["Collecter une seule fois<br/>location_id + game_id + item_id"]
        CollectObject --> ScoreStore
        ScoreStore --> EndGame["Fermer l'experience / camera / viewer<br/>ou changer de jeu"]
        EndGame --> Post["POST /api/progress<br/>Totaux absolus, token du compte verifie"]
        Post -->|Echec| Retry["Afficher l'erreur et garder les donnees<br/>Renvoyer a la prochaine fin de jeu"]
    end

    Sim -.-> Unlimited["Duree illimitee imposee par le client<br/>Aucun timer de suppression, meme si lifetimeMs est configure"]
    Sim -->|Quitter ou changer de jeu| Reset["Demonter terrain et projectiles<br/>Reinitialiser les IDs et la deduplication du jeu"]
```

### Details importants

- Le sol est fini : ses bords sont a 50 m du centre. Il simule un terrain tres
  grand a l'echelle AR, pas un plan mathematiquement infini.
- Le verrouillage automatique du plane reste actif ; le tap n'est pas obligatoire.
- Une perte du tracking ne retire pas le sol verrouille ni les projectiles deja
  presents. Elle bloque les nouveaux tirs et annule le geste en cours.
- Un contact avec une paroi peut devier le projectile vers le fond : la physique
  n'est pas retiree au premier impact.
- Le score de fond repose sur le point et la normale du contact, convertis dans
  le repere actuel de la cible. Le callback Viro ne fournit pas ici un identifiant
  distinct pour chaque sous-collider du compound.
- Le dessus des parois, les faces laterales et le dessous du fond ne doivent pas
  scorer. Une tolerance de penetration est appliquee au point de contact du fond.
- En mode historique, `claimScore` partage un ensemble d'IDs entre les cibles du jeu : le meme tir ne
  rapporte qu'un point, meme s'il touche plusieurs fois ou plusieurs cibles.
- Une nouvelle instance du jeu recommence ses IDs de tir ; les totaux enregistres
  par memoire restent persistants sur cet appareil.
- Le viewer 3D partage le mecanisme de lancer, de collision, de score et de
  collecte d'objets. Ses fermetures et changements de jeu synchronisent aussi
  les totaux du compte connecte.
- Avec une duree de vie illimitee, atteindre `maxActive` bloque les nouveaux tirs
  jusqu'a la sortie du jeu. Un projectile pose au sol compte toujours dans cette limite.
- Les contours physiques sont actuellement masques avec `drawBounds: false`,
  en AR et dans le viewer 3D, y compris en developpement. Les collisions restent actives.
  Les schemas decrivent le code ; ils ne remplacent pas une verification des
  collisions et du rendu sur appareil.

## 4. Correspondance avec le code

| Responsabilite | Fichier |
| --- | --- |
| Authentification et token local | [auth.js](../src/services/auth.js) |
| Requete des lieux, normalisation et telechargement des assets | [useRadar.js](../src/hooks/useRadar.js) |
| Contrat des experiences, validation et remplacement des URL par le cache | [experience.ts](../src/experiences/experience.ts) |
| Selection du template | [ExperienceTemplates.tsx](../src/experiences/ExperienceTemplates.tsx) |
| Tracking, pose camera et chronometrage du geste | [AimingScene.tsx](../src/experiences/AimingScene.tsx) |
| Plane, sol, cibles, creation des tirs et deduplication des points | [AimingTemplate.tsx](../src/experiences/AimingTemplate.tsx) |
| Calcul de vitesse, formes physiques, score radial, seuil de chute et test du fond | [aiming.ts](../src/experiences/aiming.ts) |
| Association modele/collider et callback natif de collision | [SceneObject.tsx](../src/experiences/SceneObject.tsx) |
| Scene AR et affichage diagnostique des colliders | [ViroARView.tsx](../src/components/ViroARView.tsx) |
| Scene 3D de remplacement | [ExperienceViewer.tsx](../src/experiences/ExperienceViewer.tsx) |
| Reception des evenements et integration avec la memoire selectionnee | [App.js](../App.js) |
| Persistance par compte, scores, visites, collection et file d'envoi | [useProgress.js](../src/hooks/useProgress.js) |
| Payload, migration historique et POST de progression | [progress.ts](../src/services/progress.ts) |
| Affichage des scores | [MenuModal.js](../src/components/MenuModal.js) |
