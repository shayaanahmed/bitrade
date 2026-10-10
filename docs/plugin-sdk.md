# Plugin SDK

All plugins expose `id`, `name`, `kind`, semantic `version`, `interfaceVersion: "1.0"`, description, and determinism. `pluginCatalog()` rejects unsupported interface versions.

Indicators declare required candle columns, validated parameters, warm-up bars, output columns, and missing-value policy. `calculate()` must return one value per input candle for every output. Values before warm-up are `null`; future filling is forbidden.

Strategies declare required fields, market types, supported timeframes, warm-up, data sources, and indicator dependencies. `generate()` returns one normalized signal per candle containing timestamp, direction `-1/0/+1`, confidence `0..1`, desired exposure `-1..1`, optional stop/target, metadata, strategy version, and configuration hash.

To add a plugin:

1. Implement the corresponding interface in `lib/platform/contracts.ts`.
2. Use an immutable unique ID and increment the plugin version for behavioral changes.
3. Register it in the appropriate catalog; never add a provider/strategy conditional to core orchestration.
4. Add golden values and a prefix-stability test proving output at `t` does not change when bars after `t` are added.
5. Document parameter units, warm-up, missing values, and supported markets.

The shipped catalog includes Binance Spot, Binance USD-M Futures, Alpha Vantage commodities, CSV and Parquet imports; 18 indicators; 11 strategies; exposure/drawdown risk; next-bar and volume-participation execution; fee/spread/impact models; five ensemble contracts; and risk-adjusted metrics.
