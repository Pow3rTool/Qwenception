# Qwenception · Diverging Universes

A serverless, GitHub-Pages-ready explorer for Qwen3.6-27B inference
differences. Pick a canonical BF16/Triton/BF16-key/value-cache hardware run as
the starting point, add up to four valid comparisons, then replay the measured
forks into their retained counterfactual futures.

The site has no package manager, framework, cookies, analytics, API calls, or
external assets. `index.html` is the entry point and `.nojekyll` is already
present.

## What is included

- Four starting points: H200/SM90, B200/SM100, RTX PRO 6000/SM120, and
  GB10/SM121, presented as a prominent baseline-hardware card row.
- 34 retained one-step inference scenarios over SP01, SP03, SP04, and SP06:
  9,060 recorded assistant-output positions in total.
- A frozen P0/P1 comparison matrix. Cross-hardware choices hold Triton
  attention, BF16 weights, and BF16 key/value cache fixed. Same-hardware
  choices change one named attention, weight, or cache coordinate.
- Default-on viewport focus keeps the active fork panel pinned on screen while
  its parallel futures reveal; uncheck it to restore free-scrolling playback.
- All retained outputs in the selected prompt dataset are shown together by
  default, with explicit output-boundary dividers. A deep link can still select
  one exact output range for reproducibility.
- 4,680 recursive futures in 128 static branch shards. Every eligible P0/P1
  pair among H200, B200, SM120, and SM121 has both sides captured.
- The 1,501 SM121 futures retain their exact GB10 runtime and per-case primary
  kernel-cache provenance in the viewer instead of borrowing another platform's
  continuation.
- A frozen 100-token branch policy: 748 balanced tool envelopes, 257 malformed
  structures, 226 prose/no completed tool envelope, and 3,449
  incomplete/indecisive paths at the cap.

Counterfactual tool calls were structurally inspected but never executed. The
recorded route's observed tool result is separate evidence; the viewer never
invents a runtime outcome for a generated call.

## What the measurements mean

Every scored next-token result uses the same recorded prefix. The model is
teacher-forced along the retained assistant output so that changing hardware,
attention implementation, weight format, or key/value-cache format does not
also change the history presented to the next measurement. Raw logits were
captured before the forcing processor; the processor only selects the recorded
token used to advance to the next position.

At a measured disagreement, the replay lanes are separate greedy continuations
rooted at each scenario's captured winner. They run for at most 100 tokens.
These are counterfactual futures, not claims about what the recorded
conversation actually did, and a length-limited branch is labelled
incomplete/indecisive rather than failed.

This export retains the compact values needed by the browser: recorded token
IDs, scenario Top-1 tokens and supporting Top-1 measurements, a token display
dictionary, branch token IDs, and structural grades. It does not contain model
weights, source prompts, raw transcripts, or full-vocabulary logit tensors.

## Experimental provenance

The retained checkpoint coordinates are frozen to these Hugging Face revisions:

| Displayed weight coordinate | Checkpoint | Revision |
|---|---|---|
| BF16 | `Qwen/Qwen3.6-27B` | `5d316fa25c3a0b6251198e9e7a94e863a435536a` |
| Official FP8 | `Qwen/Qwen3.6-27B-FP8` | `e89b16ebf1988b3d6befa7de50abc2d76f26eb09` |
| INT8 W8A16 | `TheHouseOfTheDude/Qwen3.6-27B-INT8` | `0a8f0c72b4546cca4bc6c585f1024d974f12123d` |
| NVIDIA mixed FP8/NVFP4 | `nvidia/Qwen3.6-27B-NVFP4` | `0893e1606ff3d5f97a441f405d5fc541a6bdf404` |
| AWQ INT4 W4A16 | `cyankiwi/Qwen3.6-27B-AWQ-BF16-INT4` | `d39b062fdce81a08e169b31a8eb79aebf40394d3` |

No checkpoint files are distributed here; each remains subject to its upstream
license and terms.

H200/SM90, B200/SM100, and RTX PRO 6000/SM120 used the pinned x86 image
`vllm/vllm-openai:nightly-x86_64@sha256:0db5553091d59de260f67696fff89026e7376ec0d326111ba78fb004a27778a0`,
vLLM `0.27.2rc1.dev110+gacb0f1dcd`, tensor parallelism 1, eager execution,
seed 1, disabled prefix caching, and a 2,048-token chunked-prefill budget.
The full-attention backend is the named comparison coordinate; Qwen's gated
delta-network layers remained on Triton/FLA prefill and CUDA decode.

GB10/SM121 is deliberately marked as a different runtime coordinate. It used
the declared rolling `vllm/vllm-openai:nightly-aarch64` image, vLLM
`0.26.1rc1.dev1219+g46638857f`, and CUDA 13.0. The hosting platform did not
expose its container daemon for an independent image-digest inspection. Do not
read an SM121 comparison as a hardware-only substitution against the pinned
x86 cells. Its recursive branch battery uses that same SM121 runtime
coordinate and records each case's primary kernel-cache provenance.

## Run locally

From this directory:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/>. A static server avoids browser restrictions
that can apply to JavaScript shards opened directly through `file://`.

Deep links use this stable fragment contract:

```text
#dataset=ID&baseline=CASE&runs=CASE[,CASE...]&range=all|INDEX&ties=RULE
```

## Data and publication notes

Compact `generated_tool_calls` metadata replaces argument values with a
placeholder. That is not a privacy boundary: the branch token IDs and public
token dictionary reconstruct the generated text shown by the UI, including
any argument text the model emitted. Build-time source paths are not embedded
in the export, and the structural verifier checks shard integrity and obvious
literal secret/path patterns, but it cannot certify reconstructed text as safe.
A human content review is therefore required before making the repository
public.

The replay text intentionally retains offline lab addresses, paths, URLs, and
host labels because they are part of the measured output. Credential-like
strings are historical capture artifacts: any corresponding live credential
was rotated before public release and is no longer valid. No live
authentication material is intentionally distributed.

Exact-logit ties are an explicit coordinate. Fifty-seven reused branch roots
were captured under the published legacy Top-K tie rule; selecting sampler
argmax makes the viewer warn when it chooses the other equal-logit token.

The static site is a generated publication artifact. `SHA256SUMS` covers the
published bundle, and `build-report.json` records its structural counts. The
private capture pipeline and restricted source transcripts are intentionally
not part of this repository.

## Citation

If you use the replay corpus, measurements, visualizations, or derived
artifacts, please cite:

> Three. *Qwenception: Qwen3.6-27B Diverging Universes*. Version 1.0.0,
> 2026. <https://github.com/Pow3rTool/Qwenception>.

`Three` is the creator's designated pseudonymous attribution name. A
machine-readable [`CITATION.cff`](CITATION.cff) is included so GitHub can
produce APA and BibTeX citations. See [`ATTRIBUTION.md`](ATTRIBUTION.md) for
reuse and adaptation guidance.

## License

Copyright © 2026 Three.

Except where otherwise noted, the original material in this repository is
licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0
International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).
This includes the replay data, catalogs, documentation, visualizations, and
viewer source.

You may reuse and adapt the material for noncommercial purposes. Shared reuse
must credit Three, link to the source and license, and identify modifications.
Shared adaptations must use CC BY-NC-SA 4.0 or a compatible license. The full
legal code is reproduced in [`LICENSE`](LICENSE).

Model names, product names, upstream checkpoints, and other third-party
material remain subject to their respective owners' rights and licenses. The
license grants only those rights the licensor is authorized to grant and does
not imply endorsement by Three or any named third party.
