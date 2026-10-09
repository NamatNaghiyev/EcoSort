# EcoSort Suite Implementation Plan

> Execute inline with superpowers:executing-plans; user authorized all proposed work.

**Goal:** Deliver all six requested extensions without misrepresenting model or hardware capability.
**Architecture:** Existing Flask classifier plus small pure domain module, browser workspace extensions, offline audit/evaluation tools. Browser stores operator corrections and video results.
**Tech Stack:** Python 3.12, Flask, TensorFlow 2.20, vanilla JS, Canvas, pytest, Node tests.
**Spec:** docs/superpowers/specs/2026-10-09-ecosort-suite.md

## Global Constraints
- Azerbaijani copy; preserve grey/green style; no invented accuracy or sensor data.
- Preserve datasets; filenames trigger review, not destructive relabeling.
- Use class_names.json and one model-internal preprocessing pass.
- Simulation policy 75% confidence, 15pp margin; no real robot commands.
- Manual crop regions clearly distinguished from automatic detection.

## Review Focus
- NaN/zero inputs and unsafely low grip force.
- Nonmagnetic metal cannot take the magnet path.
- Corrected history must retain original labels and probabilities.
- Unknown or low-margin predictions cannot sort automatically.
- Aborted video analysis and stale requests cannot mutate a newer session.

### Task 1: Model consistency and domain rules
Files: predict.py, ecosort_domain.py, tests/test_domain.py, tests/test_model.py.
- [ ] Write failing tests for correct labels, raw RGB preprocessing, decision and physics boundaries.
- [ ] Implement shared prediction adapter and pure routing/grip/impact calculations.
- [ ] Run focused tests then suite.

### Task 2: Audit, evaluation and API
Files: tools/audit_dataset.py, tools/evaluate_model.py, app.py, reports/, tests/test_quality.py, tests/test_api.py.
Interfaces: decision_for(label, confidence, top_results, metal_kind); evaluate predictions with authoritative classes.
- [ ] Write failing metric/audit/API tests.
- [ ] Implement non-destructive audit, actual model report and quality endpoint; annotate inference with decision.
- [ ] Run actual evaluation and tests; label audit limits.

### Task 3: Integrated browser features
Files: templates/index.html, static/workspace.js, static/suite.js, static/suite-core.js, static/suite.css, tests/suite.test.cjs.
Interfaces: ecosort:prediction and ecosort:history events; local records retain original/effective labels and corrections.
- [ ] Write failing JS tests for correction/routing/force/impact/crops/cancellation validation.
- [ ] Implement ReflexGrip animation, quality page, impact calculator, video sampling and manual multicrop analysis.
- [ ] Integrate correction and exports into history and selected-result view.
- [ ] Run JS tests, full Python tests and browser QA.

### Task 4: Review and delivery
Files: README.md, requirements-dev.txt, verification record.
- [ ] Review changes with fresh reviewer, fix material findings with tests.
- [ ] Commit, push feature branch, open PR and deploy verified preview.
