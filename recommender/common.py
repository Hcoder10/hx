"""Synthetic confounded patient cohort + metrics, shared by all methods.

The point: a fair benchmark where we KNOW the ground-truth counterfactual
outcomes, so we can show that naive "patients-like-you" KNN is biased by
treatment-selection confounding, while counterfactual methods (CFR, ANP) are not.
"""
import json
import os
import numpy as np
import torch


def get_device():
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def _rand_mlp(rng, d_in, d_hidden=32, scale=1.0):
    """A fixed random nonlinear function R^d_in -> R."""
    W1 = rng.normal(size=(d_in, d_hidden)) / np.sqrt(d_in)
    b1 = rng.normal(size=(d_hidden,))
    W2 = rng.normal(size=(d_hidden,)) / np.sqrt(d_hidden) * scale
    def f(X):
        return np.tanh(X @ W1 + b1) @ W2
    return f


def gen_synthetic(n=6000, d=16, K=5, confounding=1.5, noise=3.0, seed=0):
    """Returns a dict with observed (X, T, Yobs) for training and the full
    ground-truth potential-outcome means Ymean (n, K) for evaluation only.

    Confounding: patients self-select toward choices that are good FOR THEM,
    so the observed outcomes of each choice are optimistically biased -> naive
    aggregation over "similar patients who chose k" overrates selected choices.
    """
    rng = np.random.default_rng(seed)
    X = rng.normal(size=(n, d)).astype(np.float32)

    base = _rand_mlp(rng, d, scale=8.0)
    base_y = base(X) + 60.0  # center recovery score ~60
    effects = np.stack([_rand_mlp(rng, d, scale=12.0)(X) for _ in range(K)], axis=1)  # (n,K)
    Ymean = (base_y[:, None] + effects).astype(np.float32)  # noiseless potential outcomes
    Yall = (Ymean + rng.normal(scale=noise, size=(n, K))).astype(np.float32)  # realized
    best_k = Ymean.argmax(axis=1)

    # Confounded assignment: base preference on X + self-selection toward good-for-me choices
    pref = np.stack([_rand_mlp(rng, d, scale=1.0)(X) for _ in range(K)], axis=1)
    centered = Ymean - Ymean.mean(axis=1, keepdims=True)
    logits = confounding * pref + 1.0 * (centered / (centered.std() + 1e-6))
    logits -= logits.max(axis=1, keepdims=True)
    P = np.exp(logits)
    P /= P.sum(axis=1, keepdims=True)
    T = np.array([rng.choice(K, p=P[i]) for i in range(n)], dtype=np.int64)
    Yobs = Yall[np.arange(n), T].astype(np.float32)

    # standardize features on train stats
    n_test = n // 5
    idx = rng.permutation(n)
    te, tr = idx[:n_test], idx[n_test:]
    mu, sd = X[tr].mean(0), X[tr].std(0) + 1e-6
    Xs = ((X - mu) / sd).astype(np.float32)
    # standardize outcome for stable NN training (store scale to invert)
    y_mu, y_sd = float(Yobs[tr].mean()), float(Yobs[tr].std() + 1e-6)

    return dict(
        d=d, K=K, y_mu=y_mu, y_sd=y_sd,
        Xtr=Xs[tr], Ttr=T[tr], Ytr=Yobs[tr],
        Xte=Xs[te], Tte=T[te], Yte=Yobs[te],
        Ymean_tr=Ymean[tr], Ymean_te=Ymean[te], best_te=best_k[te],
    )


def save_data(data, path="data.npz"):
    np.savez(path, **{k: v for k, v in data.items() if isinstance(v, np.ndarray)},
             meta=json.dumps({k: v for k, v in data.items() if not isinstance(v, np.ndarray)}))


def load_data(path="data.npz"):
    z = np.load(path, allow_pickle=True)
    data = {k: z[k] for k in z.files if k != "meta"}
    data.update(json.loads(str(z["meta"])))
    return data


# ----- metrics (all use ground-truth noiseless potential outcomes) -----
def policy_regret(Ymean_te, rec_k):
    """Avg gap between the true-best choice's outcome and the recommended one."""
    n = Ymean_te.shape[0]
    best = Ymean_te.max(axis=1)
    got = Ymean_te[np.arange(n), rec_k]
    return float((best - got).mean())


def po_rmse(Ymean_te, Yhat_all):
    """RMSE of predicted potential outcomes vs ground truth (counterfactual fit)."""
    return float(np.sqrt(((Yhat_all - Ymean_te) ** 2).mean()))


def best_acc(best_te, rec_k):
    return float((best_te == rec_k).mean())


def gaussian_nll(Ymean_te, mu_all, var_all):
    """Calibration proxy: NLL of the true outcomes under predicted Gaussians."""
    var = np.clip(var_all, 1e-3, None)
    return float((0.5 * np.log(2 * np.pi * var) + (Ymean_te - mu_all) ** 2 / (2 * var)).mean())
