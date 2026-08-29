// deno test --allow-net moderation_test.ts
//
// The point of these cases is not coverage, it is the two failure modes that
// matter: a masked name getting through, and an innocent name being rejected.

import { assertEquals } from 'jsr:@std/assert@1';
import { moderate, normalise } from './moderation.ts';

const MUST_REJECT = [
  '@$$',        // invalid characters - dies at the charset gate
  'a55',        // -> ass
  '4ss',        // -> ass
  'sh1t',       // -> shit
  'f_u_c_k',    // underscores stripped -> fuck
  '@$$h0l3',    // -> asshole
  'fuuuuck',    // repeat collapse -> fuck
  'Fuck2',      // trailing digit dropped -> fuck
  'admin',      // reserved
  'chainlink',  // reserved
  'ab',         // too short
  'way_too_long_username_here',
  'pe ter',     // space is not in the charset
];

// The Scunthorpe set. These are the reason the wordlist matches on word
// boundaries rather than as a substring.
const MUST_ACCEPT = [
  'Cassandra',
  'Bassmaster',
  'Peter2',
  'Shell_Game',
  'Hasselhoff',
  'Scunthorpe',
  'Analysis',
  'Peter',
  'jonjon',
  'Madelyn_99',
];

Deno.test('masked and reserved names are rejected', () => {
  for (const name of MUST_REJECT) {
    const v = moderate(name);
    assertEquals(v.ok, false, `expected REJECT but got through: ${name}`);
  }
});

Deno.test('innocent names survive the filter', () => {
  for (const name of MUST_ACCEPT) {
    const v = moderate(name);
    assertEquals(v.ok, true,
      `expected ACCEPT but was rejected: ${name} (${v.ok ? '' : v.reason}) keys=${JSON.stringify(normalise(name))}`);
  }
});
