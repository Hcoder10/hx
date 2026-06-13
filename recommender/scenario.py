"""Map the abstract recommender onto a realistic, NAMED (synthetic) scenario:
'choose your next appointment'. Trains the winning Attentive NP on a realistic
confounded cohort and exports concrete recommendations for demo personas.

ALL SYNTHETIC. Outcomes are modeled, not real.
"""
import json
import math
import os
import numpy as np
import torch
from anp import ANP
from common import get_device

SEED = 0
DEV = get_device()

# K named care options for a post-ER medication + depression follow-up
PROVIDERS = [
    {"name": "Integrated Med-Management Clinic", "org": "Eastside Health",
     "blurb": "Pharmacist + physician review every medicine together — built for interactions."},
    {"name": "Telehealth Psychiatry", "org": "Cerulean Health",
     "blurb": "Video medication-management visits, usually within days."},
    {"name": "Dr. Okafor (your psychiatrist)", "org": "Bayview Behavioral Health",
     "blurb": "Continue in person with the doctor who knows your history."},
    {"name": "PCP Coordinated Care", "org": "Eastside Family Medicine",
     "blurb": "Dr. Chen coordinates your medicines across all your specialists."},
    {"name": "Community Mental Health Center", "org": "County Health",
     "blurb": "Lower cost and broad access; longer wait times."},
]
K = len(PROVIDERS)
FEATURES = ["age", "depression_severity", "num_meds", "has_med_conflict", "diabetes",
            "hypertension", "adherence", "insured", "distance", "anxiety", "prior_no_shows", "recent_ER"]
D = len(FEATURES)


def sample_features(n, rng):
    age = np.clip(rng.normal(50, 16, n), 18, 90)
    sev = np.clip(rng.beta(2, 2, n), 0, 1)
    nmeds = np.clip(rng.poisson(2.2, n), 0, 9)
    conflict = (rng.random(n) < 0.18).astype(float)
    diabetes = (rng.random(n) < 0.25).astype(float)
    htn = (rng.random(n) < 0.35).astype(float)
    adherence = np.clip(rng.beta(3, 2, n), 0, 1)
    insured = (rng.random(n) < 0.7).astype(float)
    distance = np.clip(rng.exponential(0.5, n), 0, 3)  # ~rural/travel burden
    anxiety = np.clip(rng.beta(2, 3, n), 0, 1)
    noshow = np.clip(rng.poisson(0.6, n), 0, 6)
    er = (rng.random(n) < 0.2).astype(float)
    return np.stack([age, sev, nmeds, conflict, diabetes, htn, adherence,
                     insured, distance, anxiety, noshow, er], axis=1).astype(np.float32)


def true_outcomes(F, rng):
    """Interpretable 8-week benefit score (0-100) per option + heterogeneity + noise."""
    age, sev, nmeds, conflict, dia, htn, adh, ins, dist, anx, noshow, er = [F[:, i] for i in range(D)]
    base = 68 - 16 * sev - 1.3 * nmeds - 4 * dia - 2 * htn + 12 * (adh - 0.5) - 0.15 * np.clip(age - 55, 0, None)
    Y = np.zeros((len(F), K), dtype=np.float32)
    # 0 Med-Management Clinic: specialized in many-meds + interactions; in-person (distance hurts)
    Y[:, 0] = base + 6 + 13 * conflict + 2.2 * np.clip(nmeds - 2, 0, None) + 4 * ins - 6 * dist
    # 1 Telehealth: great for distance/busy, fast; weaker for severe or complex interactions
    Y[:, 1] = base + 4 + 7 * dist + 3 * ins - 10 * sev - 6 * conflict - 2 * nmeds * 0.5
    # 2 Dr. Okafor status quo: continuity bonus, moderate; in-person
    Y[:, 2] = base + 6 + 5 * (1 - sev) - 3 * dist - 4 * conflict
    # 3 PCP coordinated: decent at med coordination, weaker for psychiatric severity
    Y[:, 3] = base + 3 + 6 * conflict + 2 * nmeds * 0.5 - 6 * sev - 2 * anx
    # 4 Community center: access for uninsured, but lower intensity + waits
    Y[:, 4] = base - 2 + 17 * (1 - ins) - 3 * noshow + 2 * dist
    # small heterogeneity per option
    for k in range(K):
        W = rng.normal(size=(D,)) / np.sqrt(D) * 3.0
        Y[:, k] += np.tanh(F @ W)
    Y = np.clip(Y + rng.normal(0, 3, Y.shape), 8, 96)
    return Y.astype(np.float32)


