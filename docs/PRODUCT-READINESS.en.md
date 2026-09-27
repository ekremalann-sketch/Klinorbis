# KLINORBIS product readiness — 27 September 2026

KLINORBIS is a hospital operations prototype with a public **synthetic** demo. The working software does not diagnose, treat, determine clinical suitability or connect to a hospital information system by default.

| Area | In this code | Required before institutional use |
| --- | --- | --- |
| Demand and capacity | Requests, unit queues, human approval and capacity views | Institution-owned data feeds, accuracy ownership, reconciled definitions and downtime procedure |
| Patient logistics | Structured transport and discharge operations forms | Clinical governance, eligibility rules, escalation and real-world acceptance |
| Interoperability | FHIR R4 Location capacity **validator**; no persistent/live feed | Agreed HL7/FHIR profiles, identity mapping, authorisation and integration testing |
| Staff and shifts | Role/unit assignment and shift handover | Sites sharing access plus local role assignment, joiner/leaver exercise and audit review |
| AI and automation | Bounded operational assistance and human approval boundary | Model evaluation, prompt-injection tests, service limits and incident process before live use |
| Privacy and resilience | Scope controls and code tests | DPIA where applicable, real-data prohibition until legal/security sign-off, backup and restore exercise |

## Comparison boundary

Oracle Health describes near-real-time patient-flow and resource forecasting in its Command Center. Philips describes a patient logistics suite. These are vendor product descriptions, not evidence that KLINORBIS already offers live hospital feeds or comparable scale. The useful next step is to validate **one** institution-approved capacity flow with synthetic data first.

Sources: https://www.oracle.com/health/clinical-operations/systems-operations/ ; https://www.philips.com/a-w/about/news/archive/standard/news/press/2021/20210809-philips-introduces-new-healthsuite-solutions-to-drive-healthcare-s-digital-transformation.html ; https://hl7.org/fhir/R4/location.html

## Regulatory boundary

No ISO 27001, HIPAA, KVKK or GDPR certification/compliance claim is made. The legal basis, processor/controller roles, transfers and EU AI Act classification require review of the actual intended use and jurisdiction. The public demo must remain synthetic.

References: https://www.kvkk.gov.tr/yayinlar/veri_guvenligi_rehberi.pdf ; https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng ; https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai
