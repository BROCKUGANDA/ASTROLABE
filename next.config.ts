import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // The scaffold shipped `ignoreBuildErrors: true`. That is a loaded gun in a
  // repository whose whole claim is that a wrong number is caught before it
  // ships: `next build` would happily emit an artifact from code the type
  // checker rejects, and only the separate `bun run typecheck` gate noticed.
  // The repo typechecks clean, so the build is allowed to fail on a type error —
  // it should.
  typescript: { ignoreBuildErrors: false },

  // "X-Powered-By: Next.js" tells a scanner which framework and which known CVE
  // set to try. The version is not needed by anything here.
  poweredByHeader: false,

  // StrictMode double-invokes effects in development only; it has no production
  // cost. Left off deliberately: the 3D canvas and the session bootstrap both
  // mount resources that a second, immediate mount/unmount pass tears down, and
  // the failure mode is a canvas that never paints. Revisit with the WebGL
  // surface before flipping this.
  reactStrictMode: false,
};

export default nextConfig;