def assign(F, Ymean, rng, confounding=1.2):
    age, sev, nmeds, conflict, dia, htn, adh, ins, dist, anx, noshow, er = [F[:, i] for i in range(D)]
    logits = np.zeros((len(F), K))
    logits[:, 0] = 1.2 * np.clip(nmeds - 2, 0, None) + 1.5 * conflict + 0.8 * ins        # referred when many meds
    logits[:, 1] = 1.3 * dist + 1.0 * ins - 0.5 * sev                                     # telehealth: connected/remote
    logits[:, 2] = 1.0 + 0.6 * (1 - dist)                                                 # status quo default
    logits[:, 3] = 0.7 + 0.5 * dia                                                        # PCP if chronic
    logits[:, 4] = 1.6 * (1 - ins) + 0.7 * noshow + 0.6 * dist                            # community if uninsured
    centered = Ymean - Ymean.mean(1, keepdims=True)
    logits = confounding * logits + 0.6 * centered / (centered.std() + 1e-6)              # + self-selection
    logits -= logits.max(1, keepdims=True)
    P = np.exp(logits)
    P /= P.sum(1, keepdims=True)
    return np.array([rng.choice(K, p=P[i]) for i in range(len(F))], dtype=np.int64)


def train_anp(Xs, T, Yz, d, iters=3500, Nc=512, Nt=256):
    torch.manual_seed(SEED)
    net = ANP(d, K).to(DEV)
    opt = torch.optim.Adam(net.parameters(), lr=1e-3, weight_decay=1e-5)
    X = torch.tensor(Xs, device=DEV); Tt = torch.tensor(T, device=DEV); Y = torch.tensor(Yz, device=DEV)
    n = len(X)
    for _ in range(iters):
        net.train(); opt.zero_grad()
        perm = torch.randperm(n, device=DEV)
        ci, ti = perm[:Nc], perm[Nc:Nc + Nt]
        mu, logvar = net(X[ci], Tt[ci], Y[ci], X[ti], Tt[ti])
        var = torch.exp(logvar).clamp(min=1e-3)
        ((0.5 * logvar + 0.5 * (Y[ti] - mu) ** 2 / var).mean()).backward()
        opt.step()
    return net


