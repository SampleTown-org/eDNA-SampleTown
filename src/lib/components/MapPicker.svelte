<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		latitude: number | null;
		longitude: number | null;
		onchange?: (lat: number, lng: number) => void;
		height?: string;
		readonly?: boolean;
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
		}>;
		/** Fired when a marker is clicked. Used by the sites + samples lists to
		 *  toggle the row's selection (which feeds the cart) via the same path
		 *  as clicking the checkbox in the DataTable. */
		onmarkerclick?: (id: string) => void;
	}

	let { latitude = $bindable(), longitude = $bindable(), onchange, height = '300px', readonly = false, markers = [], onmarkerclick }: Props = $props();

	let mapEl: HTMLDivElement;
	let map: any;
	let marker: any;
	let markerLayer: any;
	let L: any;

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

		// Fix default icon paths (Leaflet asset issue with bundlers)
		delete (L.Icon.Default.prototype as any)._getIconUrl;
		L.Icon.Default.mergeOptions({
			iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
			iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
			shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
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
		}

		return () => { map.remove(); };
	});

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
			if (m.color) {
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
			// Clicking a pin: tell the parent so it can toggle the row's
			// selection and keep the cart in sync with whatever the user is
			// clicking on the map. We use `click` — the default popup-open is
			// preserved by Leaflet; the selection side-effect happens alongside.
			if (onmarkerclick && m.id) {
				const id = m.id;
				mk.on('click', () => onmarkerclick!(id));
			}
			layer.addLayer(mk);
		}
		layer.addTo(map);
		markerLayer = layer;

		if (markers.length > 1) {
			map.fitBounds(layer.getBounds(), { padding: [40, 40] });
		}
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

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<div bind:this={mapEl} class="rounded-lg border border-slate-700 z-0" style="height: {height}; background: #1e293b;"></div>
