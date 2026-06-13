"""Naive and KNN ("patients-like-you", benney-style) baselines."""
import numpy as np
from common import policy_regret, po_rmse, best_acc


def naive(data):
    """Per-arm global mean of observed outcomes (ignores patient features)."""
    K = data["K"]
    arm_mean = np.array([data["Ytr"][data["Ttr"] == k].mean() if (data["Ttr"] == k).any()
                         else data["Ytr"].mean() for k in range(K)])
    Yhat = np.tile(arm_mean, (len(data["Xte"]), 1))
    rec = Yhat.argmax(axis=1)
    return _scores("Naive (global per-arm mean)", data, Yhat, rec)


def knn(data, k_neighbors=50):
    """benney-style: for each patient, look at k nearest patients; per choice,
    average the observed outcome of neighbors who made that choice.
    Biased: neighbors who chose c are a selected subpopulation."""
    Xtr, Ttr, Ytr = data["Xtr"], data["Ttr"], data["Ytr"]
    Xte, K = data["Xte"], data["K"]
    global_mean = Ytr.mean()
    Yhat = np.full((len(Xte), K), global_mean, dtype=np.float64)
    # brute-force KNN (cohort is small)
    for i in range(len(Xte)):
        d2 = ((Xtr - Xte[i]) ** 2).sum(axis=1)
        nn = np.argpartition(d2, k_neighbors)[:k_neighbors]
        tt, yy = Ttr[nn], Ytr[nn]
        for c in range(K):
            m = tt == c
            if m.any():
                Yhat[i, c] = yy[m].mean()
    rec = Yhat.argmax(axis=1)
    return _scores(f"KNN patients-like-you (k={k_neighbors})", data, Yhat, rec)


def _scores(name, data, Yhat, rec):
    return dict(
        method=name,
        regret=policy_regret(data["Ymean_te"], rec),
        po_rmse=po_rmse(data["Ymean_te"], Yhat),
        best_acc=best_acc(data["best_te"], rec),
    )


def run_baselines(data):
    return [naive(data), knn(data)]
