/**
 * Server-side session revocation store. A route file may only export handlers,
 * so the shared bits live here.
 *
 * Sign-out marks a subject's issue-time boundary: any session minted at or
 * before that instant is refused, which is what makes "expire sessions
 * everywhere, including open tabs" true rather than aspirational (PRD §14-273).
 */

const revokedBefore = new Map<string, number>();

export function revokeSessionsFor(sub: string): void {
  revokedBefore.set(sub, Math.floor(Date.now() / 1000) + 1);
}

export function isRevoked(session: { sub: string; issuedAt: number }): boolean {
  const mark = revokedBefore.get(session.sub);
  return mark !== undefined && session.issuedAt <= mark;
}
