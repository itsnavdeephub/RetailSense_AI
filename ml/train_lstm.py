import json
import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.preprocessing import StandardScaler
from torch.utils.data import DataLoader, TensorDataset

from ml.config import (
    DATASETS_DIR,
    FORECAST_HORIZON,
    LSTM_SEQ_LEN,
    MODELS_DIR,
    RANDOM_SEED,
    RESULTS_DIR,
    TRAIN_END_D,
    VAL_ORIGINS,
)
from ml.features import fit_feature_metadata
from ml.metrics import compute_all_metrics


class RetailLSTM(nn.Module):
    """
    PyTorch LSTM architecture:
    - Input sequence: 28 historical days
    - First LSTM layer: 64 hidden units
    - Second LSTM layer: 32 hidden units
    - Dropout layer
    - Fully connected layer
    - Output layer predicting next 7 days (non-negative)
    """

    def __init__(self, input_size: int, horizon: int = FORECAST_HORIZON):
        super().__init__()
        self.lstm1 = nn.LSTM(input_size=input_size, hidden_size=64, batch_first=True)
        self.lstm2 = nn.LSTM(input_size=64, hidden_size=32, batch_first=True)
        self.dropout = nn.Dropout(p=0.2)
        self.fc = nn.Linear(32, 32)
        self.act = nn.ReLU()
        self.out = nn.Linear(32, horizon)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out1, _ = self.lstm1(x)
        out2, _ = self.lstm2(out1)
        last_hidden = out2[:, -1, :]
        dropped = self.dropout(last_hidden)
        hidden = self.act(self.fc(dropped))
        preds = self.out(hidden)
        return preds


def _extract_day_features(grp: pd.DataFrame, item_stat: dict) -> np.ndarray:
    """Build per-day feature matrix (N_days, 9) using only past/contemporaneous features."""
    sales = grp["sales"].values.astype(np.float32)
    log_sales = np.log1p(sales)
    price = grp["sell_price"].values.astype(np.float32)
    rel_price = price / max(item_stat["price_mean"], 1e-6)
    wday = grp["wday"].values.astype(np.float32)
    month = grp["month"].values.astype(np.float32)
    dow_sin = np.sin(2.0 * np.pi * (wday - 1.0) / 7.0)
    dow_cos = np.cos(2.0 * np.pi * (wday - 1.0) / 7.0)
    mon_sin = np.sin(2.0 * np.pi * (month - 1.0) / 12.0)
    mon_cos = np.cos(2.0 * np.pi * (month - 1.0) / 12.0)
    has_event = (grp["event_type_1"].values != "None").astype(np.float32)
    snap_ca = grp["snap_CA"].values.astype(np.float32)
    item_mean_arr = np.full_like(sales, np.log1p(item_stat["train_mean"]), dtype=np.float32)

    feats = np.stack(
        [
            log_sales,
            item_mean_arr,
            rel_price,
            dow_sin,
            dow_cos,
            mon_sin,
            mon_cos,
            has_event,
            snap_ca,
        ],
        axis=1,
    )
    return feats.astype(np.float32)


def build_lstm_sequences(
    df: pd.DataFrame,
    meta: dict,
    origin_d_indices: list[int],
    seq_len: int = LSTM_SEQ_LEN,
    horizon: int = FORECAST_HORIZON,
    include_target: bool = True,
):
    X_list, y_list, meta_rows = [], [], []
    item_stats = meta["item_stats"]

    for item_id, grp in df.groupby("item_id", sort=True):
        grp = grp.sort_values("d_idx").reset_index(drop=True)
        d_to_pos = {int(d): idx for idx, d in enumerate(grp["d_idx"].values)}
        day_feats = _extract_day_features(grp, item_stats[item_id])
        sales_arr = grp["sales"].values.astype(np.float32)
        date_arr = grp["date"].values
        d_idx_arr = grp["d_idx"].values.astype(np.int32)

        for orig_d in origin_d_indices:
            if orig_d not in d_to_pos:
                continue
            t_pos = d_to_pos[orig_d]
            if t_pos < seq_len - 1:
                continue
            if include_target and (t_pos + horizon >= len(grp)):
                continue

            seq_x = day_feats[t_pos - seq_len + 1 : t_pos + 1]
            X_list.append(seq_x)

            if include_target:
                y_seq = np.log1p(sales_arr[t_pos + 1 : t_pos + 1 + horizon])
                y_list.append(y_seq)

            meta_rows.append(
                {
                    "item_id": item_id,
                    "origin_d_idx": int(d_idx_arr[t_pos]),
                    "origin_date": str(pd.Timestamp(date_arr[t_pos]).date()),
                }
            )

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.float32) if include_target else None
    return X, y, meta_rows


