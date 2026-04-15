<script lang="ts">
	import { onMount } from 'svelte';
	// Bundle Leaflet's stylesheet into the app via Vite. Loading it from a
	// CDN (unpkg) failed under our CSP — `style-src 'self'` blocks foreign
	// stylesheets, and unpkg returns "referer is required" when our
	// Referrer-Policy: same-origin strips the Referer on cross-origin
	// requests. Self-hosting also makes the map work offline once the
	// service worker caches it.
	import 'leaflet/dist/leaflet.css';

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

	let { latitude = $bindable(), longitude = $bindable(), onchange, height = '300px', readonly = false, markers = [], onboxselect }: Props = $props();

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

<div bind:this={mapEl} class="rounded-lg border border-slate-700 z-0" style="height: {height}; background: #1e293b;"></div>
