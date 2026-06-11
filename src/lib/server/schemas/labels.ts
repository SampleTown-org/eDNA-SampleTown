import { z } from 'zod';

/** Entity id: 32 lowercase-hex chars, matching `generateId()` in db.ts. */
const entityId = z
	.string()
	.regex(/^[0-9a-fA-F]{32}$/, 'id must be 32 hex chars');

/** One label's printable content — mirrors `LabelInput` in labels-zpl.ts. */
const LabelInputBody = z.object({
	id: entityId,
	type: z.string().trim().max(40).optional(),
	primary: z.string().max(200).optional(),
	secondary: z.string().max(200).optional()
});

/** Printer/ZPL settings — mirrors `ZebraConfig`, with safe bounds. */
const ZebraConfigBody = z.object({
	dpi: z.union([z.literal(203), z.literal(300)]),
	widthIn: z.number().min(0.25).max(6),
	heightIn: z.number().min(0.25).max(6),
	darkness: z.number().int().min(0).max(30).optional(),
	speedIps: z.number().int().min(1).max(14).optional(),
	ecLevel: z.enum(['L', 'M', 'Q', 'H']).optional(),
	magnification: z.number().int().min(0).max(10).optional()
});

/** Body for POST /api/labels/print. */
export const PrintBody = z.object({
	labels: z.array(LabelInputBody).min(1).max(500),
	config: ZebraConfigBody,
	/** Origin to encode in the QR URLs. Defaults server-side to ORIGIN. */
	origin: z.string().url().optional()
});
