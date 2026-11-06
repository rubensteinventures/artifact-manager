import type { APIRoute } from 'astro';
import { generateCorporatePassphrase } from '@/lib/corporate-passphrase';

export const GET: APIRoute = async ({ session }) => {
	const adminUsername = await session?.get('adminUsername');
	if (!adminUsername || typeof adminUsername !== 'string') {
		return new Response('Unauthorized', { status: 401 });
	}
	return Response.json({ passphrase: generateCorporatePassphrase() });
};
