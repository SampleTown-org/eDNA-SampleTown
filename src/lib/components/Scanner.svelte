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

	async function start() {
		if (!containerEl) return;
		errorMsg = null;
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
			const msg = err instanceof Error ? err.message : String(err);
			errorMsg = `Camera: ${msg}`;
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

	/** Extract a UUID (32 hex chars) from a scanned payload. Accepts either a
	 *  bare UUID or a URL containing `/id/<uuid>`. The URL's host is ignored
	 *  — codes printed against one origin (staging, old hostname, even the
	 *  dev LAN IP) still route through whatever origin the scanner is open
	 *  on. Anything else → null. */
	function extractUuid(text: string): string | null {
		const trimmed = text.trim();
		const m = trimmed.match(/\/id\/([0-9a-f]{32})/i);
		if (m) return m[1].toLowerCase();
		if (/^[0-9a-f]{32}$/i.test(trimmed)) return trimmed.toLowerCase();
		return null;
	}

	async function handleDecoded(text: string) {
		if (status !== 'running') return;
		status = 'decoded';
		decoded = text;
		await stop();
		const uuid = extractUuid(text);
		if (!uuid) {
			errorMsg = `Scanned text doesn't look like a SampleTown code.`;
			return;
		}
		// Route via /id/<uuid> so the server-side lookup + redirect handles
		// the known/unknown split in one place.
		onclose();
		goto(`/id/${uuid}`);
	}

	$effect(() => {
		if (open) {
			// next tick — container must exist first
			queueMicrotask(start);
		} else {
			stop();
			status = 'idle';
			decoded = null;
			errorMsg = null;
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
					Point the camera at a QR code.
				{:else if status === 'decoded'}
					{#if decoded}Scanned: <span class="font-mono text-xs text-slate-500">{decoded.slice(0, 40)}{decoded.length > 40 ? '…' : ''}</span>{/if}
				{/if}
			</div>

			{#if errorMsg}
				<div class="px-3 py-2 rounded border border-red-900 bg-red-950/40 text-sm text-red-300">
					{errorMsg}
				</div>
			{/if}
		</div>
	</div>
{/if}
