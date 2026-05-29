import { NextResponse } from 'next/server';
import { assertDashboardAccess } from '../../../lib/auth';
import { getStats } from '../../../lib/telemetry-store';
import { optionsResponse, withCors } from '../../../lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = assertDashboardAccess(request);

  if (!access.ok) {
    return withCors(access.response);
  }

  try {
    return withCors(NextResponse.json(await getStats()));
  } catch (error) {
    return withCors(
      NextResponse.json(
        {
          error: 'Failed to retrieve stats',
          details: error.message,
        },
        { status: 500 }
      )
    );
  }
}

export function OPTIONS() {
  return optionsResponse();
}