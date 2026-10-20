/**
 * Landing router for the merged Nozzle site.
 *
 * The docs app prerenders everything under `/docs/*`, and Workers Static
 * Assets serves those files (plus the SPA shell fallback) directly. This
 * worker only intercepts the site root and serves the Magma product page
 * (`landing.html`, copied from the repo-root product file at build time)
 * so `/` is the product story and `/docs/*` is the documentation.
 *
 * Plain JS with no imports so the deploy emits it verbatim as the bundle.
 *
 * @param {Request} request
 * @param {{ ASSETS: Fetcher }} env
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const landing = await env.ASSETS.fetch(new URL("/landing.html", url));
      const html = await landing.text();
      return new Response(html, {
        headers: { "content-type": "text/html;charset=utf-8" },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
