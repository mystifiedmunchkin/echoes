/** Local IDs are stable storage keys, never server location identifiers. */
export default [
  {
    localId: 1,
    definition: require('./demo1.json'),
    assets: {
      'demo1_ball.glb': require('../models/demo1_ball.glb'),
      'demo1_skittle.glb': require('../models/demo1_skittle.glb'),
    },
  },
  {
    localId: 2,
    definition: require('./demo2.json'),
    assets: {
      'demo2_unicorn.glb': require('../models/demo2_unicorn.glb'),
      'demo2_basket.glb': require('../models/demo2_basket.glb'),
    },
  },
  {
    localId: 3,
    definition: require('./demo3.json'),
    assets: {
      'demo3_dart.glb': require('../models/demo3_dart.glb'),
      'demo3_dartboard.glb': require('../models/demo3_dartboard.glb'),
    },
  },
];
