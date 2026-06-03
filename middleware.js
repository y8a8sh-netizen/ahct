import {
    shouldBlockAccess,
    getBlockedPageHtml,
    getClientIpFromRequest,
} from './server/geo-restrict.cjs';

export default async function middleware(request) {
    if (process.env.GEO_RESTRICT_SA !== 'true') {
        return;
    }

    const country = request.headers.get('x-vercel-ip-country');
    const ip = getClientIpFromRequest(request);
    const blocked = await shouldBlockAccess({ countryHeader: country, ip });

    if (!blocked) {
        return;
    }

    return new Response(getBlockedPageHtml(), {
        status: 403,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
        },
    });
}

export const config = {
    matcher: ['/((?!assets/|favicon\\.ico|.*\\..*).*)'],
};
