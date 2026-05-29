import { NextResponse } from 'next/server';
import { getHealth } from '../../../lib/telemetry-store';
import { optionsResponse, withCors } from '../../../lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const health = await getHealth();

    return withCors(
      NextResponse.json({
        ...health,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    return withCors(
      NextResponse.json(
        {
          status: 'unhealthy',
          database: 'error',
          provider: process.env.DB_PROVIDER || 'sqlite',
          details: error.message,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      )
    );
  }
}

export function OPTIONS() {
  return optionsResponse();
}