# Hx Recommender — counterfactual "next appointment" (research track)

"Patients like me" is really a **causal** question ("what's the effect on *my*
outcome of choosing option A vs B?"), not a retrieval question. Naive KNN
("what did similar patients who chose A experience?") is biased by
treatment-selection confounding. This track benchmarks KNN against two
counterfactual methods on a **synthetic cohort with known ground-truth
potential outcomes**, then maps the winner onto a named, demoable scenario.

> All data is **synthetic**. Outcomes are modeled, not real.

## Main benchmark (5 options, confounded assignment, n=6000)
Lower regret = better decisions; higher best% = picks the truly-optimal option more often.

| Method | Regret ↓ | PO-RMSE ↓ | Picks true-best ↑ | NLL ↓ |
|---|---|---|---|---|
| **Attentive Neural Process** | **0.54** | **2.82** | **76.7%** | **2.48** |
| KNN "patients-like-you" | 1.48 | 5.29 | 62.4% | — |
| CFR / TARNet (α=1.0) | 1.54 | 4.79 | 60.7% | — |
| Naive (per-arm mean) | 2.37 | 7.46 | 50.7% | — |

**The Attentive NP wins decisively** — ~2.8× lower decision regret than KNN, and the only method with calibrated uncertainty.

## Follow-up 1 — CFR α-sweep
CFR is basically **tied with KNN on decisions across all α** (regret 1.46–1.54 vs KNN 1.48). It fits potential outcomes a bit better (PO-RMSE ~4.75 vs 5.29) but that doesn't translate into better picks here. Honest negative result: representation-balancing is **not** the lever in this setup — the ANP's flexible conditional estimator is.

## Follow-up 2 — confounding sweep (the "why it beats vector search" result)
As confounding rises 0 → 3:

| Confounding | KNN regret | CFR regret | ANP regret | KNN best% | ANP best% |
|---|---|---|---|---|---|
| 0.0 | 1.47 | 1.37 | 0.52 | 64% | 77% |
| 1.5 | 1.48 | 1.39 | 0.67 | 62% | 74% |
| 3.0 | **1.72** | 1.46 | **0.63** | **59%** | **76%** |

**KNN degrades as confounding grows (regret 1.47→1.72, best% 64%→59%); the ANP stays low and flat.** That's the core argument: hard KNN inherits selection bias; the learned counterfactual estimator doesn't.

## Mapping to a real demo
`scenario.py` trains the ANP on a realistic confounded cohort (12 patient features, 5 named care options) and exports `out/recommendation.json`, consumed by the site at **`/app/next-appointment`**. Personalization is real:
- **Maria** (interaction + 4 meds) → **Integrated Med-Management Clinic** (73 ±5)
- **James** (uninsured, rural) → **Community Mental Health Center** (61 ±6)
- **Ava** (young, low complexity) → **Telehealth Psychiatry** (83 ±6)

## Files
`common.py` (cohort + metrics) · `baselines.py` (naive, KNN) · `cfr.py` (#1) · `anp.py` (#2) · `run_all.py` (main benchmark, parallel) · `sweep_alpha.py`, `sweep_confounding.py` (follow-ups) · `scenario.py` (named mapping → recommendation.json).

Run: `python run_all.py` (needs torch + numpy; uses GPU if available).
