window.RB = window.RB || {};
// Token cards. Tokens are not printed in the card gallery the way deck cards are, so these
// are authored from the text of the cards that create them — the name, type, domain and
// might each creating card states. A token leaves no trash: RB.kill drops it.
// Ids are prefixed `tok-` so they can never collide with a real card number.
RB.tokenData = [
  { id: 'tok-sand-soldier', name: 'Sand Soldier', nameId: 'sand-soldier', type: 'Unit',
    domain: 'Calm', domains: ['Calm'], tags: ['Shurima', 'Token'], energy: 0, power: 0, might: 2,
    rarity: 'Token', set: 'Token', artist: null },
  { id: 'tok-gold', name: 'Gold', nameId: 'gold', type: 'Gear',
    domain: 'Colorless', domains: [], tags: ['Token'], energy: 0, power: 0, might: null,
    rarity: 'Token', set: 'Token', artist: null },
  { id: 'tok-reflection', name: 'Reflection', nameId: 'reflection', type: 'Unit',
    domain: 'Mind', domains: ['Mind'], tags: ['Token'], energy: 0, power: 0, might: 0,
    rarity: 'Token', set: 'Token', artist: null },
  { id: 'tok-bird', name: 'Bird', nameId: 'bird', type: 'Unit',
    domain: 'Calm', domains: ['Calm'], tags: ['Token'], energy: 0, power: 0, might: 1,
    rarity: 'Token', set: 'Token', artist: null },
  { id: 'tok-sprite', name: 'Sprite', nameId: 'sprite', type: 'Unit',
    domain: 'Chaos', domains: ['Chaos'], tags: ['Token'], energy: 0, power: 0, might: 1,
    rarity: 'Token', set: 'Token', artist: null },
  { id: 'tok-mech', name: 'Mech', nameId: 'mech', type: 'Unit',
    domain: 'Body', domains: ['Body'], tags: ['Mech', 'Token'], energy: 0, power: 0, might: 3,
    rarity: 'Token', set: 'Token', artist: null },
];
RB.tokenAbilities = {
  'tok-sand-soldier': { vanilla: true },
  // Gold's printed ability: "Kill this, [E]: Add [A]." Six Spiritforged cards make one,
  // and a Gold that produces nothing is an inert token wearing a resource's name.
  'tok-gold': {
    activated: [{
      energy: 0, power: 0, exhaustSelf: true, killSelf: true, tags: ['Reaction'],
      effects: [{ op: 'addPower', domain: 'any', n: 1 }],
    }],
  },
  'tok-reflection': { vanilla: true },
  'tok-bird': { vanilla: true },
  'tok-sprite': { vanilla: true },
  'tok-mech': { vanilla: true },
};
