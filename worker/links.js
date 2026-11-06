// Public link building. Two hostnames share this Worker:
//   FRONTEND_HOST (tete.apipedia.id)  - web UI and the share page /file/:id
//   API_HOST      (tetein.apipedia.id) - API, MCP and integrators
// Responses always point share links at the frontend and download/delete links at the API, whichever host
// handled the request. On any other host (workers.dev, local dev) everything uses the request's own origin.

export function linksFor(request, env) {
  const url = new URL(request.url);
  const frontend = env.FRONTEND_HOST;
  const api = env.API_HOST;
  if (frontend && api && (url.hostname === frontend || url.hostname === api)) {
    return { web: `https://${frontend}`, api: `https://${api}` };
  }
  return { web: url.origin, api: url.origin };
}

export const isApiHost = (request, env) => !!env.API_HOST && new URL(request.url).hostname === env.API_HOST;
