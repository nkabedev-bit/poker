// Next.js resolves the `server-only` marker to a stub of its own at build time, so the
// package is never installed. Vitest has no such rule, and modules carrying the marker
// — anything holding a secret or a service-role key — would fail to import without one.
export {};
