# EcoSort integrated demo specification

Goal: Extend the existing Flask waste classifier into an honest hackathon demonstration of image/video classification, human review, robot sorting and environmental scenario analysis. All six additions requested by the user are in scope. Preserve the warm-grey, white and dark-green Azerbaijani workspace.

## Flow
- Single image inference keeps the existing 5 labels, top three probabilities, validation and local history. Shared JSON class order and model-internal preprocessing are authoritative.
- Every prediction includes a conservative sorting decision: confidence >=75% and top-two margin >=15 percentage points, otherwise manual review. These are demo policy thresholds, not a calibrated guarantee. Organic bypasses the robot. Metal requires user-confirmed ferromagnetism; generic metal does not imply magnetic attraction.
- ReflexGrip canvas animation shows conveyor, sensing, decision, grasp/slip/regrasp/release and destination. User sets mass, friction, maximum grip, belt speed and metal subtype; computed normal force is m*g*safety/(2*mu), two opposing fingers, torque is estimated m*g*lever*safety. Unknown/review cannot execute automatically. No hardware commands. Label all physical values as assumptions/simulation.
- Operator correction edits only the effective label, retains original prediction/probabilities, reviewer time and correction state; exports JSON/CSV for later review and retraining. Does not imply online learning. Persist browser-local, max 50 records, honest storage limitation.
- Quality page loads an actual evaluation JSON, class metrics, confusion matrix, error samples, model SHA, dataset split and audit warnings. Metrics have audit-qualified status until labels validated. Offline CLI can regenerate metrics and detect duplicate hashes across splits and suspicious names; no silent relabeling or dataset deletion.
- Impact calculator uses manual subtype/mass, accepted fraction and additional operating emissions; explicit baseline and units, EPA WARM v16 recycling credit vs virgin manufacture. No fabricated organic factor or photo-inferred mass. Shows assumptions and editable custom baseline/project factors for local scenarios.
- Video upload/browser camera samples frames, calls existing API sequentially, bounded sampling/cancellation, reports classifications with timestamps. No claim that classifier detects objects. Multi-object mode allows up to 10 user-drawn crop boxes, classifies crops individually. Mark as manual regions; automatic detection remains unavailable without a trained detection model.

## Validation
Test label/preprocessing consistency, conservative decision, magnetic routing, finite physical inputs and force/torque math, emissions conversion and invalid inputs, correction retention, metric calculation/audit, API validation and actual model inference. Browser-check navigation, image-to-simulation, corrections/export, video/crops, physics and impact forms, mobile layout. Keep published accuracy separate from unverified labels.

## Delivery
Isolated feature branch, GitHub PR, verified preview deployment for the existing Vercel project when possible. Do not force push or alter datasets based on filenames alone.
