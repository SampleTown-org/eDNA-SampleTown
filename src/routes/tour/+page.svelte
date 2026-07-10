<script lang="ts">
	// A guided, hierarchical tour of SampleTown. Public (no session needed) so a
	// prospective user can read how the whole thing fits together before signing
	// in. Content is data-driven where it's repetitive (the 8 workflow stages)
	// and hand-written prose where it isn't (the cross-cutting sections).

	// --- The sample lifecycle: the spine of the whole app -----------------
	// Colours mirror the ROYGBIV activity calendar on the dashboard so the
	// stages a user already recognises there line up with the story here.
	type Stage = {
		id: string;
		num: number;
		name: string;
		route: string;
		tagline: string;
		what: string;
		fields: string;
		links: string;
		actions: string;
		accent: { dot: string; badge: string; text: string };
	};

	const stages: Stage[] = [
		{
			id: 'projects',
			num: 1,
			name: 'Projects',
			route: '/projects',
			tagline: 'The umbrella for a field campaign',
			what: 'A project groups everything in one research initiative — its sites, its samples, and all the downstream lab work — under a single name.',
			fields: 'Project name · principal investigator & institution · contact email · funding sources · free-text description.',
			links: 'The top of the tree. A project contains sites, and through them every sample, extract, plate, run and analysis beneath.',
			actions:
				'Create, edit or duplicate a whole project; bulk-delete; see a roster of everyone who contributed to any record inside it; attach permits and check their coverage.',
			accent: { dot: 'bg-ocean-400', badge: 'bg-ocean-500/15 text-ocean-200 border-ocean-500/40', text: 'text-ocean-300' }
		},
		{
			id: 'sites',
			num: 2,
			name: 'Sites',
			route: '/sites',
			tagline: 'Where a sample was collected',
			what: 'A site is a geographic sampling location — a lake shore, a transect point, a borehole — with coordinates and a habitat description.',
			fields: 'Site name & short code · latitude / longitude · geographic name (country:region) · ENVO biome & local feature · access notes.',
			links: 'Belongs to a project. Samples are collected at a site.',
			actions:
				'Drop a pin on an interactive map to set coordinates; the list view plots every site as a colour-ranked pin; keep a photo gallery per site.',
			accent: { dot: 'bg-red-400', badge: 'bg-red-500/15 text-red-200 border-red-500/40', text: 'text-red-300' }
		},
		{
			id: 'samples',
			num: 3,
			name: 'Samples',
			route: '/samples',
			tagline: 'The physical thing you collected',
			what: 'A sample is one physical specimen taken at a site on a date — a litre of filtered water, a sediment core, a swab. This is the MIxS-compliant heart of the record.',
			fields: 'Sample name · collection date · environmental medium · depth / elevation · the readings (temperature, salinity, pH, oxygen…) · collection gear & method · storage / preservation — plus hundreds of optional MIxS slots.',
			links: 'Belongs to a project and a site. DNA extracts are made from a sample.',
			actions:
				'Add one at a time, through a fast quick-capture form, or by batch-importing a spreadsheet; add extra MIxS columns to the table on the fly; attach photos; read permit coverage (✓ / ✗) right in the list.',
			accent: { dot: 'bg-orange-400', badge: 'bg-orange-500/15 text-orange-200 border-orange-500/40', text: 'text-orange-300' }
		},
		{
			id: 'extracts',
			num: 4,
			name: 'Extracts',
			route: '/extracts',
			tagline: 'DNA (or RNA) pulled from a sample',
			what: 'An extract is nucleic acid isolated from a sample — the input to PCR and sequencing.',
			fields: 'Extract name & date · extraction method / kit · nucleic-acid type · concentration & volume · 260/280 & 260/230 quality ratios · storage room / freezer box.',
			links: 'Belongs to a sample. Feeds PCR reactions and library preps.',
			actions: 'Create, edit or duplicate; record quantification numbers (NanoDrop, Qubit) and yield.',
			accent: { dot: 'bg-yellow-400', badge: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/40', text: 'text-yellow-300' }
		},
		{
			id: 'pcr',
			num: 5,
			name: 'PCR Plates',
			route: '/pcr',
			tagline: 'Amplifying a target gene',
			what: 'A PCR plate holds a set of reactions that share the same primers and cycling conditions — one reaction per well, each amplifying one extract.',
			fields: 'Plate name & date · target gene / subfragment · forward & reverse primers (or pick a saved primer set) · annealing temperature & cycles · per reaction: well, band observed, post-PCR concentration.',
			links: 'Reactions draw from extracts and feed library preps.',
			actions:
				'Lay reactions out on a 96-well grid; export the plate as TSV; print a plate map for the bench notebook. Reactions can also live "orphan", off any plate.',
			accent: { dot: 'bg-green-400', badge: 'bg-green-500/15 text-green-200 border-green-500/40', text: 'text-green-300' }
		},
		{
			id: 'libraries',
			num: 6,
			name: 'Library Plates',
			route: '/libraries',
			tagline: 'Barcoding for the sequencer',
			what: 'A library prep turns a PCR product (or an extract directly) into a sequencer-ready, indexed library. Library plates group preps the way PCR plates group reactions.',
			fields: 'Plate name · library type / source / selection · platform & instrument · i7 / i5 index sequences · prep kit · fragment size · final concentration.',
			links: 'Sourced from a PCR reaction or an extract. Loaded onto sequencing runs.',
			actions:
				'Assign indices per well; export or print the plate; SRA-aligned vocabulary keeps everything submission-ready.',
			accent: { dot: 'bg-blue-400', badge: 'bg-blue-500/15 text-blue-200 border-blue-500/40', text: 'text-blue-300' }
		},
		{
			id: 'runs',
			num: 7,
			name: 'Sequencing Runs',
			route: '/runs',
			tagline: 'Turning libraries into reads',
			what: 'A run is one sequencing job — a flowcell load — that produces FASTQ files. Many libraries ride on a single run.',
			fields: 'Run name & date · platform & instrument · flow-cell ID · run & FASTQ directories · total reads & bases.',
			links: 'Holds many libraries. Analyses are run on it.',
			actions: 'List every library multiplexed onto the run; point at where the raw data lives on disk.',
			accent: { dot: 'bg-violet-400', badge: 'bg-violet-500/15 text-violet-200 border-violet-500/40', text: 'text-violet-300' }
		},
		{
			id: 'analyses',
			num: 8,
			name: 'Analyses',
			route: '/analysis',
			tagline: 'Making sense of the reads',
			what: 'An analysis records a bioinformatics pipeline run against a sequencing run’s data — the taxonomy tables, reports and results.',
			fields: 'Pipeline name / version / profile · status (pending → running → complete / failed) · input & output directories · reference database · results summary · report link.',
			links: 'Belongs to a sequencing run. The end of the chain.',
			actions: 'Track pipeline status; link out to the HTML report or dashboard.',
			accent: { dot: 'bg-fuchsia-400', badge: 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/40', text: 'text-fuchsia-300' }
		}
	];

	// --- Table of contents (drives both the sticky rail and scroll-spy) ---
	const toc = [
		{ id: 'overview', label: 'The big picture' },
		{ id: 'getting-started', label: 'Getting started' },
		{ id: 'workflow', label: 'The sample lifecycle', children: stages.map((s) => ({ id: s.id, label: s.name })) },
		{ id: 'everywhere', label: 'Tools that work everywhere' },
		{ id: 'data-exchange', label: 'Import & export' },
		{ id: 'standards', label: 'Standards & governance' },
		{ id: 'lab-management', label: 'Managing your lab' },
		{ id: 'reference', label: 'Where to go next' }
	];

	const spyIds = [
		'overview',
		'getting-started',
		'workflow',
		...stages.map((s) => s.id),
		'everywhere',
		'data-exchange',
		'standards',
		'lab-management',
		'reference'
	];

	// Scroll-spy: highlight the ToC entry for whichever section is in view.
	let activeId = $state('overview');
	$effect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) activeId = e.target.id;
				}
			},
			// Trip the active section as its heading crosses the upper third.
			{ rootMargin: '-15% 0px -75% 0px', threshold: 0 }
		);
		const els = spyIds.map((id) => document.getElementById(id)).filter(Boolean) as Element[];
		els.forEach((el) => observer.observe(el));
		return () => observer.disconnect();
	});
