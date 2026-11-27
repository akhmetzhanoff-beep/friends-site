# ChatGPT Ads landing page

Static bilingual landing page for the Friends ChatGPT Ads experiment.

## Route
The page is published as `/chatgpt/` when this directory is deployed to the Friends website document root.

## Included
- Russian and Kazakh copy with a language switch.
- Responsive layout.
- Membership price and trial CTA.
- CTA links to `https://app.friendscommunity.kz/`.
- Allowlisted UTM and click parameters are passed through to the app URL:
  `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`,
  `gclid`, `fbclid`, `ttclid`, `msclkid`, `opref`, `click_id`, `ref`.
- Defaults `utm_source=chatgpt`, `utm_medium=paid`, `utm_campaign=friends_kz_2026` when absent.

## Important measurement boundary
This page does **not** include an OpenAI Ads Pixel because a real Pixel ID and approved Ads account configuration have not been supplied. It also does not claim to measure app purchases. Passing query parameters to the app is only the first step: the app/backend must persist attribution against the authenticated user and attach it to a server-confirmed payment event. A mobile measurement partner may be required for install/deep-link attribution.

## Deployment warning
The current `friends-site/landing` README says the website output is generated from `friends-hub/apps/site/build_bundle.py`. That source path was not present in the inspected `friends-hub/agent/integrated-mvp-2026-11-03` branch, and the default `friends-hub/main` branch contains documentation only. Keep this PR as a reviewable preview until the canonical website build source and deployment pipeline are verified. Do not merge or manually publish this generated output as a permanent source change until that is resolved.

## QA still required
- Verify production route and HTTPS after deployment.
- Test language switch on mobile and desktop.
- Test UTM/click-ID passthrough into the app on iOS, Android and web.
- Verify that the app/backend persists attribution and that purchases are emitted only after server-side payment confirmation.
- Add the actual OpenAI pixel and server-side conversion configuration only after receiving the real account identifiers and credentials.
