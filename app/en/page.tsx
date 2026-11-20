import Link from "next/link";
import type { Metadata } from "next";
import { pageMeta } from "../../lib/seo";

export const metadata: Metadata = pageMeta({
  title: "KLINORBIS | Hospital Operations Control Tower",
  description: "Hospital automation that moves every patient from registration to discharge across all units, lets staff approve or redirect each step, and lets patients follow their own journey. No clinical decisions.",
  path: "/en",
  locale: "en_US",
});

const modules = [
  ["Registration and insurance approval", "One record per patient visit. If insurance pre-approval fails, the patient is routed to the cashier with a reason and the journey continues."],
  ["Outpatient and diagnostics flow", "Physicians add lab, imaging or consultation steps; the patient moves through each unit and returns to the clinic for results automatically."],
  ["Admission, bed and discharge", "From admission decision to bed assignment, transport, discharge preparation, medication hand-over and exit — every step has an owner."],
  ["Patient self-tracking", "Patients scan the QR code on their slip, enter a PIN and see which unit they are in and how many people are ahead."],
  ["Unit queues with approve / redirect", "Each unit sees only its own queue: Start, Complete, Reject / redirect. A completed step drops into the next unit instantly."],
  ["Hospital flow board and audit", "Waiting, in-progress and overdue counts for every unit on one board; every action is written to a tamper-evident audit trail."],
];
const steps = [["Registration", "Front desk opens the journey and prints a tracking slip."], ["Insurance", "Pre-approval or redirect to the cashier."], ["Examination", "Clinic adds diagnostics, consultation or admission."], ["Diagnostics", "Blood draw, lab and imaging units complete in order."], ["Results", "Patient returns to the clinic automatically."], ["Exit", "Cashier and information desk close the journey."]];

export default function EnglishHome() {
  return <main className="marketing-shell" lang="en">
    <header className="marketing-header"><Link href="/en" className="marketing-brand"><span>K</span><b>KLINORBIS<small>HOSPITAL AUTOMATION</small></b></Link><nav><a href="#platform">Platform</a><a href="#workflow">Workflow</a><a href="#trust">Trust</a></nav><details className="public-mobile-menu"><summary>Menu</summary><nav aria-label="Mobile navigation"><a href="#platform">Platform</a><a href="#workflow">Workflow</a><a href="#trust">Trust</a><Link href="/kurumsal-basvuru">Contact (Turkish)</Link></nav></details><div className="marketing-actions"><Link href="/" className="language-button">TR</Link><Link href="/giris" className="demo-button">Sign in</Link></div></header>
    <section className="marketing-hero"><div className="hero-message"><span className="kicker">HOSPITAL AUTOMATION SYSTEM</span><h1>From registration to discharge,<br/><em>every unit in one flow.</em></h1><p>Registration, insurance approval, outpatient clinics, diagnostics, admission, cashier and exit work as one connected process. When a unit completes its step, the patient moves to the next unit — and patients follow their own journey on their phone.</p><div className="hero-buttons"><Link href="/kurumsal-basvuru" className="hero-primary">Request a meeting <span>→</span></Link><Link href="/takip" className="hero-secondary">Track my visit (Turkish)</Link></div><div className="hero-proof"><span><i/>No clinical decisions</span><span><i/>Human approval at every step</span><span><i/>Auditable workflow</span></div></div></section>
    <section className="marketing-section" id="platform"><div className="section-intro"><span className="kicker">MODULES</span><h2>All hospital units in the same patient journey.</h2></div><div className="capability-grid">{modules.map(([a, b], i) => <article key={a}><span>0{i + 1}</span><h3>{a}</h3><p>{b}</p></article>)}</div></section>
    <section className="workflow-section" id="workflow"><div><span className="kicker">HOW IT WORKS</span><h2>An outpatient visit, end to end.</h2><p>At every step the unit can complete (patient moves on), reject / redirect with a reason, or — for clinicians — add diagnostics, consultation or admission steps.</p></div><ol>{steps.map(([a, b]) => <li key={a}><b>{a}</b><span>{b}</span></li>)}</ol></section>
    <section className="trust-section" id="trust"><div className="trust-card"><span>PRODUCT BOUNDARY</span><h2>Operational coordination — not clinical decision-making.</h2><p>Klinorbis does not provide diagnosis or treatment decisions and is not a medical device. Medical records, orders and billing remain in the hospital information system (HBYS). Patient screens never show names, ID numbers, diagnoses or staff details.</p></div></section>
    <footer className="marketing-footer"><div><b>KLINORBIS</b><span>Hospital automation with visibility, accountability and bounded automation.</span></div><div><Link href="/">Türkçe</Link><Link href="/kurumsal-basvuru">Contact</Link><Link href="/gizlilik">Privacy (Turkish)</Link><a href="https://github.com/ekremalann-sketch" target="_blank" rel="noopener noreferrer">Ekrem Alan · GitHub</a></div><small>© 2026 Klinorbis</small></footer>
  </main>;
}
