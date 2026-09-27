export type Attribution = {
  acquisitionSource?: string;
  gateway?: string;
  campaign?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  landingPage?: string;
  referrer?: string;
  firstTouch?: string;
  lastTouch?: string;
  applicationTouch?: string;
  referralCode?: string;
};

const allowedGateways = new Set([
  "mainstream",
  "disability-confident",
  "women",
  "forces-veterans",
  "returners",
  "founders",
  "early-careers"
]);

export function normalizeAttribution(input: Record<string, string | null | undefined>): Attribution {
  const gateway = input.gateway && allowedGateways.has(input.gateway) ? input.gateway : "mainstream";
  const utmSource = input.utm_source || undefined;
  const referrer = input.referrer || undefined;
  const acquisitionSource =
    input.source || utmSource || (referrer ? safeHost(referrer) : undefined) || "direct";

  return {
    acquisitionSource,
    gateway,
    campaign: input.campaign || input.utm_campaign || undefined,
    utmSource,
    utmMedium: input.utm_medium || undefined,
    utmCampaign: input.utm_campaign || undefined,
    utmContent: input.utm_content || undefined,
    utmTerm: input.utm_term || undefined,
    landingPage: input.landing_page || undefined,
    referrer,
    firstTouch: input.first_touch || acquisitionSource,
    lastTouch: input.last_touch || acquisitionSource,
    applicationTouch: input.application_touch || acquisitionSource,
    referralCode: input.ref || undefined
  };
}

function safeHost(value: string) {
  try { return new URL(value).hostname; } catch { return undefined; }
}
