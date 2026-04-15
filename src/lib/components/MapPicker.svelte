<script lang="ts">
	import { onMount } from 'svelte';
	// Bundle Leaflet's stylesheet into the app via Vite. Loading it from a
	// CDN (unpkg) failed under our CSP — `style-src 'self'` blocks foreign
	// stylesheets, and unpkg returns "referer is required" when our
	// Referrer-Policy: same-origin strips the Referer on cross-origin
	// requests. Self-hosting also makes the map work offline once the
	// service worker caches it.
	import 'leaflet/dist/leaflet.css';

	type NativeLandLayer = 'territories' | 'languages' | 'treaties';
	const NATIVE_LAND_LAYERS: NativeLandLayer[] = ['territories', 'languages', 'treaties'];
	const NATIVE_LAND_LABELS: Record<NativeLandLayer, string> = {
		territories: 'Territories',
		languages: 'Languages',
		treaties: 'Treaties'
	};

	interface Props {
		latitude: number | null;
		longitude: number | null;
		onchange?: (lat: number, lng: number) => void;
		height?: string;
		readonly?: boolean;
		/** Show the Native Land Digital overlay toggles (territories /
		 *  languages / treaties). Defaults to true; pass false to hide on maps
		 *  where the toggle would clutter (e.g. small previews). */
		showNativeLand?: boolean;
		/**
		 * Multi-marker mode. Each marker can optionally specify a `color` (any
		 * CSS color string, typically `hsl(...)`) — when set, the marker is
		 * rendered as a colored circle instead of the default Leaflet pin.
		 * `id` + `colorLabel` / `colorValue` are used by /sites + /samples to
		 * surface the colored-by column in the tooltip and let the parent
		 * sync selection state when a pin is clicked.
		 */
		markers?: Array<{
			id?: string;
			lat: number;
			lng: number;
			label: string;
			href?: string;
			color?: string;
			colorLabel?: string;
			colorValue?: string;
			/** Color-by is active but this row's value for that column is null/
			 *  empty — render as a hollow dashed circle so missing data is
			 *  visually distinct from a colored value. */
			nullValue?: boolean;
		}>;
		/** Fired when the user finishes a shift-drag rectangle — called once
		 *  with the IDs of every marker whose lat/lng fell inside the box, so
		 *  the parent can batch-add them to selection / the cart. Single-pin
		 *  clicks still just open the popup. */
		onboxselect?: (ids: string[]) => void;
	}

	let { latitude = $bindable(), longitude = $bindable(), onchange, height = '300px', readonly = false, markers = [], onboxselect, showNativeLand = true }: Props = $props();

	let mapEl: HTMLDivElement;
	let map: any;
	let marker: any;
	let markerLayer: any;
	let L: any;

	// Native Land Digital overlay state. Each enabled layer fetches its
	// features for the current map centre on toggle and on every map
	// move (debounced). Unavailable upstream → silently empty layer + a
	// one-line note in the toggle panel.
	let nlEnabled = $state<Record<NativeLandLayer, boolean>>({
		territories: false,
		languages: false,
		treaties: false
	});
	let nlLayers: Partial<Record<NativeLandLayer, any>> = {};
	let nlLoading = $state<Record<NativeLandLayer, boolean>>({
		territories: false,
		languages: false,
		treaties: false
	});
	let nlUnavailable = $state<string | null>(null);
	let nlFetchTimer: ReturnType<typeof setTimeout> | null = null;

	/** Escape operator-entered strings before injecting into popup HTML — site
	 *  names, column values, etc. Defense-in-depth: keeps any stray angle
	 *  brackets or quotes from re-entering the DOM as live markup. */
	function escapeHtml(s: string): string {
		return String(s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	onMount(async () => {
		L = await import('leaflet');

		// Fix default icon paths (Leaflet asset issue with bundlers).
		// Self-hosted from /static/leaflet/ so the CSP doesn't have to
		// allow unpkg.com and the app keeps working offline.
		delete (L.Icon.Default.prototype as any)._getIconUrl;
		L.Icon.Default.mergeOptions({
			iconRetinaUrl: '/leaflet/marker-icon-2x.png',
			iconUrl: '/leaflet/marker-icon.png',
			shadowUrl: '/leaflet/marker-shadow.png'
		});

		const center: [number, number] = [
			latitude ?? markers[0]?.lat ?? 48.5,
			longitude ?? markers[0]?.lng ?? -123.5
		];
		const zoom = (latitude != null || markers.length > 0) ? 10 : 3;

		map = L.map(mapEl).setView(center, zoom);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap',
			maxZoom: 19
		}).addTo(map);

		// Single marker mode (picker)
		if (!readonly && markers.length === 0) {
			if (latitude != null && longitude != null) {
				marker = L.marker([latitude, longitude]).addTo(map);
			}
			map.on('click', (e: any) => {
				const { lat, lng } = e.latlng;
				latitude = Math.round(lat * 10000) / 10000;
				longitude = Math.round(lng * 10000) / 10000;
				if (marker) {
					marker.setLatLng([latitude, longitude]);
				} else {
					marker = L.marker([latitude, longitude]).addTo(map);
				}
				onchange?.(latitude, longitude);
			});
		}

		// Multi-marker mode (dashboard / sites list)
		if (markers.length > 0) {
			renderMarkers();
			if (onboxselect) setupBoxSelect();
		}

		// Re-fetch any active Native Land overlay when the operator pans/zooms
		// to a new area. Debounced so a single drag doesn't trigger dozens of
		// requests.
		if (showNativeLand) {
			map.on('moveend', () => {
				if (nlFetchTimer) clearTimeout(nlFetchTimer);
				nlFetchTimer = setTimeout(() => {
					for (const layer of NATIVE_LAND_LAYERS) {
						if (nlEnabled[layer]) fetchNativeLand(layer);
					}
				}, 500);
			});
		}

		return () => { map.remove(); };
	});

	async function fetchNativeLand(layer: NativeLandLayer) {
		if (!map || !L) return;
		const center = map.getCenter();
		nlLoading[layer] = true;
		try {
			const res = await fetch(`/api/native-land?layer=${layer}&lat=${center.lat}&lng=${center.lng}`);
			if (!res.ok) {
				nlUnavailable = `Layer fetch failed (${res.status})`;
				return;
			}
			const body = await res.json();
			if (body.unavailable) {
				nlUnavailable = body.unavailable;
				return;
			}
			nlUnavailable = null;
			// Replace the existing overlay for this layer.
			if (nlLayers[layer]) {
				nlLayers[layer].remove();
				nlLayers[layer] = undefined;
			}
			if (!body.features || body.features.length === 0) return;
			const geo = L.geoJSON(body, {
				style: (feature: any) => ({
					color: feature?.properties?.color ?? '#888',
					weight: 2,
					opacity: 0.85,
					fillColor: feature?.properties?.color ?? '#888',
					fillOpacity: 0.18
				}),
				onEachFeature: (feature: any, lyr: any) => {
					const p = feature.properties ?? {};
					const link = p.description
						? `<a href="${escapeHtml(p.description)}" target="_blank" rel="noopener noreferrer" style="color:#0ea5e9">native-land.ca →</a>`
						: '';
					lyr.bindPopup(
						`<div style="font-weight:600">${escapeHtml(p.name || 'Unknown')}</div>` +
						`<div style="margin-top:2px;font-size:11px;color:#64748b">${escapeHtml(NATIVE_LAND_LABELS[layer])}</div>` +
						(link ? `<div style="margin-top:4px;font-size:11px">${link}</div>` : '')
					);
				}
			});
			geo.addTo(map);
			nlLayers[layer] = geo;
		} catch (err) {
			console.error('native-land fetch failed', err);
			nlUnavailable = 'fetch failed';
		} finally {
			nlLoading[layer] = false;
		}
	}

	function toggleNativeLand(layer: NativeLandLayer) {
		nlEnabled[layer] = !nlEnabled[layer];
		if (nlEnabled[layer]) {
			fetchNativeLand(layer);
		} else if (nlLayers[layer]) {
			nlLayers[layer].remove();
			nlLayers[layer] = undefined;
		}
	}

	/**
	 * Re-render the marker layer. Pulled into its own function so the reactive
	 * effect below can re-run it when the parent passes a new `markers` array
	 * (e.g. when the operator changes the color-by column on the sites list).
	 */
	function renderMarkers() {
		if (!map || !L) return;
		if (markerLayer) {
			markerLayer.remove();
			markerLayer = null;
		}
		if (markers.length === 0) return;

		const layer = L.featureGroup();
		for (const m of markers) {
			let mk: any;
			if (m.nullValue) {
				// Color-by active but this row is null — hollow dashed circle so
				// a missing value reads as visually distinct from the colored
				// values on the same map.
				mk = L.circleMarker([m.lat, m.lng], {
					radius: 7,
					color: '#94a3b8',
					weight: 2,
					fillOpacity: 0,
					dashArray: '3,3'
				});
			} else if (m.color) {
				// Colored circle — matches the DataTable color-by tint when the
				// row uses an HSL string. White outline keeps it visible against
				// dark and light tile patches.
				mk = L.circleMarker([m.lat, m.lng], {
					radius: 7,
					color: '#ffffff',
					weight: 1.5,
					fillColor: m.color,
					fillOpacity: 0.85
				});
			} else {
				mk = L.marker([m.lat, m.lng]);
			}
			// Popup shows the entity label (linked to its detail page if href is
			// provided) plus the colored-by column value when the operator has
			// a color-by active on the sister DataTable — so hovering a pin
			// reveals *why* it's that colour.
			const head = m.href
				? `<a href="${escapeHtml(m.href)}" style="font-weight:600">${escapeHtml(m.label)}</a>`
				: escapeHtml(m.label);
			const colorLine =
				m.colorLabel && m.colorValue
					? `<div style="margin-top:4px;font-size:11px;color:#94a3b8"><span style="color:#64748b">${escapeHtml(m.colorLabel)}:</span> ${escapeHtml(m.colorValue)}</div>`
					: '';
			mk.bindPopup(`${head}${colorLine}`);
			layer.addLayer(mk);
		}
		layer.addTo(map);
		markerLayer = layer;

		if (markers.length > 1) {
			map.fitBounds(layer.getBounds(), { padding: [40, 40] });
		}
	}

	/**
	 * Shift-drag box-select. Replaces Leaflet's built-in box-zoom so the same
	 * shortcut the operator already expects (shift + drag = "select a region")
	 * is repurposed to batch-select markers rather than zoom. On mouseup the
	 * rectangle's bounds are checked against every marker; IDs of those
	 * inside are handed to the parent via onboxselect for it to merge into
	 * selectedIds / the cart.
	 */
	function setupBoxSelect() {
		if (!map || !L || !onboxselect) return;
		map.boxZoom.disable();
		let startLatLng: any = null;
		let rect: any = null;
		map.on('mousedown', (e: any) => {
			if (!e.originalEvent.shiftKey) return;
			startLatLng = e.latlng;
			map.dragging.disable();
		});
		map.on('mousemove', (e: any) => {
			if (!startLatLng) return;
			const b = L.latLngBounds(startLatLng, e.latlng);
			if (rect) rect.setBounds(b);
			else
				rect = L.rectangle(b, {
					color: '#0ea5e9',
					weight: 2,
					fillOpacity: 0.08,
					dashArray: '5,5'
				}).addTo(map);
		});
		map.on('mouseup', () => {
			if (!startLatLng) return;
			const bounds = rect?.getBounds();
			if (rect) { rect.remove(); rect = null; }
			startLatLng = null;
			map.dragging.enable();
			// Always fire onboxselect, even with no pins inside — drawing an
			// empty box is the user's "clear selection" gesture under the
			// replace-on-drag model.
			if (bounds && onboxselect) {
				const ids = markers
					.filter((m) => m.id && bounds.contains([m.lat, m.lng]))
					.map((m) => m.id as string);
				onboxselect(ids);
			}
		});
	}

	// Re-render markers when the parent passes a new array (color change, etc.)
	$effect(() => {
		// touch markers so the effect re-runs on changes
		markers;
		renderMarkers();
	});

	// Update marker when lat/lng props change externally
	$effect(() => {
		if (map && L && latitude != null && longitude != null && !readonly) {
			if (marker) {
				marker.setLatLng([latitude, longitude]);
			} else {
				marker = L.marker([latitude, longitude]).addTo(map);
			}
			map.setView([latitude, longitude], Math.max(map.getZoom(), 10));
		}
	});
