import { NextResponse } from 'next/server';
import { recordPing, validatePingPayload } from '../../../lib/telemetry-store';
import { optionsResponse, withCors } from '../../../lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const validation = validatePingPayload(body);

    if (!validation.ok) {
      return withCors(NextResponse.json({ error: validation.error }, { status: 400 }));
    }

    const result = await recordPing(validation.value);

    return withCors(
      NextResponse.json({
        success: true,
        duplicated: result.duplicated,
        created_date: result.createdDate,
        created_at: result.createdAt,
      })
    );
  } catch (error) {
    const status = error.status || 500;

    return withCors(
      NextResponse.json(
        {
          error: status === 500 ? 'Internal server failure' : error.message,
        },
        { status }
      )
    );
  }
}

export function OPTIONS() {
  return optionsResponse();
}