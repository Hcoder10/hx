"""Follow-up 1: give CFR a fair shot by sweeping the balancing strength alpha.
alpha=0 is TARNet (no balancing); higher = stronger representation balancing."""
import json
import os
from common import load_data
from cfr import train_cfr
from baselines import knn

data = load_data()
rows = []
kn = knn(data)
rows.append({"method": "KNN baseline", "alpha": None, **{k: kn[k] for k in ("regret", "po_rmse", "best_acc")}})

for a in [0.0, 0.1, 0.3, 1.0, 3.0]:
    r = train_cfr(data, alpha=a, epochs=2000)
    rows.append({"method": "CFR", "alpha": a, "regret": r["regret"], "po_rmse": r["po_rmse"], "best_acc": r["best_acc"]})
    print(f"alpha={a}: regret={r['regret']:.3f} po_rmse={r['po_rmse']:.2f} best%={r['best_acc']*100:.1f}")

os.makedirs("out", exist_ok=True)
json.dump(rows, open("out/sweep_alpha.json", "w"), indent=2)

print("\n===== CFR alpha sweep (vs KNN) =====")
print(f"{'config':<18}{'regret':>9}{'PO-RMSE':>9}{'best%':>8}")
for r in sorted(rows, key=lambda x: x["regret"]):
    tag = "KNN" if r["alpha"] is None else f"CFR a={r['alpha']}"
    print(f"{tag:<18}{r['regret']:>9.3f}{r['po_rmse']:>9.2f}{r['best_acc']*100:>7.1f}")
print("Saved out/sweep_alpha.json")
