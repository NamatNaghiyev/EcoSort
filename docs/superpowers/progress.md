# SDD ledger — plan: docs/superpowers/plans/2026-10-09-ecosort-suite.md
Ruling: Proceed within user's explicit all-features authorization; no repeated planning approval — task already specified and approved in prior answer.
Ruling: No automatic multi-object detector weights exist; implement real manual-region classification and sampled video, expose detector absence honestly.
Pre-flight: domain decision contract feeds API and browser; labels are class_names.json. Report schema consumed by quality page.
Task 1: complete — authoritative CLI/web inference and conservative decision rules, domain tests passed.
Task 2: complete — non-destructive hash audit and actual batched evaluation of 901 attempted test images; 898 accepted, 3 rejected; accuracy 97.216%, macro F1 97.316%. Audit: 37 exact duplicate groups across splits; labels only partially visually audited. Rejected files reported explicitly.
Task 3: complete — six UI extensions, history corrections, exports, video sampling and manual multi-region classification. JS pure rules 6/6 pass.
Final review: fresh reviewer found no Critical and four Important findings; all fixed with regression tests: pending camera navigation, corrected media propagation, crop cancellation/export visibility, CSV probability evidence. Reverted-fix run reproduced four failures; restored run 4/4 passed. Python whole suite 10/10, JS whole suite 10/10.
Ruling: Keep measured test result audit-qualified; do not claim production accuracy or silently remove/relabel source images. Cost if wrong: external accuracy claim would be misleading.
Final: minor split metadata issue fixed while correcting rejected-input evaluation; dataset split is derived from provided root, path recorded.