</script>

<div class="relative">
	<div bind:this={mapEl} class="rounded-lg border border-slate-700 z-0" style="height: {height}; background: #1e293b;"></div>
	{#if showNativeLand}
		<!-- Native Land Digital overlay toggles. Sits absolutely over the
		     map's top-right; pointer-events allowed only on the panel itself
		     so the rest of the map stays interactive. Acknowledgement linked
		     per Native Land's attribution guidelines. -->
		<div class="absolute top-2 right-2 z-[400] bg-slate-900/95 border border-slate-700 rounded-lg p-2 text-xs text-slate-300 shadow-lg backdrop-blur-sm">
			<div class="font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
				<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
				Native Land
			</div>
			<div class="space-y-0.5">
				{#each NATIVE_LAND_LAYERS as layer}
					<label class="flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors">
						<input
							type="checkbox"
							checked={nlEnabled[layer]}
							onchange={() => toggleNativeLand(layer)}
							class="accent-ocean-500"
						/>
						<span>{NATIVE_LAND_LABELS[layer]}</span>
						{#if nlLoading[layer]}<span class="text-slate-500">…</span>{/if}
					</label>
				{/each}
			</div>
			{#if nlUnavailable}
				<p class="mt-1.5 text-[10px] text-slate-500 max-w-[180px]">Overlay unavailable: {nlUnavailable}</p>
			{:else if Object.values(nlEnabled).some((v) => v)}
				<p class="mt-1.5 text-[10px] text-slate-500">
					Data:
					<a href="https://native-land.ca" target="_blank" rel="noopener noreferrer" class="text-ocean-400 hover:text-ocean-300">native-land.ca</a>
				</p>
			{/if}
		</div>
	{/if}
</div>
