const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * DNS-rebinding guard for the unauthenticated admin. A rebinding attack needs the browser to
 * send the attacker's domain name as Host, so only names we know are accepted: localhost,
 * IP literals (handy for opening the admin from a phone in the same LAN) and ALLOWED_HOSTS.
 */
export function isAllowedHost(hostHeader: string | null, allowedHosts = process.env.ALLOWED_HOSTS ?? ''): boolean {
  if (!hostHeader) return false;
  let hostname: string;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  if (IPV4_RE.test(hostname) || hostname.startsWith('[')) return true;
  return allowedHosts
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .includes(hostname);
}
