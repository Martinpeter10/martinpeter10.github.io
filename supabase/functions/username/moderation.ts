// Username moderation - pure logic, no network and no Deno APIs, so it can be
// unit tested with `deno test`. index.ts holds the HTTP handler; everything
// that decides whether a name is allowed lives here.

import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'npm:obscenity@0.4.3';

export const SHAPE = /^[A-Za-z0-9_]{3,16}$/;

// Only digits and _ can actually reach the wordlist stage (SHAPE runs first),
// but the map is complete so the normaliser stays correct if the shape rule is
// ever relaxed.
const LEET: Record<string, string> = {
  '4': 'a', '@': 'a', '^': 'a',
  '8': 'b', 'ß': 'b',
  '(': 'c', '¢': 'c', '©': 'c',
  '3': 'e', '€': 'e',
  '6': 'g', '9': 'g',
  '1': 'i', '!': 'i', '|': 'i',
  '0': 'o', '°': 'o',
  '$': 's', '5': 's', '§': 's',
  '7': 't', '+': 't',
  '2': 'z',
};

/**
 * Fold a name down to comparison keys.
 *
 *   stripped   full leet substitution      a55     -> ass
 *   collapsed  runs of a repeat folded     fuuuck  -> fuck
 *   suffixed   trailing digits dropped     Fuck2   -> fuck
 *
 * The third key exists because trailing digits are the most common thing in a
 * username and substituting them is over-eager - Peter2 folds to "peterz",
 * which is noise at best and a manufactured false positive at worst. Dropping
 * the suffix gives a clean "peter" alongside it. Checking more keys can only
 * ever add a rejection, never remove one, so this strictly improves the catch
 * rate without widening what gets through.
 */
export function normalise(input: string): {
  stripped: string;
  collapsed: string;
  suffixed: string;
} {
  const fold = (raw: string) => {
    let s = raw.toLowerCase();
    s = s.normalize('NFKD').replace(/\p{M}/gu, '');     // strip accents
    s = s.replace(/vv/g, 'w').replace(/ph/g, 'f');
    s = [...s].map((ch) => LEET[ch] ?? ch).join('');
    return s.replace(/[^a-z]/g, '');
  };

  const stripped = fold(input);
  const collapsed = stripped.replace(/(.)\1{2,}/g, '$1');
  const suffixed = fold(input.replace(/[0-9_]+$/, ''));
  return { stripped, collapsed, suffixed };
}

// The engine carries the wordlist, with confusable and leetspeak transformers
// of its own, and the word-boundary assertions that keep "Cassandra" and
// "Bassmaster" out of the soft-list crossfire. Hand-maintaining a slur list is
// work you get wrong forever - do not replace this with a substring scan.
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// Whole-key matches only. These are names nobody should hold, not profanity -
// a substring rule here would reject "administrator_pete".
const RESERVED = new Set([
  'admin', 'administrator', 'mod', 'moderator', 'support', 'staff', 'system',
  'official', 'root', 'null', 'undefined', 'anonymous', 'guest', 'me', 'you',
  'dailyjamm', 'daily_jamm', 'jamm',
  'themedle', 'chainlink', 'blackjackdle', 'spelldle', 'roulettedle', 'holdle',
  'liarsdice', 'netzero', 'shutthebox', 'yachtdle',
]);

export type Verdict = { ok: true } | { ok: false; reason: string };

export function moderate(username: string): Verdict {
  if (!SHAPE.test(username)) {
    // This is where @$$ dies - as invalid characters, before any wordlist runs.
    return { ok: false, reason: 'shape' };
  }

  const { stripped, collapsed, suffixed } = normalise(username);
  if (stripped.length < 2) return { ok: false, reason: 'shape' };

  if (RESERVED.has(stripped) || RESERVED.has(username.toLowerCase())) {
    return { ok: false, reason: 'reserved' };
  }

  for (const key of [stripped, collapsed, suffixed]) {
    if (key.length >= 2 && matcher.hasMatch(key)) {
      return { ok: false, reason: 'blocked' };
    }
  }

  return { ok: true };
}