def train_lstm(epochs: int = 45, batch_size: int = 128, lr: float = 1e-3) -> dict:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    torch.manual_seed(RANDOM_SEED)
    np.random.seed(RANDOM_SEED)

    df = pd.read_pickle(DATASETS_DIR / "processed_sales.pkl")
    meta = fit_feature_metadata(df)

    # Fit scaler strictly on training rows (d_idx <= TRAIN_END_D)
    train_df = df[df["d_idx"] <= TRAIN_END_D]
    raw_train_feats = []
    for item_id, grp in train_df.groupby("item_id", sort=True):
        grp = grp.sort_values("d_idx").reset_index(drop=True)
        raw_train_feats.append(_extract_day_features(grp, meta["item_stats"][item_id]))
    scaler = StandardScaler()
    scaler.fit(np.vstack(raw_train_feats))

    # Build train sequences from last 900 days of training split
    train_start_orig = max(LSTM_SEQ_LEN, TRAIN_END_D - 900)
    train_origins = list(range(train_start_orig, TRAIN_END_D - FORECAST_HORIZON + 1, 2))
    recent_origins = list(range(TRAIN_END_D - 200, TRAIN_END_D - FORECAST_HORIZON + 1))
    train_origins = sorted(set(train_origins + recent_origins))

    X_train_raw, y_train, _ = build_lstm_sequences(df, meta, train_origins, include_target=True)
    X_val_raw, y_val, val_meta = build_lstm_sequences(df, meta, VAL_ORIGINS, include_target=True)

    # Apply training-fitted scaler across sequence features
    n_feats = X_train_raw.shape[2]
    X_train = scaler.transform(X_train_raw.reshape(-1, n_feats)).reshape(X_train_raw.shape).astype(np.float32)
    X_val = scaler.transform(X_val_raw.reshape(-1, n_feats)).reshape(X_val_raw.shape).astype(np.float32)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = RetailLSTM(input_size=n_feats, horizon=FORECAST_HORIZON).to(device)
    criterion = nn.SmoothL1Loss(beta=0.25)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="min", factor=0.5, patience=4)

    train_loader = DataLoader(
        TensorDataset(torch.from_numpy(X_train), torch.from_numpy(y_train)),
        batch_size=batch_size,
        shuffle=True,
    )

    X_val_t = torch.from_numpy(X_val).to(device)
    y_val_t = torch.from_numpy(y_val).to(device)
    y_val_actual = np.expm1(y_val).clip(min=0.0)

    best_val_loss = float("inf")
    best_epoch = 0
    patience = 10
    no_improve = 0
    history = []

    ckpt_path = MODELS_DIR / "lstm_best.pt"

    for epoch in range(1, epochs + 1):
        model.train()
        train_losses = []
        for bx, by in train_loader:
            bx, by = bx.to(device), by.to(device)
            optimizer.zero_grad()
            out = model(bx)
            loss = criterion(out, by)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            train_losses.append(float(loss.item()))

        model.eval()
        with torch.no_grad():
            val_out = model(X_val_t)
            val_loss = float(criterion(val_out, y_val_t).item())
            val_pred_units = np.clip(np.expm1(val_out.cpu().numpy()), 0.0, None)
            val_mae = float(np.mean(np.abs(y_val_actual - val_pred_units)))

        train_loss = float(np.mean(train_losses))
        scheduler.step(val_loss)
        history.append(
            {
                "epoch": epoch,
                "train_loss": round(train_loss, 5),
                "val_loss": round(val_loss, 5),
                "val_mae": round(val_mae, 4),
            }
        )

        if val_loss < best_val_loss - 1e-5:
            best_val_loss = val_loss
            best_epoch = epoch
            no_improve = 0
            torch.save(
                {
                    "model_state_dict": model.state_dict(),
                    "input_size": n_feats,
                    "horizon": FORECAST_HORIZON,
                    "seq_len": LSTM_SEQ_LEN,
                    "best_epoch": best_epoch,
                    "best_val_loss": best_val_loss,
                },
                ckpt_path,
            )
        else:
            no_improve += 1

        if epoch % 5 == 0 or epoch == 1:
            print(f"Epoch {epoch:02d}/{epochs} | train_loss={train_loss:.5f} | val_loss={val_loss:.5f} | val_mae={val_mae:.4f}")

        if no_improve >= patience:
            print(f"Early stopping triggered at epoch {epoch} (best epoch: {best_epoch}).")
            break

    # Load best checkpoint and evaluate on validation set
    ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()
    with torch.no_grad():
        val_pred_log = model(X_val_t).cpu().numpy()
    val_pred_units = np.clip(np.expm1(val_pred_log), 0.0, None)
    val_metrics = compute_all_metrics(y_val_actual.flatten(), val_pred_units.flatten())

    joblib.dump({"scaler": scaler, "meta": meta}, MODELS_DIR / "lstm_preprocessing.joblib")
    with open(RESULTS_DIR / "lstm_training_history.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "best_epoch": best_epoch,
                "best_val_loss": round(best_val_loss, 5),
                "total_epochs_run": len(history),
                "early_stopped": no_improve >= patience,
                "val_metrics": val_metrics,
                "history": history,
            },
            f,
            indent=2,
        )

    print(f"LSTM best checkpoint saved (epoch {best_epoch}). Validation metrics: {val_metrics}")
    return {"val_metrics": val_metrics, "best_epoch": best_epoch}


if __name__ == "__main__":
    train_lstm()
