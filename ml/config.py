from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATASETS_DIR = BASE_DIR / "datasets"
MODELS_DIR = BASE_DIR / "models"
RESULTS_DIR = BASE_DIR / "results"

# Scope configuration (extensible to multiple stores/departments)
ACTIVE_STORES = ["CA_1"]
ACTIVE_DEPARTMENTS = ["FOODS_3"]
NUM_PRODUCTS = 35

# Chronological split boundaries on M5 evaluation timeline (d_1 .. d_1941)
# d_1 = 2011-01-29, d_1885 = 2016-03-27, d_1913 = 2016-04-24, d_1941 = 2016-05-22
TRAIN_END_D = 1885
VAL_START_D = 1886
VAL_END_D = 1913     # 28 days = 4 rolling 7-day origins
TEST_START_D = 1914
TEST_END_D = 1941    # 28 days = 4 rolling 7-day origins

FORECAST_HORIZON = 7
LSTM_SEQ_LEN = 28
RANDOM_SEED = 42

# Rolling evaluation origins (inclusive day index t where forecast predicts t+1 .. t+7)
VAL_ORIGINS = [1885, 1892, 1899, 1906]
TEST_ORIGINS = [1913, 1920, 1927, 1934]
