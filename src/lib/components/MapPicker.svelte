<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		latitude: number | null;
		longitude: number | null;
		onchange?: (lat: number, lng: number) => void;
		height?: string;
		readonly?: boolean;
		markers?: Array<{ lat: number; lng: number; label: string; href?: string }>;
	}

	let { latitude = $bindable(), longitude = $bindable(), onchange, height = '300px', readonly = false, markers = [] }: Props = $props();

	let mapEl: HTMLDivElement;
	let map: any;
	let marker: any;
	let L: any;

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

		// Multi-marker mode (dashboard)
		if (markers.length > 0) {
			const group: any[] = [];
			for (const m of markers) {
				const mk = L.marker([m.lat, m.lng]).addTo(map);
				if (m.href) {
					mk.bindPopup(`<a href="${m.href}" style="font-weight:600">${m.label}</a>`);
				} else {
					mk.bindPopup(m.label);
				}
				group.push(mk);
			}
			if (group.length > 1) {
				const bounds = L.featureGroup(group).getBounds();
				map.fitBounds(bounds, { padding: [40, 40] });
			}
		}

		return () => { map.remove(); };
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
