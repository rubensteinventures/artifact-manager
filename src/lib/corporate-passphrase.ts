/**
 * Corporate-friendly tokens for visitor passphrases (three hyphen-separated words).
 * Each entry is a single ASCII word (letters only); combined format is validated in presentation-password.
 */

const WORDS: readonly string[] = [
	'acumen',
	'alliance',
	'apex',
	'blueprint',
	'bridge',
	'catalyst',
	'clarity',
	'compass',
	'crest',
	'delta',
	'drive',
	'echo',
	'elevate',
	'ember',
	'enable',
	'endeavor',
	'essence',
	'excel',
	'focus',
	'forge',
	'forward',
	'foundation',
	'framework',
	'fusion',
	'gateway',
	'grove',
	'harbor',
	'harvest',
	'horizon',
	'insight',
	'integrate',
	'junction',
	'keystone',
	'latitude',
	'ledger',
	'legacy',
	'lumen',
	'matrix',
	'meridian',
	'momentum',
	'monument',
	'nexus',
	'nomad',
	'nova',
	'oasis',
	'oracle',
	'origin',
	'outlook',
	'pinnacle',
	'pivot',
	'prism',
	'prospect',
	'pulse',
	'quantum',
	'quest',
	'radius',
	'ridge',
	'scaffold',
	'sentinel',
	'signal',
	'solstice',
	'spectrum',
	'spire',
	'summit',
	'synergy',
	'tableau',
	'tangent',
	'tempo',
	'torch',
	'traverse',
	'triad',
	'vantage',
	'vector',
	'vertex',
	'vista',
	'voyage',
	'waypoint',
	'wavelength',
	'zenith',
];

function secureIndex(max: number): number {
	const buf = new Uint32Array(1);
	crypto.getRandomValues(buf);
	// Rejection sampling for uniform distribution when max is not power of 2
	const limit = Math.floor(0x1_0000_0000 / max) * max;
	let x = buf[0];
	while (x >= limit) {
		crypto.getRandomValues(buf);
		x = buf[0];
	}
	return x % max;
}

/** Three distinct lowercase words separated by hyphens (visitor-password policy accepts this shape). */
export function generateCorporatePassphrase(): string {
	const n = WORDS.length;
	if (n < 3) {
		throw new Error('corporate passphrase word list too small');
	}
	const picks = new Set<number>();
	while (picks.size < 3) {
		picks.add(secureIndex(n));
	}
	const [i, j, k] = [...picks];
	return `${WORDS[i]}-${WORDS[j]}-${WORDS[k]}`;
}
