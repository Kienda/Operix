# Complete advisory inventory

The baseline audit reproduces 35 findings. Every original dependency path is preserved in [backend-before.json](backend-before.json). Counts include separate records for different affected-version ranges. All records are absent from [the final audit](backend-after.json).

| Severity | Advisory | Package | Baseline | Patched range | Final |
| --- | --- | --- | --- | --- | --- |
| moderate | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | esbuild | 0.21.5 | >=0.24.3 | 0.28.1 |
| moderate | [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) | vite | 5.4.21 | >=6.4.2 | 8.2.0 |
| moderate | [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | vite | 5.4.21 | >=6.4.3 | 8.2.0 |
| high | [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | vite | 5.4.21 | >=6.4.3 | 8.2.0 |
| high | [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | nanoid | 3.3.17 | >=3.3.18 | 3.3.18 |
| high | [GHSA-pm4m-ph32-ghv5](https://github.com/advisories/GHSA-pm4m-ph32-ghv5) | js-yaml | 5.2.1 | >=5.2.2 | 4.3.2, 5.4.2 |
| critical | [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) | vitest | 2.1.9 | >=3.2.6 | 4.1.11 |
| high | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) | deepmerge-ts | 7.1.5 | >=8.0.0 | 8.0.2 |
| moderate | [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) | qs | 6.15.3 | >=6.15.4 | 6.16.0 |
| moderate | [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) | qs | 6.15.3 | >=6.16.0 | 6.16.0 |
| high | [GHSA-5jgf-p345-68v8](https://github.com/advisories/GHSA-5jgf-p345-68v8) | fast-uri | 3.1.5 | >=3.1.6 | 3.1.8 |
| high | [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc) | fast-uri | 3.1.5 | >=3.1.6 | 3.1.8 |
| high | [GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf) | fast-uri | 3.1.5 | >=3.1.6 | 3.1.8 |
| high | [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp) | fast-uri | 3.1.5 | >=3.1.6 | 3.1.8 |
| moderate | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | vitest | 2.1.9 | >=4.1.11 | 4.1.11 |
| moderate | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | @vitest/mocker | 2.1.9 | >=4.1.11 | 4.1.11 |
| high | [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) | js-yaml | 4.3.1 | >=4.3.2 | 4.3.2, 5.4.2 |
| high | [GHSA-wc9g-mqfw-jrwm](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm) | multer | 2.2.0 | >=2.3.0 | 2.4.0 |
| high | [GHSA-qfvm-cv95-jqjf](https://github.com/advisories/GHSA-qfvm-cv95-jqjf) | multer | 2.2.0 | not specified; affected =2.2.0 | 2.4.0 |
| low | [GHSA-qvfw-j98x-7q72](https://github.com/advisories/GHSA-qvfw-j98x-7q72) | multer | 2.2.0 | >=2.3.0 | 2.4.0 |
| high | [GHSA-535w-7cp7-47q4](https://github.com/advisories/GHSA-535w-7cp7-47q4) | multer | 2.2.0 | >=2.3.0 | 2.4.0 |
| moderate | [GHSA-3pph-fpjx-jg34](https://github.com/advisories/GHSA-3pph-fpjx-jg34) | multer | 2.2.0 | >=2.4.0 | 2.4.0 |
| high | [GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3) | fast-uri | 3.1.5 | >=3.1.7 | 3.1.8 |
| moderate | [GHSA-r3ph-w7gj-g6xm](https://github.com/advisories/GHSA-r3ph-w7gj-g6xm) | js-yaml | 5.2.1 | >=5.4.1 | 4.3.2, 5.4.2 |
| moderate | [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj) | fast-uri | 3.1.5 | >=3.1.8 | 3.1.8 |
| moderate | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | brace-expansion | 1.1.18 | >=1.1.21 | 1.1.21, 5.0.12 |
| moderate | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | brace-expansion | 5.0.9 | >=5.0.12 | 1.1.21, 5.0.12 |
| high | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | brace-expansion | 1.1.18 | >=1.1.20 | 1.1.21, 5.0.12 |
| high | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | brace-expansion | 5.0.9 | >=5.0.11 | 1.1.21, 5.0.12 |
| high | [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | brace-expansion | 1.1.18 | >=1.1.19 | 1.1.21, 5.0.12 |
| high | [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | brace-expansion | 5.0.9 | >=5.0.10 | 1.1.21, 5.0.12 |
| high | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | source-map-js | 1.2.1 | >=1.2.2 | 1.2.2 |
| critical | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | proxy-addr | 2.0.7 | >=2.0.8 | 2.0.8 |
| critical | [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) | tinypool | 1.1.1 | >=2.1.1 | removed |
| critical | [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) | tinypool | 1.1.1 | >=2.1.2 | removed |