</script>

<svelte:head>
	<title>Tour — SampleTown</title>
	<meta
		name="description"
		content="A guided tour of SampleTown: how eDNA samples flow from a field site through extraction, PCR, library prep, sequencing and analysis — plus the labels, carts, imports and governance tools that tie it together."
	/>
</svelte:head>

<div class="mx-auto max-w-6xl">
	<!-- Hero -->
	<header class="mb-10 max-w-3xl">
		<p class="text-sm font-medium uppercase tracking-wide text-ocean-400">Guided tour</p>
		<h1 class="mt-2 text-4xl font-bold tracking-tight text-white">How SampleTown works</h1>
		<p class="mt-4 text-lg leading-relaxed text-slate-300">
			SampleTown follows an environmental-DNA sample from the moment it is a bottle of lake water to
			the moment it is a published, standards-compliant dataset. This tour walks the whole path —
			the eight stages of the lab workflow, and the tools that work across all of them.
		</p>
		<p class="mt-3 text-sm text-slate-400">
			New here? Everything below is read-only reading. When you want to try it,
			<a class="text-ocean-400 hover:text-ocean-300" href="/auth/login">sign in with the demo account</a>
			(<span class="font-mono text-slate-300">guest / guest</span>) — a lab pre-loaded with example data.
		</p>
	</header>

	<div class="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
		<!-- Sticky table of contents -->
		<nav aria-label="Tour contents" class="mb-8 lg:mb-0">
			<div class="lg:sticky lg:top-20 rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm">
				<p class="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">On this page</p>
				<ul class="space-y-0.5">
					{#each toc as item}
						<li>
							<a
								href={`#${item.id}`}
								class="block rounded px-2 py-1 transition-colors hover:text-white"
								class:text-white={activeId === item.id}
								class:bg-slate-800={activeId === item.id}
								class:text-slate-400={activeId !== item.id}
							>{item.label}</a>
							{#if item.children}
								<ul class="ml-3 mt-0.5 space-y-0.5 border-l border-slate-800 pl-2">
									{#each item.children as child}
										<li>
											<a
												href={`#${child.id}`}
												class="block rounded px-2 py-1 text-xs transition-colors hover:text-white"
												class:text-white={activeId === child.id}
												class:bg-slate-800={activeId === child.id}
												class:text-slate-500={activeId !== child.id}
											>{child.label}</a>
										</li>
									{/each}
								</ul>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		</nav>

		<!-- Main content -->
		<div class="min-w-0 space-y-16">
			<!-- ============================================================ -->
			<!-- OVERVIEW -->
			<!-- ============================================================ -->
			<section id="overview" class="scroll-mt-20">
				<h2 class="text-2xl font-bold text-white">The big picture</h2>
				<p class="mt-3 max-w-3xl text-slate-300">
					Almost everything in SampleTown is one long chain. Each record is created from the one
					before it and carries its context forward, so from any sequencing read you can trace back
					to the exact litre of water and the site it came from. That chain is the backbone of the app:
				</p>

				<!-- Pipeline chips -->
				<div class="mt-6 overflow-x-auto pb-2">
					<ol class="flex min-w-max items-stretch gap-2">
						{#each stages as stage, i}
							<li class="flex items-center gap-2">
								<a
									href={`#${stage.id}`}
									class="flex w-32 flex-col rounded-lg border border-slate-800 bg-slate-900/60 p-3 transition-colors hover:border-slate-600"
								>
									<span class="flex items-center gap-2">
										<span class={`inline-block h-2.5 w-2.5 rounded-full ${stage.accent.dot}`}></span>
										<span class="text-xs text-slate-500">{stage.num}</span>
									</span>
									<span class={`mt-1 text-sm font-semibold ${stage.accent.text}`}>{stage.name}</span>
									<span class="mt-0.5 text-[11px] leading-tight text-slate-500">{stage.tagline}</span>
								</a>
								{#if i < stages.length - 1}
									<span class="text-slate-600" aria-hidden="true">→</span>
								{/if}
							</li>
						{/each}
					</ol>
				</div>

				<div class="mt-6 grid gap-4 sm:grid-cols-3">
					<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
						<h3 class="font-semibold text-white">One lab, one workspace</h3>
						<p class="mt-1 text-sm text-slate-400">
							Everything you create lives inside a <em>lab</em>. You can belong to several and switch
							between them from the name in the top-left.
						</p>
					</div>
					<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
						<h3 class="font-semibold text-white">Every record is linkable</h3>
						<p class="mt-1 text-sm text-slate-400">
							Each entity has a permanent QR code and <span class="font-mono text-slate-300">/id/…</span>
							link — print it on a tube, scan it to jump back.
						</p>
					</div>
					<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
						<h3 class="font-semibold text-white">Standards-first</h3>
						<p class="mt-1 text-sm text-slate-400">
							Samples are MIxS-compliant and exports are submission-ready, so your data travels
							cleanly to public archives.
						</p>
					</div>
				</div>
			</section>

			<!-- ============================================================ -->
			<!-- GETTING STARTED -->
			<!-- ============================================================ -->
			<section id="getting-started" class="scroll-mt-20">
				<h2 class="text-2xl font-bold text-white">Getting started</h2>
				<div class="mt-4 space-y-4">
					<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
						<h3 class="font-semibold text-white">1 · Sign in</h3>
						<p class="mt-1 text-sm text-slate-400">
							Sign in with GitHub or a local username and password. The public demo is
							<span class="font-mono text-slate-300">guest / guest</span> — read/write access to a lab
							loaded with example data, a good place to click around.
						</p>
					</div>
					<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
						<h3 class="font-semibold text-white">2 · Land in a lab</h3>
						<p class="mt-1 text-sm text-slate-400">
							The first time you sign in you either <strong>start your own lab</strong> (you become its
							admin) or <strong>accept an invite</strong> to join one. A lab is your team's private
							workspace — no data is ever shared across labs.
						</p>
					</div>
					<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
						<h3 class="font-semibold text-white">3 · Know your role</h3>
						<p class="mt-1 text-sm text-slate-400">Roles are set per-lab:</p>
						<ul class="mt-2 space-y-1.5 text-sm text-slate-400">
							<li><span class="mr-1">🐙</span><strong class="text-slate-200">Admin</strong> — manages people, invites, lab settings and backups, on top of everything a user can do.</li>
							<li><span class="mr-1">🐟</span><strong class="text-slate-200">User</strong> — reads and writes all the science: projects, samples, plates, runs and the lab's vocabularies.</li>
							<li><span class="mr-1">🐚</span><strong class="text-slate-200">Viewer</strong> — read-only. Every edit button is hidden and every write is refused.</li>
						</ul>
					</div>
				</div>
			</section>

			<!-- ============================================================ -->
			<!-- WORKFLOW -->
			<!-- ============================================================ -->
			<section id="workflow" class="scroll-mt-20">
				<h2 class="text-2xl font-bold text-white">The sample lifecycle</h2>
				<p class="mt-3 max-w-3xl text-slate-300">
					The eight stages, in order. Each has a list view (sortable, filterable, selectable) and a
					detail page with a breadcrumb tracing it all the way back up the chain.
				</p>

				<div class="mt-6 space-y-5">
					{#each stages as stage}
						<article id={stage.id} class="scroll-mt-20 rounded-xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6">
							<div class="flex flex-wrap items-center gap-3">
								<span
									class={`flex h-9 w-9 flex-none items-center justify-center rounded-full border text-sm font-bold ${stage.accent.badge}`}
								>{stage.num}</span>
								<h3 class={`text-xl font-bold ${stage.accent.text}`}>{stage.name}</h3>
								<span class="text-sm text-slate-500">— {stage.tagline}</span>
								<a
									href={stage.route}
									class="ml-auto rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 transition-colors hover:border-ocean-600 hover:text-white"
								>Open {stage.route} →</a>
							</div>

							<p class="mt-4 text-slate-300">{stage.what}</p>

							<dl class="mt-4 grid gap-4 sm:grid-cols-2">
								<div>
									<dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">What you record</dt>
									<dd class="mt-1 text-sm text-slate-400">{stage.fields}</dd>
								</div>
								<div>
									<dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">How it connects</dt>
									<dd class="mt-1 text-sm text-slate-400">{stage.links}</dd>
								</div>
								<div class="sm:col-span-2">
									<dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">What you can do</dt>
									<dd class="mt-1 text-sm text-slate-400">{stage.actions}</dd>
								</div>
							</dl>
						</article>
					{/each}
				</div>
			</section>

			<!-- ============================================================ -->
			<!-- TOOLS THAT WORK EVERYWHERE -->
			<!-- ============================================================ -->
			<section id="everywhere" class="scroll-mt-20">
				<h2 class="text-2xl font-bold text-white">Tools that work everywhere</h2>
				<p class="mt-3 max-w-3xl text-slate-300">
					A handful of features sit above the workflow and apply to every stage.
				</p>

				<div class="mt-6 grid gap-4 sm:grid-cols-2">
					<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
						<h3 class="font-semibold text-white">🛒 The cart</h3>
						<p class="mt-1 text-sm text-slate-400">
							Tick boxes on any list to drop records into the cart. It follows you across pages and
							survives a reload. Use it to print a batch of labels, or to spin up the next stage in
							bulk — selected samples become new extracts, extracts become a PCR plate, and so on.
							Carts can be saved and shared with the lab.
						</p>
					</div>
					<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
						<h3 class="font-semibold text-white">⊞ Scan &amp; QR codes</h3>
						<p class="mt-1 text-sm text-slate-400">
							Every record carries a QR code. Open the scanner (top bar) and read it with a phone
							camera or a handheld barcode scanner to jump straight to the record. Scan a blank,
							pre-printed label in the field to claim it as a fresh sample on the spot.
						</p>
					</div>
					<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
						<h3 class="font-semibold text-white">🏷️ Labels</h3>
						<p class="mt-1 text-sm text-slate-400">
							Generate Avery-sheet PDFs or print to a Zebra label printer. Pre-print blank ID labels
							before a field trip, or print labels for exactly the items in your cart — each with its
							QR code and name.
						</p>
					</div>
					<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
						<h3 class="font-semibold text-white">🔍 Dashboard, search &amp; calendar</h3>
						<p class="mt-1 text-sm text-slate-400">
							The home page counts every entity at a glance and shows a colour-coded activity
							calendar following the ROYGBIV path of a sample's life. The magnifier jumps to a search
							that matches any name, ID, person or date. Every table sorts, filters, colour-codes
							(shift-click a header) and multi-selects.
						</p>
					</div>
				</div>
			</section>

			<!-- ============================================================ -->
			<!-- IMPORT / EXPORT -->
			<!-- ============================================================ -->
			<section id="data-exchange" class="scroll-mt-20">
				<h2 class="text-2xl font-bold text-white">Import &amp; export</h2>
				<div class="mt-4 grid gap-4 sm:grid-cols-2">
					<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
						<h3 class="font-semibold text-white">Import a spreadsheet</h3>
						<p class="mt-1 text-sm text-slate-400">
							Upload a TSV or Excel file of samples. SampleTown maps your columns, matches or creates
							sites by coordinates, and shows a full dry-run preview before anything is written — the
							import is all-or-nothing. Start from a downloadable template for any checklist and
							extension.
						</p>
					</div>
					<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
						<h3 class="font-semibold text-white">Export MIxS</h3>
						<p class="mt-1 text-sm text-slate-400">
							Pull your samples out as a MIxS-compliant TSV — the whole lab or a single project, for
							any checklist and extension. Because it is standards-aligned, it drops straight into
							downstream sequence archives.
						</p>
						<a href="/export" class="mt-3 inline-block text-sm text-ocean-400 hover:text-ocean-300">Go to Import / Export →</a>
					</div>
				</div>
			</section>

			<!-- ============================================================ -->
			<!-- STANDARDS & GOVERNANCE -->
			<!-- ============================================================ -->
			<section id="standards" class="scroll-mt-20">
				<h2 class="text-2xl font-bold text-white">Standards &amp; governance</h2>
				<p class="mt-3 max-w-3xl text-slate-300">
					SampleTown is opinionated about doing eDNA data <em>well</em> — both technically and ethically.
				</p>
				<div class="mt-6 space-y-4">
					<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
						<h3 class="font-semibold text-white">MIxS, end to end</h3>
						<p class="mt-1 text-sm text-slate-400">
							Samples speak MIxS (Minimum Information about any Sequence). The
							<a href="/glossary" class="text-ocean-400 hover:text-ocean-300">Glossary</a> is a
							searchable reference for every field, checklist and extension — the same definitions the
							sample forms link to inline.
						</p>
					</div>
					<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
						<h3 class="font-semibold text-white">Permits &amp; sensitive locations</h3>
						<p class="mt-1 text-sm text-slate-400">
							Permits are first-class records with GGBN-aligned types (collecting, export, PIC, MAT,
							ethics…). Every sample should be traceable to one, and the samples list shows coverage at
							a glance. Flag a sample's location as <em>sensitive</em> to coarsen its coordinates on
							export, protecting sites where precise locations could enable harm.
						</p>
					</div>
					<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
						<h3 class="font-semibold text-white">FAIR, CARE and the rest</h3>
						<p class="mt-1 text-sm text-slate-400">
							The <a href="/principles" class="text-ocean-400 hover:text-ocean-300">Principles</a> page
							lays out the governance story in full — FAIR as the technical floor, CARE and OCAP® for
							Indigenous data sovereignty, and the Nagoya Protocol backdrop for genetic-resource consent.
						</p>
					</div>
				</div>
			</section>

			<!-- ============================================================ -->
			<!-- MANAGING YOUR LAB -->
			<!-- ============================================================ -->
			<section id="lab-management" class="scroll-mt-20">
				<h2 class="text-2xl font-bold text-white">Managing your lab</h2>
				<p class="mt-3 max-w-3xl text-slate-300">
					Under <strong>Manage</strong> (Settings) a lab tailors SampleTown to how it actually works.
					Some tabs are admin-only.
				</p>
				<div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each [
						{ t: 'Naming templates', d: 'How new records are auto-named.' },
						{ t: 'Picklists', d: 'The lab’s controlled vocabularies — devices, kits, storage, and more.' },
						{ t: 'Primer sets', d: 'Reusable forward/reverse primer definitions for PCR.' },
						{ t: 'PCR protocols', d: 'Saved annealing temps and cycling conditions.' },
						{ t: 'Sample templates', d: 'Preset MIxS field sets that speed up quick capture.' },
						{ t: 'People', d: 'The personnel roster, credited on every record they touch.' },
						{ t: 'Permits', d: 'Permit records and the sites/dates each one covers.' },
						{ t: 'Users & invites', d: 'Admin: add members, set roles, send invite links.' },
						{ t: 'Feedback', d: 'Admin: the queue of feedback submitted from any page.' },
						{ t: 'Labels', d: 'Generate and print QR labels for tubes and plates.' },
						{ t: 'Backup / restore', d: 'Admin: Git-backed snapshots of the whole database.' },
						{ t: 'Danger zone', d: 'Admin: delete the entire lab.' }
					] as tab}
						<div class="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
							<h3 class="text-sm font-semibold text-white">{tab.t}</h3>
							<p class="mt-1 text-xs text-slate-400">{tab.d}</p>
						</div>
					{/each}
				</div>
			</section>

			<!-- ============================================================ -->
			<!-- WHERE TO GO NEXT -->
			<!-- ============================================================ -->
			<section id="reference" class="scroll-mt-20">
				<h2 class="text-2xl font-bold text-white">Where to go next</h2>
				<div class="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
					<div class="grid gap-4 sm:grid-cols-2">
						<a href="/" class="rounded-lg border border-slate-800 p-4 transition-colors hover:border-ocean-700">
							<div class="font-semibold text-white">Open the dashboard →</div>
							<div class="mt-1 text-sm text-slate-400">Counts, calendar and recent activity for your lab.</div>
						</a>
						<a href="/samples/quick" class="rounded-lg border border-slate-800 p-4 transition-colors hover:border-ocean-700">
							<div class="font-semibold text-white">Capture a sample →</div>
							<div class="mt-1 text-sm text-slate-400">The fast path to your first record.</div>
						</a>
						<a href="/glossary" class="rounded-lg border border-slate-800 p-4 transition-colors hover:border-ocean-700">
							<div class="font-semibold text-white">Browse the MIxS glossary →</div>
							<div class="mt-1 text-sm text-slate-400">Every field, checklist and extension, searchable.</div>
						</a>
						<a href="/principles" class="rounded-lg border border-slate-800 p-4 transition-colors hover:border-ocean-700">
							<div class="font-semibold text-white">Read the principles →</div>
							<div class="mt-1 text-sm text-slate-400">FAIR, CARE, OCAP® and permits, in depth.</div>
						</a>
					</div>
					<p class="mt-5 border-t border-slate-800 pt-4 text-sm text-slate-500">
						Something unclear or missing? There's a feedback button at the bottom of every page — it
						goes straight to the lab's admins.
					</p>
				</div>
			</section>
		</div>
	</div>
</div>
