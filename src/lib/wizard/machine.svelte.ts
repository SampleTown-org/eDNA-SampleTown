/**
 * Shared wizard traversal engine (docs/dev/offline-pwa.md, #4/#5).
 *
 * Holds ONLY the navigation state machine — phase, cursor, the skipped FIFO,
 * and the back-history. Answer storage stays in each page/component because the
 * sample flow and the site sub-wizard keep different answer shapes. Both drive
 * their UI through this one class so the Skip↔Next, skip-loop, and review
 * behaviour can never drift between them.
 *
 * Runes work in `.svelte.ts` modules, so the class fields are reactive when a
 * component reads `machine.current` / `machine.phase` in its template.
 */
import type { WizardQuestion } from './queue';

export type WizardPhase = 'main' | 'skips' | 'review';

interface Snapshot {
	phase: WizardPhase;
	mainIdx: number;
	skipIdx: number;
}

export class WizardMachine {
	phase = $state<WizardPhase>('main');
	mainIdx = $state(0);
	skipped = $state<string[]>([]);
	skipList = $state<string[]>([]);
	skipIdx = $state(0);
	history = $state<Snapshot[]>([]);

	/** Queue is owned by the component (it's a `$derived` of checklist/picklists);
	 *  the machine reads it through this thunk so it always sees the latest. */
	#getQueue: () => WizardQuestion[];

	constructor(getQueue: () => WizardQuestion[]) {
		this.#getQueue = getQueue;
	}

	get queue(): WizardQuestion[] {
		return this.#getQueue();
	}

	get current(): WizardQuestion | null {
		if (this.phase === 'main') return this.queue[this.mainIdx] ?? null;
		if (this.phase === 'skips') {
			const key = this.skipList[this.skipIdx];
			return this.queue.find((q) => q.key === key) ?? null;
		}
		return null;
	}

	#snapshot(): Snapshot {
		return { phase: this.phase, mainIdx: this.mainIdx, skipIdx: this.skipIdx };
	}

	#enterSecondPassOrReview() {
		if (this.skipped.length > 0) {
			this.skipList = [...this.skipped];
			this.skipped = [];
			this.skipIdx = 0;
			this.phase = 'skips';
		} else {
			this.phase = 'review';
		}
	}

	/**
	 * Advance from the current question. `commit` true = Next, false = Skip.
	 * `onSecondPassSkip` fires when a question is skipped during the second
	 * pass, so the component can blank any partial value (loop terminator —
	 * second-pass skips are NOT requeued).
	 */
	advance(commit: boolean, onSecondPassSkip?: (q: WizardQuestion) => void) {
		const cur = this.current;
		if (!cur) return;
		this.history = [...this.history, this.#snapshot()];
		if (this.phase === 'main') {
			if (!commit) this.skipped = [...this.skipped, cur.key];
			if (this.mainIdx + 1 >= this.queue.length) {
				this.mainIdx = this.queue.length;
				this.#enterSecondPassOrReview();
			} else {
				this.mainIdx += 1;
			}
		} else if (this.phase === 'skips') {
			if (!commit) onSecondPassSkip?.(cur);
			if (this.skipIdx + 1 >= this.skipList.length) {
				this.phase = 'review';
			} else {
				this.skipIdx += 1;
			}
		}
	}

	get canGoBack(): boolean {
		return this.history.length > 0;
	}

	back() {
		const prev = this.history[this.history.length - 1];
		if (!prev) return;
		this.history = this.history.slice(0, -1);
		this.phase = prev.phase;
		this.mainIdx = prev.mainIdx;
		this.skipIdx = prev.skipIdx;
	}

	/** Jump to a queue index in the main phase (Edit-from-review / Complete).
	 *  Pushes history so Back still works, and clears the skip queue so a jump
	 *  doesn't later re-trigger a stale second pass. */
	jumpToIndex(idx: number, pushHistory = true) {
		if (idx < 0) return;
		if (pushHistory) this.history = [...this.history, this.#snapshot()];
		this.phase = 'main';
		this.mainIdx = idx;
		this.skipped = [];
		this.skipList = [];
		this.skipIdx = 0;
	}

	toReview() {
		this.phase = 'review';
	}

	/** Restart traversal at `startIdx`, clearing all cursor/skip/history state. */
	reset(startIdx = 0) {
		this.phase = 'main';
		this.mainIdx = startIdx;
		this.skipped = [];
		this.skipList = [];
		this.skipIdx = 0;
		this.history = [];
	}
}
