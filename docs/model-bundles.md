# Portable Model Bundle 1.0

A bundle is JSON and contains the compatibility version, manifest, serialized safe model representation, ordered numeric feature schema, preprocessing policy, strategy configurations, warm-up, timeframe, decision threshold, risk-policy reference, training metadata, model card, and test vectors.

The manifest checksum covers the serialized model. Import recalculates it, checks compatibility and exact feature order, then runs every vector with a `1e-10` numeric tolerance and exact direction equality. Corrupt, incompatible, or reordered bundles are rejected.

The native fallback stores numbers and decision stumps as JSON, never executable code or arbitrary object serialization. ONNX is not emitted for the built-in pure-TypeScript estimators; the manifest identifies the safe native representation. Inference outputs are venue-independent. Venue order construction is deliberately excluded.
