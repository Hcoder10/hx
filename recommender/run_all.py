"""Generate the cohort once, run baselines, then train CFR (#1) and ANP (#2)
in parallel on the GPU, and print a comparison table."""
import json
import os
import subprocess
import sys
import time
from common import gen_synthetic, save_data
from baselines import run_baselines


def main():
    print("Generating synthetic confounded cohort (ground-truth counterfactuals known)...")
    data = gen_synthetic(n=6000, d=16, K=5, confounding=1.5, noise=3.0, seed=0)
    save_data(data, "data.npz")
    print(f"  n_train={len(data['Xtr'])} n_test={len(data['Xte'])} K={data['K']} d={data['d']}")

    print("Running baselines (naive, KNN patients-like-you)...")
    rows = run_baselines(data)

    os.makedirs("out", exist_ok=True)
    print("Launching CFR (#1) and ANP (#2) in parallel on the GPU...")
    py = sys.executable
    t = time.time()
    procs = [subprocess.Popen([py, "cfr.py"]), subprocess.Popen([py, "anp.py"])]
    for p in procs:
        p.wait()
    print(f"  parallel training finished in {time.time() - t:.1f}s")

    for f in ("out/cfr.json", "out/anp.json"):
        if os.path.exists(f):
            rows.append(json.load(open(f)))

    print("\n================= RESULTS  (lower regret & PO-RMSE = better) =================")
    hdr = f"{'method':<46}{'regret':>8}{'PO-RMSE':>9}{'best%':>7}{'NLL':>8}"
    print(hdr)
    print("-" * len(hdr))
    for r in sorted(rows, key=lambda x: x["regret"]):
        nll = f"{r['nll']:.2f}" if "nll" in r else "-"
        print(f"{r['method']:<46}{r['regret']:>8.3f}{r['po_rmse']:>9.2f}{r['best_acc'] * 100:>6.1f}{nll:>8}")
    print("\nregret = avg lost recovery vs the true-best choice; best% = how often the true-best choice was picked.")
    json.dump(rows, open("out/summary.json", "w"), indent=2)
    print("Saved out/summary.json")


if __name__ == "__main__":
    main()
