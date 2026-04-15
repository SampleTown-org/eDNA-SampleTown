<svelte:head>
	<title>Privacy — SampleTown</title>
</svelte:head>

<div class="prose prose-invert max-w-3xl mx-auto space-y-6 text-slate-300">
	<h1 class="text-3xl font-bold text-white">Privacy</h1>
	<p class="text-sm text-slate-500">Last updated: 2026-04-15</p>

	<p>
		SampleTown is a research data tool for managing eDNA / MIxS-compliant sample
		metadata. Each deployment is operated by a single research lab or
		consortium; this page describes the practices of <strong>this</strong>
		deployment. Other instances of the SampleTown software may behave
		differently.
	</p>

	<h2 class="text-xl font-semibold text-white mt-6">What we store</h2>
	<ul class="list-disc list-inside space-y-1">
		<li>
			<strong>Account information</strong>: your username, email address, and
			(for OAuth sign-in) your GitHub user ID. We store this so we can
			identify you across sessions and assign you to the correct lab.
		</li>
		<li>
			<strong>Activity</strong>: which records you create, edit, or delete,
			and when. This is part of the scientific provenance trail and is
			retained indefinitely.
		</li>
		<li>
			<strong>Feedback</strong>: messages submitted via the in-app feedback
			form, along with your username and the page URL where the form was
			opened.
		</li>
		<li>
			<strong>Session cookies</strong>: a single signed cookie that keeps you
			logged in. We do not use third-party analytics or advertising cookies.
		</li>
		<li>
			<strong>Server logs</strong>: the reverse proxy in front of the
			application records IP addresses and request paths for security and
			rate-limiting purposes. These rotate on a routine schedule.
		</li>
	</ul>

	<h2 class="text-xl font-semibold text-white mt-6">What we don't store</h2>
	<ul class="list-disc list-inside space-y-1">
		<li>We do not sell, share, or transmit your data to advertisers.</li>
		<li>We do not embed third-party trackers, analytics, or ad networks.</li>
		<li>
			Local password accounts store only a bcrypt hash of your password —
			never the password itself.
		</li>
	</ul>

	<h2 class="text-xl font-semibold text-white mt-6">Authentication</h2>
	<p>
		If you sign in with GitHub, GitHub will tell us your username, GitHub user
		ID, and (if public) your email. We do not request any further scopes. You
		can revoke access at any time from your
		<a class="text-ocean-400 hover:text-ocean-300" href="https://github.com/settings/applications" target="_blank" rel="noopener noreferrer">GitHub OAuth applications page</a>.
	</p>

	<h2 class="text-xl font-semibold text-white mt-6">Lab data &amp; visibility</h2>
	<p>
		Sample, site, project, and sequencing metadata is scoped to your lab.
		Members of other labs cannot see your records. Lab administrators can
		see and manage records and members within their own lab.
	</p>

	<h2 class="text-xl font-semibold text-white mt-6">Indigenous data sovereignty</h2>
	<p>
		Where research involves Indigenous communities or lands, we encourage
		alignment with the
		<a class="text-ocean-400 hover:text-ocean-300" href="https://fnigc.ca/ocap-training/" target="_blank" rel="noopener noreferrer">OCAP® principles</a>
		(Ownership, Control, Access, and Possession) and the
		<a class="text-ocean-400 hover:text-ocean-300" href="https://www.gida-global.org/care" target="_blank" rel="noopener noreferrer">CARE Principles for Indigenous Data Governance</a>.
		If you believe data in this system requires special handling under those
		frameworks, please contact your lab administrator.
	</p>

	<h2 class="text-xl font-semibold text-white mt-6">Your rights</h2>
	<p>
		You can request a copy of the personal data we hold about you, or ask to
		have it corrected or removed, by contacting your lab administrator.
		Removal of records that form part of the scientific provenance trail may
		be limited.
	</p>

	<h2 class="text-xl font-semibold text-white mt-6">Contact</h2>
	<p>
		Questions about this policy should go to the lab administrator who
		operates this deployment, or via the
		<a class="text-ocean-400 hover:text-ocean-300" href="https://github.com/sampletown-org/edna-sampletown/issues" target="_blank" rel="noopener noreferrer">SampleTown issue tracker</a>
		for software-level concerns.
	</p>
</div>
