export type RiskFlag = "new_ip" | "new_device";

// Coarse user-agent family: enough to notice "a different browser/OS than usual" without
// fingerprinting. Returns e.g. "Chrome/Windows", "Safari/iOS", "node".
export function userAgentFamily(userAgent: string | null): string {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("opr/") || ua.includes("opera")
      ? "Opera"
      : ua.includes("firefox/")
        ? "Firefox"
        : ua.includes("chrome/") || ua.includes("crios/")
          ? "Chrome"
          : ua.includes("safari/")
            ? "Safari"
            : ua.includes("curl/")
              ? "curl"
              : ua.includes("node") || ua.includes("supertest")
                ? "node"
                : "other";
  const os = ua.includes("windows")
    ? "Windows"
    : ua.includes("iphone") || ua.includes("ipad")
      ? "iOS"
      : ua.includes("android")
        ? "Android"
        : ua.includes("mac os")
          ? "macOS"
          : ua.includes("linux")
            ? "Linux"
            : "unknown";
  return `${browser}/${os}`;
}

export interface KnownLogin {
  ip: string | null;
  userAgent: string | null;
}

// First-ever logins carry no flags: there is nothing to compare against yet.
export function deriveRiskFlags(
  history: readonly KnownLogin[],
  current: { ip: string | null; userAgent: string | null },
): RiskFlag[] {
  if (history.length === 0) return [];
  const flags: RiskFlag[] = [];
  if (current.ip && !history.some((h) => h.ip === current.ip)) flags.push("new_ip");
  const family = userAgentFamily(current.userAgent);
  if (family !== "unknown" && !history.some((h) => userAgentFamily(h.userAgent) === family)) {
    flags.push("new_device");
  }
  return flags;
}
