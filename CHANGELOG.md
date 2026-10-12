# Changelog

## 0.0.3 — experimental source — 12 October 2026

- Publish the experimental source with GitHub installation/update/removal guidance, an owner-qualified example and optional preparer paths, while retaining a documented local-source alternative and material AI/evidence-availability disclosures.

- Document the experimental version/migration policy, material Codex assistance and availability limits for developer tests/evidence excluded from the public source package. No authoring or manifest migration is required from 0.0.2.
- Reject missing or malformed embedding input/chunk/truncation metadata before accepting a vector, preserving the pinned single-chunk, no-truncation profile.
- Build one bounded lexical index per page and reuse token sets, exact-ID lookup and word postings for subsequent searches, preserving scores, excerpts, ties and error behavior.
- Coalesce model download progress at cumulative 1 MiB steps plus exact completion, reducing worker messages without changing byte verification.
- Clear stale result/proposal announcements when the question changes and associate loading consent with its model-size/licence description. Avoid repeating unchanged status text.

## 0.0.2 — local development candidate — 12 October 2026

- Add explicit offline asset preparation from exact caller-installed LiteRT-LM, wasm-utils and esbuild packages plus separately acquired pinned model files. Verify model/WASM bytes, preserve notices and record an exact deployment resource inventory; refuse overwrites and clean owned partial output.
- Publish only the explicitly configured bounded manifest automatically, resolving document-relative and project-root paths for nested pages and site subpaths. SDK, WASM and models require an explicit author resource list.
- Add optional semantic discovery beyond lexical matches, content/profile-bound session vector reuse, reset controls and bounded loading-stage feedback.
- Bind proposal and embedding provenance to the exact question, evidence content, snapshot, prompt/profile and vector. Tighten manifest/request validation, timeout and stale-worker cleanup; use a classic bootstrap compatible with the pinned SDK's WASM loader.
- Preserve static sources/search, explicit reader confirmation, cancellation/release and plain-text unreviewed proposals. Document the optional Node.js 24 author workflow and current experimental limits; source publication, generation-model acceptance and accessibility conformance are not claimed.

## 0.0.1 — initial local development — 12 October 2026

- Begin Local AI Websites AI-0/AI-1 with explicit native sources, static fallback and deterministic source lookup.
- Develop separately scoped browser-local generation and embedding lifecycle adapters, with EmbeddingGemma 2 and Gemma 4 E2B preferences.
- Keep models, third-party runtime binaries, developer tools and evidence outside the lean source package. No source publication, model quality, manual accessibility acceptance or deployment is claimed.
