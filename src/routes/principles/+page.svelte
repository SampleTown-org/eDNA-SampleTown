<svelte:head>
	<title>Principles — SampleTown</title>
</svelte:head>

<div class="prose prose-invert max-w-3xl mx-auto space-y-6 text-slate-300">
	<h1 class="text-3xl font-bold text-white">Data governance principles</h1>
	<p class="text-sm text-slate-500">Last updated: 2026-04-16</p>

	<p>
		SampleTown is built to support research that touches ecosystems and
		communities with their own rights and interests in scientific data. The
		principles below guide how we design features and how we expect users to
		handle the records they create and share.
	</p>

	<h2 class="text-xl font-semibold text-white mt-6">FAIR — the technical floor</h2>
	<p>
		Every export, every API, and every record is designed with the
		<a class="text-ocean-400 hover:text-ocean-300" href="https://www.go-fair.org/fair-principles/" target="_blank" rel="noopener noreferrer">FAIR principles</a>
		as the minimum bar: data should be
		<strong>F</strong>indable,
		<strong>A</strong>ccessible,
		<strong>I</strong>nteroperable, and
		<strong>R</strong>eusable. MIxS-compliant import and export and
		GGBN-aligned permit vocabulary are concrete downstream consequences of
		this.
	</p>

	<h2 class="text-xl font-semibold text-white mt-6">CARE — the ethical ceiling</h2>
	<p>
		FAIR is necessary but not sufficient when data concerns Indigenous
		communities. The
		<a class="text-ocean-400 hover:text-ocean-300" href="https://www.gida-global.org/care" target="_blank" rel="noopener noreferrer">CARE Principles for Indigenous Data Governance</a>
		add four requirements that live alongside FAIR:
	</p>
	<ul class="list-disc list-inside space-y-1">
		<li><strong>C</strong>ollective benefit — data should support Indigenous inclusion and well-being.</li>
		<li><strong>A</strong>uthority to control — Indigenous peoples' rights in their own data are recognised.</li>
		<li><strong>R</strong>esponsibility — those working with Indigenous data have a duty to nurture respectful relationships.</li>
		<li><strong>E</strong>thics — minimising harm and maximising benefit guides the work.</li>
	</ul>

	<h2 class="text-xl font-semibold text-white mt-6">OCAP® — Canadian context</h2>
	<p>
		For projects involving First Nations in Canada, SampleTown also
		recognises the
		<a class="text-ocean-400 hover:text-ocean-300" href="https://fnigc.ca/ocap-training/" target="_blank" rel="noopener noreferrer">OCAP® principles</a>
		(Ownership, Control, Access, Possession) developed by the First Nations
		Information Governance Centre. These are community-level rights that sit
		above individual consent: a community retains the right to control how
		data about it is collected, used, stored, and shared.
	</p>

	<h2 class="text-xl font-semibold text-white mt-6">Permits, consent, and the legal backdrop</h2>
	<p>
		Sample collection is regulated. Under the
		<a class="text-ocean-400 hover:text-ocean-300" href="https://www.cbd.int/abs/" target="_blank" rel="noopener noreferrer">Nagoya Protocol</a>
		and domestic laws in most countries, genetic resources require prior
		informed consent and mutually agreed terms with the provider country.
		In Canada, research ethics board approval under the Tri-Council
		<a class="text-ocean-400 hover:text-ocean-300" href="https://ethics.gc.ca/eng/tcps2-eptc2_2022_chapter9-chapitre9.html" target="_blank" rel="noopener noreferrer">TCPS2 Chapter 9</a>
		guidelines applies when research engages First Nations, Inuit, or Métis
		peoples.
	</p>
	<p>
		SampleTown surfaces this through <strong>permits</strong> as
		first-class records. Every sample should be traceable to a collecting
		permit (and, where applicable, export, import, IRCC, PIC, MAT,
		community-agreement, ethics, or DUA documents). Permit vocabulary
		follows the
		<a class="text-ocean-400 hover:text-ocean-300" href="https://wiki.ggbn.org/ggbn/Permits_and_Contracts_and_Terms_for_Biological_Specimens" target="_blank" rel="noopener noreferrer">GGBN Darwin Core permit extension</a>.
	</p>

	<h2 class="text-xl font-semibold text-white mt-6">What this means in practice</h2>
	<ul class="list-disc list-inside space-y-1">
		<li>Attach a permit to the project before samples are collected — not after.</li>
		<li>Use the <em>Sensitive location</em> flag for samples where precise coordinates could enable harm (poaching, cultural sites, community privacy).</li>
		<li>Record permit identifiers verbatim from the issuing authority — they travel with the data on MIxS export.</li>
		<li>When working with Indigenous partners, name the community as a project stakeholder and discuss data sharing <em>before</em> publication, not on the day of submission.</li>
	</ul>

	<h2 class="text-xl font-semibold text-white mt-6">Limits of this tool</h2>
	<p>
		SampleTown does not substitute for legal advice, REB review, or
		community engagement. It is a record-keeping and export tool. The
		responsibility for ethical, legal, and culturally-appropriate conduct
		rests with the researcher and their institution.
	</p>

	<p class="text-sm text-slate-500 pt-4 border-t border-slate-800">
		Questions, suggestions, or corrections? Open an issue on the
		<a class="text-ocean-400 hover:text-ocean-300" href="https://github.com/sampletown-org/edna-sampletown/issues" target="_blank" rel="noopener noreferrer">SampleTown issue tracker</a>.
	</p>
</div>