def main():
    rng = np.random.default_rng(SEED)
    n = 8000
    F = sample_features(n, rng)
    Ymean = true_outcomes(F, rng)
    T = assign(F, Ymean, rng)
    Yobs = Ymean[np.arange(n), T]

    mu, sd = F.mean(0), F.std(0) + 1e-6
    Xs = (F - mu) / sd
    y_mu, y_sd = float(Yobs.mean()), float(Yobs.std() + 1e-6)
    net = train_anp(Xs, T, (Yobs - y_mu) / y_sd, D)

    # demo personas (raw feature dicts)
    personas = [
        dict(id="maria", name="Maria Reyes",
             summary="58 · depression on sertraline · diabetes · hypertension · 4 meds · recent ER with a drug interaction",
             feat=dict(age=58, depression_severity=0.55, num_meds=4, has_med_conflict=1, diabetes=1,
                       hypertension=1, adherence=0.6, insured=1, distance=0.3, anxiety=0.4, prior_no_shows=0, recent_ER=1)),
        dict(id="james", name="James Carter",
             summary="72 · severe depression · rural · uninsured · misses appointments",
             feat=dict(age=72, depression_severity=0.6, num_meds=2, has_med_conflict=0, diabetes=0,
                       hypertension=1, adherence=0.4, insured=0, distance=0.4, anxiety=0.5, prior_no_shows=2, recent_ER=0)),
        dict(id="ava", name="Ava Nguyen",
             summary="29 · mild depression · busy professional · insured · 1 medication",
             feat=dict(age=29, depression_severity=0.25, num_meds=1, has_med_conflict=0, diabetes=0,
                       hypertension=0, adherence=0.85, insured=1, distance=1.6, anxiety=0.6, prior_no_shows=0, recent_ER=0)),
    ]

    Xtr = torch.tensor(Xs, device=DEV); Ttr = torch.tensor(T, device=DEV)
    Ytr = torch.tensor((Yobs - y_mu) / y_sd, device=DEV)
    net.eval()
    out_personas = []
    with torch.no_grad():
        for p in personas:
            fv = np.array([[p["feat"][f] for f in FEATURES]], dtype=np.float32)
            xq = torch.tensor((fv - mu) / sd, device=DEV)
            # context = sample of cohort
            perm = torch.randperm(len(Xtr), device=DEV)[:1024]
            preds, cis, pgoods = [], [], []
            for k in range(K):
                tq = torch.full((1,), k, device=DEV, dtype=torch.long)
                m, lv = net(Xtr[perm], Ttr[perm], Ytr[perm], xq, tq)
                mean = float(m.item()) * y_sd + y_mu
                std = max(float(torch.exp(0.5 * lv).item()) * y_sd, 1.0)
                preds.append(mean); cis.append(1.96 * std)
                pgoods.append(1.0 - 0.5 * (1.0 + math.erf((65.0 - mean) / (std * math.sqrt(2)))))
            # how many patients like you faced this choice (credibility, not the estimate)
            d2 = ((Xs - (fv - mu) / sd) ** 2).sum(1)
            nn = np.argpartition(d2, 250)[:250]
            opts = []
            for k in range(K):
                sim_n = int((T[nn] == k).sum())
                opts.append(dict(
                    name=PROVIDERS[k]["name"], org=PROVIDERS[k]["org"], blurb=PROVIDERS[k]["blurb"],
                    predicted=round(preds[k], 1), ci=round(cis[k], 1),
                    p_good=round(pgoods[k], 2), similar_n=sim_n))
            order = sorted(range(K), key=lambda k: -preds[k])
            for rank, k in enumerate(order):
                opts[k]["recommended"] = (rank == 0)
            opts_sorted = [opts[k] for k in order]
            opts_sorted[0]["why"] = _why(p["feat"], order[0])
            out_personas.append(dict(id=p["id"], name=p["name"], summary=p["summary"], options=opts_sorted))

    rec = dict(
        method="Attentive Neural Process — counterfactual, uncertainty-aware (trained on a synthetic cohort)",
        decision="Your next appointment — the best follow-up for someone like you",
        disclaimer="Synthetic demo. Outcomes are modeled from a synthetic cohort, not real patient data.",
        personas=out_personas,
    )
    os.makedirs("out", exist_ok=True)
    json.dump(rec, open("out/recommendation.json", "w"), indent=2)
    # print a quick view
    for p in out_personas:
        top = p["options"][0]
        print(f"{p['name']:<14} -> {top['name']} (score {top['predicted']} ±{top['ci']}, {int(top['p_good']*100)}% est. chance of a good response, {top['similar_n']} like-you)")
    print("Saved out/recommendation.json")


def _why(feat, k):
    if k == 0:
        return "You have a medication interaction and several active medicines — this option specializes in reviewing them together."
    if k == 1:
        return "You're insured and a bit far from in-person care — video visits get you seen fast."
    if k == 2:
        return "Lower complexity and you value continuity — staying with your psychiatrist works well for people like you."
    if k == 3:
        return "Your medicines span several doctors — having your PCP coordinate them fits your situation."
    return "Broad access matters most for your situation — the community center is the best fit."


if __name__ == "__main__":
    main()
