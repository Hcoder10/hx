"""#2 — Attentive Neural Process.

Generalizes KNN: instead of a hard k-nearest average, it LEARNS a soft,
query-conditional attention over a context set of (x, choice, outcome) patients
and outputs a calibrated predictive distribution of the outcome for the query
patient under each choice. KNN is the degenerate, non-learned special case.
"""
import json
import os
import time
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from common import get_device, load_data, policy_regret, po_rmse, best_acc, gaussian_nll


def onehot(t, K):
    return F.one_hot(t, K).float()


class ANP(nn.Module):
    def __init__(self, d, K, h=64, dk=64):
        super().__init__()
        self.K = K
        self.dk = dk
        self.enc = nn.Sequential(nn.Linear(d + K + 1, h), nn.ELU(), nn.Linear(h, h), nn.ELU())
        self.q = nn.Linear(d + K, dk)
        self.k = nn.Linear(d + K, dk)
        self.v = nn.Linear(h, h)
        self.dec = nn.Sequential(nn.Linear(d + K + h, h), nn.ELU(), nn.Linear(h, 2))

    def forward(self, xc, tc, yc, xq, tq):
        r = self.enc(torch.cat([xc, onehot(tc, self.K), yc.unsqueeze(-1)], dim=-1))
        kc = torch.cat([xc, onehot(tc, self.K)], dim=-1)
        qq = torch.cat([xq, onehot(tq, self.K)], dim=-1)
        att = torch.softmax(self.q(qq) @ self.k(kc).t() / (self.dk ** 0.5), dim=-1)
        c = att @ self.v(r)
        out = self.dec(torch.cat([xq, onehot(tq, self.K), c], dim=-1))
        return out[:, 0], out[:, 1]  # mu, logvar


def train_anp(data, iters=4000, Nc=512, Nt=256, lr=1e-3, seed=0):
    torch.manual_seed(seed)
    dev = get_device()
    K, y_mu, y_sd = data["K"], data["y_mu"], data["y_sd"]
    X = torch.tensor(data["Xtr"], device=dev)
    T = torch.tensor(data["Ttr"], device=dev, dtype=torch.long)
    Y = torch.tensor((data["Ytr"] - y_mu) / y_sd, device=dev)
    net = ANP(data["d"], K).to(dev)
    opt = torch.optim.Adam(net.parameters(), lr=lr, weight_decay=1e-5)
    n = len(X)

    for _ in range(iters):
        net.train()
        opt.zero_grad()
        perm = torch.randperm(n, device=dev)
        ci, ti = perm[:Nc], perm[Nc:Nc + Nt]
        mu, logvar = net(X[ci], T[ci], Y[ci], X[ti], T[ti])
        var = torch.exp(logvar).clamp(min=1e-3)
        nll = (0.5 * logvar + 0.5 * (Y[ti] - mu) ** 2 / var).mean()
        nll.backward()
        opt.step()

    net.eval()
    with torch.no_grad():
        perm = torch.randperm(n, device=dev)[:Nc]
        xc, tc, yc = X[perm], T[perm], Y[perm]
        Xte = torch.tensor(data["Xte"], device=dev)
        nte = len(Xte)
        mu_all = np.zeros((nte, K))
        var_all = np.zeros((nte, K))
        for c in range(K):
            tq = torch.full((nte,), c, device=dev, dtype=torch.long)
            mu, logvar = net(xc, tc, yc, Xte, tq)
            var = torch.exp(logvar).clamp(min=1e-3)
            mu_all[:, c] = mu.cpu().numpy() * y_sd + y_mu
            var_all[:, c] = var.cpu().numpy() * (y_sd ** 2)
    rec = mu_all.argmax(1)
    return dict(
        method="Attentive Neural Process (learned soft-KNN + uncertainty)",
        regret=policy_regret(data["Ymean_te"], rec),
        po_rmse=po_rmse(data["Ymean_te"], mu_all),
        best_acc=best_acc(data["best_te"], rec),
        nll=gaussian_nll(data["Ymean_te"], mu_all, var_all),
    )


if __name__ == "__main__":
    data = load_data()
    t = time.time()
    res = train_anp(data)
    res["secs"] = round(time.time() - t, 1)
    res["device"] = str(get_device())
    os.makedirs("out", exist_ok=True)
    json.dump(res, open("out/anp.json", "w"), indent=2)
    print("ANP done:", res)
