# Referral network setup & compliance checklist

Toured's tour requests are referred to licensed local agents through a referral network.
Referral fees are paid broker-to-broker to LoKation Real Estate, which pays Rajesh per his split.

## One-time setup
- [ ] LoKation approval: referral split, and whether the broker co-signs network agreements
- [ ] Choose a network and sign its referral partner agreement. Ask each one:
      in-market referrals OK (Broward / Palm Beach / St. Lucie)? fee to referring broker? automatic (API/email) submission?
      - EffectiveAgents Agent2Agent: effectiveagents.com/refer-a-client (25% to referring brokerage, dashboard tracking)
      - ReferralExchange: referralexchange.com
- [ ] Netlify → Forms → contact → notifications: email to your inbox
- [ ] Keep Netlify form submissions (they are the consent record: wording, version, time, page, IP)

## Each new lead (aim for under 15 minutes)
1. Lead email arrives (name, phone, email, home, timeline, financing, "has agent: No").
2. Skip leads that look fake or that say they already have an agent (the form blocks most).
3. Submit the client to the network; note the network's referral ID in your tracker.
4. If the client replies STOP or asks not to be contacted: tell the network/agent, stop all contact.

## Rules that always apply
- Referral fees only broker-to-broker (to LoKation). Never pay or accept fees from unlicensed people (F.S. 475.25(1)(h)).
- No payments from lenders, title, insurance or other settlement providers for referring clients (RESPA §8).
- Don't refer someone already working with an agent.
- Site advertising keeps Rajesh's name and LoKation visible (BeachesMLS 20.2.5; Florida advertising rules).
- Consent wording lives in index.html (#consentText); if you change it, bump `consent_version` in js/app.js.
