from ml.preprocess import run_preprocessing
from ml.train_lightgbm import train_lightgbm
from ml.train_lstm import train_lstm
from ml.evaluate_models import run_evaluation


def main():
    print("=== Step 1/4: Preprocessing M5 Dataset ===")
    run_preprocessing()

    print("\n=== Step 2/4: Training LightGBM Direct Multi-Step Forecaster ===")
    train_lightgbm()

    print("\n=== Step 3/4: Training PyTorch LSTM Forecaster ===")
    train_lstm()

    print("\n=== Step 4/4: Evaluating & Comparing All Models ===")
    run_evaluation()


if __name__ == "__main__":
    main()
