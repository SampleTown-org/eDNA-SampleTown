<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open = $bindable(), onclose }: Props = $props();

	let containerEl: HTMLDivElement | undefined;
	let scanner: any = null;
	let errorMsg = $state<string | null>(null);
	let status = $state<'idle' | 'starting' | 'running' | 'decoded'>('idle');
	let decoded = $state<string | null>(null);
	/** Camera problems are shown as a muted note, not a red error — a
	 *  handheld scanner still works when there's no camera (e.g. desktops). */
	let cameraNote = $state<string | null>(null);

	// ---- Handheld keyboard-wedge scanner ----
	// A USB/Bluetooth barcode scanner acts as a keyboard: it "types" the
	// decoded text (the QR's full URL) plus an Enter. We only listen for that
	// while this modal is open (see the $effect below) — never app-wide — so
	// it can't hijack typing elsewhere. Accumulate the fast keystroke burst,
	// then route on Enter (or after a short idle, for scanners with no Enter
	// suffix). Inter-keystroke timing isn't needed to disambiguate human
	// typing because the modal has no input fields.
	let wedgeBuf = '';
	let wedgeTimer: ReturnType<typeof setTimeout> | undefined;

	async function start() {
		if (!containerEl) return;
		errorMsg = null;
		cameraNote = null;
		status = 'starting';
		try {
			const mod = await import('html5-qrcode');
			const { Html5Qrcode } = mod;
			scanner = new Html5Qrcode(containerEl.id);
			const config = { fps: 10, qrbox: { width: 240, height: 240 } };
			const onDecode = (text: string) => handleDecoded(text);
			const onError = () => {}; // ignore per-frame "not found" noise
			// Prefer the rear camera (phones); on desktops that typically
			// don't have one, fall back to whatever camera the device exposes.
			try {
				await scanner.start({ facingMode: 'environment' }, config, onDecode, onError);
			} catch {
				const cameras = await Html5Qrcode.getCameras();
				if (!cameras || cameras.length === 0) {
					throw new Error('No camera available');
				}
				await scanner.start(cameras[0].id, config, onDecode, onError);
			}
			status = 'running';
		} catch (err) {
			// No camera (common on a bench desktop) is not an error — the
			// handheld wedge listener is still armed and ready.
			const msg = err instanceof Error ? err.message : String(err);
			cameraNote = `Camera unavailable (${msg}). Use a handheld scanner.`;
			status = 'idle';
		}
	}

	async function stop() {
		if (!scanner) return;
		try {
			if (scanner.getState && scanner.getState() === 2 /* SCANNING */) {
				await scanner.stop();
			}
			await scanner.clear();
		} catch { /* best-effort */ }
		scanner = null;
	}

	/** Extract the SampleTown route from a scanned payload. Accepts a full
	 *  URL, a bare `/id/<uuid>` path, or a bare UUID. Preserves the query
	 *  string (so pre-typed labels' `?t=<type>` hint still routes through
	 *  to auto-claim). The URL's host is ignored so codes printed against
	 *  a different origin still work. */
	function extractTarget(text: string): string | null {
		const trimmed = text.trim();
		try {
			const url = new URL(trimmed);
			const m = url.pathname.match(/\/id\/([0-9a-f]{32})/i);
			if (m) return `/id/${m[1].toLowerCase()}${url.search}`;
		} catch { /* not a parseable URL — fall through */ }
		const m = trimmed.match(/\/id\/([0-9a-f]{32})(\?[^\s]*)?/i);
		if (m) return `/id/${m[1].toLowerCase()}${m[2] ?? ''}`;
		if (/^[0-9a-f]{32}$/i.test(trimmed)) return `/id/${trimmed.toLowerCase()}`;
		return null;
	}

	/** Shared by the camera and the handheld wedge: resolve a scanned payload
	 *  to a /id/<uuid>[?t=<type>] route and navigate. The server-side lookup
	 *  handles the known/unknown split (and type-hint auto-claim) in one place. */
	async function routeScan(text: string) {
		const s = text.trim();
		if (!s) return;
		const target = extractTarget(s);
		if (!target) {
			errorMsg = `Scanned text doesn't look like a SampleTown code.`;
			status = 'idle';
			return;
		}
		status = 'decoded';
		decoded = s;
		await stop();
		onclose();
		goto(target);
	}

	function handleDecoded(text: string) {
		if (status !== 'running') return; // camera only fires while live
		routeScan(text);
	}

	function resetWedge() {
		wedgeBuf = '';
		clearTimeout(wedgeTimer);
	}

	/** No Enter suffix? Flush after a brief idle — but only if the buffer
	 *  actually looks like a code, so stray keystrokes are discarded quietly. */
	function flushWedge() {
		const s = wedgeBuf;
		wedgeBuf = '';
		if (s && extractTarget(s)) routeScan(s);
	}

	function handleWedgeKey(e: KeyboardEvent) {
		if (!open || status === 'decoded') return;
		// Defensive: never swallow input meant for a real field (the modal has
		// none, but a future one shouldn't break).
		const t = e.target as HTMLElement | null;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

		if (e.key === 'Enter') {
			clearTimeout(wedgeTimer);
			if (wedgeBuf) {
				e.preventDefault();
				const s = wedgeBuf;
				wedgeBuf = '';
				routeScan(s); // explicit terminator → surface an error if unrecognized
			}
			return;
		}
		if (e.key.length === 1) {
			wedgeBuf += e.key;
			if (wedgeBuf.length > 256) wedgeBuf = wedgeBuf.slice(-256); // runaway guard
			clearTimeout(wedgeTimer);
			wedgeTimer = setTimeout(flushWedge, 150);
		}
	}

	$effect(() => {
		if (open) {
			// next tick — container must exist first
			queueMicrotask(start);
			// Arm the handheld-scanner listener ONLY while the modal is open.
			// Capture phase so we see the keystroke burst first.
			window.addEventListener('keydown', handleWedgeKey, true);
			return () => {
				window.removeEventListener('keydown', handleWedgeKey, true);
				resetWedge();
				stop();
				status = 'idle';
				decoded = null;
				errorMsg = null;
				cameraNote = null;
			};
		}
	});

	onDestroy(() => {
		stop();
	});

	function close() {
		onclose();
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-[100] bg-slate-950/95 flex items-center justify-center p-4"
		role="dialog"
		aria-modal="true"
		aria-label="QR scanner"
	>
		<div class="w-full max-w-md space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold text-white">Scan QR code</h2>
				<button
					type="button"
					onclick={close}
					class="text-slate-400 hover:text-white text-2xl leading-none"
					title="Close"
				>×</button>
			</div>

			<div
				bind:this={containerEl}
				id="qr-scanner-container"
				class="rounded-lg overflow-hidden bg-slate-900 aspect-square w-full border border-slate-800"
			></div>

			<div class="text-sm text-slate-400 min-h-[1.5em]">
				{#if status === 'starting'}
					Starting camera…
				{:else if status === 'running'}
					Point the camera at a QR code — or scan one with a handheld scanner.
				{:else if status === 'decoded'}
					{#if decoded}Scanned: <span class="font-mono text-xs text-slate-500">{decoded.slice(0, 40)}{decoded.length > 40 ? '…' : ''}</span>{/if}
				{:else}
					Scan a label with a handheld scanner.
				{/if}
			</div>

			{#if cameraNote}
				<div class="px-3 py-2 rounded border border-slate-700 bg-slate-900 text-xs text-slate-400">
					{cameraNote}
				</div>
			{/if}

			<!-- The handheld wedge listener is armed for as long as this modal is open. -->
			<div class="flex items-center gap-1.5 text-xs text-emerald-400/90">
				<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
				Handheld scanner ready
			</div>

			{#if errorMsg}
				<div class="px-3 py-2 rounded border border-red-900 bg-red-950/40 text-sm text-red-300">
					{errorMsg}
				</div>
			{/if}
		</div>
	</div>
{/if}
