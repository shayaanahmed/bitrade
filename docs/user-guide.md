# User Guide

1. Keep using **Trade**, **Strategies**, **Signals**, **Coin universe**, and **Wallet** as before.
2. Open **Research**. In **Data**, inspect sources or import canonical CSV/Parquet commodity data.
3. In **Experiments**, select provider, symbol, timeframe, dates, strategies, costs, and risk. Run the experiment. Missing provider history is fetched, completed candles are validated, and the result is persisted.
4. In **Results**, compare net return, drawdown, Sharpe, Sortino, Calmar, win rate, exposure, turnover, costs, and VaR. Dataset snapshots, code version, seed, and timing form the reproduction record.
5. In **Training**, choose a meta-model. Strategy exposures become ordered features, labels mature three bars later, and chronological train/validation/test plus walk-forward evaluation runs.
6. In **Models**, review challenger evidence. Promotion and rejection require a reason. Validate an imported JSON bundle before use.
7. In **Paper**, create a session from the last validated bundle and use start, process the latest unseen completed candle, pause, resume, or emergency stop. State and event checksums survive restart.

Do not interpret research output as financial advice. Backtest performance is not evidence of future results. Prefer stable out-of-sample, cost-adjusted performance over headline return.
