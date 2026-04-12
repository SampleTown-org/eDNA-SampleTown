/**
 * Persistent cross-page selection cart. Lets operators browse entity list
 * pages with full context (sorting, filtering, color-by), select items,
 * then navigate to a "new" form where the cart's items auto-populate the
 * source picker.
 *
 * State is Svelte 5 runes ($state) backed by localStorage for persistence
 * across navigations. The cart is client-only — no server state, no DB rows.
 *
 * Entity-to-form mapping:
 *   sample      → extracts/new
 *   extract     → pcr/new, libraries/new (source=extract)
 *   pcr         → libraries/new (source=pcr)
 *   pcr_plate   → libraries/new (source=pcr_plate)
 *   library     → runs/new (source=individual)
 *   library_plate → runs/new (source=plate)
 *   run         → analysis/new
 */

export type CartEntityType =
	| 'site'
	| 'sample'
	| 'extract'
	| 'pcr'
	| 'pcr_plate'
	| 'library'
	| 'library_plate'
	| 'run'
	| 'analysis';

export interface CartItem {
	type: CartEntityType;
	id: string;
	label: string;
	sublabel?: string;
}

const STORAGE_KEY = 'sampletown-cart';

function loadFromStorage(): CartItem[] {
	if (typeof window === 'undefined') return [];
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
	} catch {
		return [];
	}
}

function persist(items: CartItem[]) {
	if (typeof window === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

let items = $state<CartItem[]>(loadFromStorage());

/** Compound key for deduplication. */
function key(type: string, id: string): string {
	return `${type}:${id}`;
}

export const cart = {
	get items() {
		return items;
	},

	get count() {
		return items.length;
	},

	has(type: CartEntityType, id: string): boolean {
		const k = key(type, id);
		return items.some((i) => key(i.type, i.id) === k);
	},

	add(item: CartItem) {
		if (cart.has(item.type, item.id)) return;
		items = [...items, item];
		persist(items);
	},

	addMany(newItems: CartItem[]) {
		const existing = new Set(items.map((i) => key(i.type, i.id)));
		const unique = newItems.filter((i) => !existing.has(key(i.type, i.id)));
		if (unique.length === 0) return;
		items = [...items, ...unique];
		persist(items);
	},

	remove(type: CartEntityType, id: string) {
		const k = key(type, id);
		items = items.filter((i) => key(i.type, i.id) !== k);
		persist(items);
	},

	getByType(type: CartEntityType): CartItem[] {
		return items.filter((i) => i.type === type);
	},

	clearType(type: CartEntityType) {
		items = items.filter((i) => i.type !== type);
		persist(items);
	},

	clearAll() {
		items = [];
		persist(items);
	}
};
