"""Follow-up 2: vary confounding strength. Expectation: as confounding rises,
KNN ("patients-like-you") regret blows up while the counterfactual methods stay
flat. This is the core "why it beats vector search" result."""
import json
import os
from common import gen_synthetic
from baselines import knn
from cfr import train_cfr
from anp import train_anp

rows = []
for c in [0.0, 0.5, 1.0, 1.5, 2.0, 3.0]:
    data = gen_synthetic(n=6000, d=16, K=5, confounding=c, noise=3.0, seed=0)
    kn = knn(data)
    cf = train_cfr(data, alpha=0.1, epochs=1200)
    an = train_anp(data, iters=2500)
    row = {
        "confounding": c,
        "knn_regret": kn["regret"], "cfr_regret": cf["regret"], "anp_regret": an["regret"],
        "knn_best": kn["best_acc"], "anp_best": an["best_acc"],
    }
    rows.append(row)
    print(f"conf={c}: KNN regret={kn['regret']:.3f}  CFR={cf['regret']:.3f}  ANP={an['regret']:.3f}")

os.makedirs("out", exist_ok=True)
json.dump(rows, open("out/sweep_confounding.json", "w"), indent=2)

print("\n===== Regret vs confounding (lower=better) =====")
print(f"{'confound':>9}{'KNN':>9}{'CFR':>9}{'ANP':>9}")
for r in rows:
    print(f"{r['confounding']:>9.1f}{r['knn_regret']:>9.3f}{r['cfr_regret']:>9.3f}{r['anp_regret']:>9.3f}")
print("Saved out/sweep_confounding.json")
