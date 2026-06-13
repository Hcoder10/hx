"""#1 — Counterfactual Regression (CFR / TARNet style).

Shared representation phi(x) with one outcome head per choice, trained on the
FACTUAL outcomes plus an MMD penalty that balances the representation across
choice groups. We embed for counterfactual validity (removing selection bias),
not for resemblance -> de-confounded per-choice outcome estimates -> better policy.
"""
import json
import os
import time
import torch
import torch.nn as nn
from common import get_device, load_data, policy_regret, po_rmse, best_acc


def mmd_rbf(a, b, sigmas=(1.0, 2.0, 4.0, 8.0)):
    def k(x, y):
        d2 = (x.unsqueeze(1) - y.unsqueeze(0)).pow(2).sum(-1)
        return sum(torch.exp(-d2 / (2 * s * s)) for s in sigmas) / len(sigmas)
    return k(a, a).mean() + k(b, b).mean() - 2 * k(a, b).mean()


class CFRNet(nn.Module):
    def __init__(self, d, K, rep=64, h=64):
        super().__init__()
        self.phi = nn.Sequential(nn.Linear(d, rep), nn.ELU(), nn.Linear(rep, rep), nn.ELU())
        self.heads = nn.ModuleList(
            [nn.Sequential(nn.Linear(rep, h), nn.ELU(), nn.Linear(h, 1)) for _ in range(K)]
        )

    def forward(self, x):
        r = self.phi(x)
        ys = torch.cat([hd(r) for hd in self.heads], dim=1)
        return r, ys


def train_cfr(data, alpha=1.0, epochs=2000, lr=1e-3, seed=0):
    torch.manual_seed(seed)
    dev = get_device()
    K, y_mu, y_sd = data["K"], data["y_mu"], data["y_sd"]
    X = torch.tensor(data["Xtr"], device=dev)
    T = torch.tensor(data["Ttr"], device=dev, dtype=torch.long)
    Y = torch.tensor((data["Ytr"] - y_mu) / y_sd, device=dev)
    net = CFRNet(data["d"], K).to(dev)
    opt = torch.optim.Adam(net.parameters(), lr=lr, weight_decay=1e-4)
    ar = torch.arange(len(X), device=dev)

    for _ in range(epochs):
        net.train()
        opt.zero_grad()
        r, ys = net(X)
        fact = ((ys[ar, T] - Y) ** 2).mean()
        groups = []
        for k in range(K):
            g = r[T == k]
            if len(g) > 256:
                g = g[torch.randperm(len(g), device=dev)[:256]]
            groups.append(g)
        bal, cnt = 0.0, 0
        for i in range(K):
            for j in range(i + 1, K):
                if len(groups[i]) > 1 and len(groups[j]) > 1:
                    bal = bal + mmd_rbf(groups[i], groups[j])
                    cnt += 1
        bal = bal / max(cnt, 1)
        (fact + alpha * bal).backward()
        opt.step()

    net.eval()
    with torch.no_grad():
        Xte = torch.tensor(data["Xte"], device=dev)
        _, ys = net(Xte)
        Yhat = ys.cpu().numpy() * y_sd + y_mu
    rec = Yhat.argmax(1)
    return dict(
        method=f"CFR / TARNet (balanced rep, alpha={alpha})",
        regret=policy_regret(data["Ymean_te"], rec),
        po_rmse=po_rmse(data["Ymean_te"], Yhat),
        best_acc=best_acc(data["best_te"], rec),
    )


if __name__ == "__main__":
    data = load_data()
    t = time.time()
    res = train_cfr(data)
    res["secs"] = round(time.time() - t, 1)
    res["device"] = str(get_device())
    os.makedirs("out", exist_ok=True)
    json.dump(res, open("out/cfr.json", "w"), indent=2)
    print("CFR done:", res)
