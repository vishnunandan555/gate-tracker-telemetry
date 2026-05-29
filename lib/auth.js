export function readAccessKey(request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('x-api-key') || '';

  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return authHeader.trim();
}

export function assertDashboardAccess(request) {
  const expectedKey = process.env.STATS_API_KEY || '';
  const queryKey = new URL(request.url).searchParams.get('key') || '';
  const receivedKey = readAccessKey(request) || queryKey;

  if (!expectedKey || receivedKey !== expectedKey) {
    return {
      ok: false,
      response: Response.json(
        { error: 'Unauthorized. Invalid dashboard key.' },
        { status: 401 }
      ),
    };
  }

  return { ok: true };
}