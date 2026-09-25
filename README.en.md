# KLINORBIS

**A hospital operations control tower for capacity, transfer, shift and workflow coordination.**

[Live product site](https://klinorbis.ekremalan.chatgpt.site/) · [Interactive demo](https://klinorbis.ekremalan.chatgpt.site/demo) · [Türkçe README](README.md) · [Security](SECURITY.md)

![Klinorbis product site with a synthetic scenario](docs/klinorbis-site.jpg)

**Explore:** Product overview → synthetic interactive demo → workflow and controlled pilot boundaries. The sample metrics shown in this site image are not hospital measurements.

KLINORBIS is a production-oriented prototype that brings hospital capacity, inter-unit transfers, shift handovers, calls/work orders and operational reporting into one workspace. Its public demo uses synthetic, identity-free data and is not a clinical decision-support, diagnosis or treatment system.

## Highlights

- Unit-scoped capacity and work queues
- Reasoned operational pre-acceptance, rejection and alternative-campus routing
- Transfer, shift/handover and scheduled reporting workflows
- Role- and unit-scoped workspaces
- Authorized CSV export with audit records
- Responsive mobile, tablet and desktop experience
- Public interactive demo backed by synthetic data

## Technology

Vinext, React, TypeScript, Cloudflare Workers/D1, Drizzle ORM and a Git-compatible delivery workflow.

## Responsible use

- The demo contains no real patient data.
- It does not make clinical suitability, diagnosis or treatment decisions.
- It does not claim HBYS/EHR, PBX or n8n connectivity unless configured.
- Deployment in a real healthcare organization requires an institutional security review, privacy and regulatory assessment, integration validation and controlled pilot acceptance.

## Integration signature contract

The PBX (`/api/integrations/calls`), n8n (`/api/integrations/n8n`) and scheduler (`/api/automation/agent`) endpoints share one HMAC-SHA256 contract: the signed string is `${timestamp}.${eventId}.${body}`, the `x-klinorbis-timestamp`, `x-klinorbis-event-id` and `x-klinorbis-signature` headers are required, the replay window is five minutes and each `eventId` is processed once. During migration the PBX endpoint also accepts the legacy `${timestamp}.${body}` signature and records it as a security event; replay protection is bound to the signed content, so a captured legacy request cannot be re-processed under a new `eventId`. New senders should use the v2 format.

Only operations managers, unit managers and clinical roles can decide approvals; call agents, privacy and security officers have read access. When two decisions race, only the first is stored and the second receives `409`.

## Source and deployment

The public GitHub repository is the portfolio and technical review source. The live demo is published from a separate Sites source; the repository's `main` commit alone does not prove that the identical commit is running in production. Compare both publication records before claiming a version match. The security dashboard does not constitute an independent audit.

## Local verification

Requirements: Node.js 22.13 or later on Linux.

```bash
npm ci
npm run lint
npm test
```

See [README.md](README.md) for the detailed architecture, lifecycle and operational notes.

## License and security

The source is available for portfolio review only. Copying, redistribution, modification or commercial use requires prior written permission. See [LICENSE](LICENSE) and [SECURITY.md](SECURITY.md).
