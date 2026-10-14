export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "mechatronics-workbench",
          tracks: 8,
          capstones: 5,
          labs_verified: 9,
          models_validated: 6,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        }
      );
    }
    return env.ASSETS.fetch(request);
  },
};
