export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  Vary: 'Origin',
};

export function withCors(response) {
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }

  return response;
}

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}