import "./LovablePartnerSpotlight.css";

export const AETHERIS_LOVABLE_REFERRAL_URL = "https://lovable.dev/?partner_ref=499V5382";

type LovablePartnerSpotlightProps = {
  compact?: boolean;
};

export function LovablePartnerSpotlight({ compact = false }: LovablePartnerSpotlightProps) {
  const linkProps = {
    href: AETHERIS_LOVABLE_REFERRAL_URL,
    target: "_blank",
    rel: "sponsored noopener noreferrer",
  };

  return (
    <aside
      className={"lv-partner-2026" + (compact ? " lv-partner-2026--compact" : "")}
      aria-label="Aetheris Technology Lovable Expert Partner 2026"
    >
      <div className="lv-partner-2026__inner">
        <a {...linkProps} className="lv-partner-2026__badge" aria-label="Open the Aetheris Lovable partner offer">
          <img
            src="/partner/lovable-certified-partner.webp"
            width={450}
            height={152}
            alt="Lovable Certified Partner 2026"
            decoding="async"
          />
        </a>

        <div className="lv-partner-2026__message">
          <strong>Lovable Expert Partner '26</strong>
          <span>Hire Aetheris Technology</span>
        </div>

        <a {...linkProps} className="lv-partner-2026__cta">
          Get 10 free credits + partner perks
          <span aria-hidden="true">↗</span>
        </a>

        <a {...linkProps} className="lv-partner-2026__qr" aria-label="Open the Lovable referral link shown in the QR code">
          <img
            src="/partner/lovable-referral-qr.svg"
            width={220}
            height={220}
            alt="QR code for the Aetheris Lovable partner referral"
            loading="eager"
            decoding="async"
          />
        </a>
      </div>
      {!compact && (
        <p className="lv-partner-2026__terms">
          Partner referral. Bonus credits apply to eligible new users under Lovable's current terms. Partner perks may vary.
        </p>
      )}
    </aside>
  );
}
