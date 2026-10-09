"""Evaluate actual saved weights. No training, augmentation or relabeling."""
import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def calculate_metrics(truth, predictions, labels):
    if len(truth) != len(predictions) or not truth:
        raise ValueError('Nonempty truth/prediction lengths must match')
    lookup = {label: i for i, label in enumerate(labels)}
    matrix = [[0 for _ in labels] for _ in labels]
    for actual, predicted in zip(truth, predictions):
        matrix[lookup[actual]][lookup[predicted]] += 1
    classes = []
    for i, label in enumerate(labels):
        tp = matrix[i][i]; support = sum(matrix[i]); called = sum(row[i] for row in matrix)
        precision = tp / called if called else 0
        recall = tp / support if support else 0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
        classes.append({'label': label, 'precision': precision, 'recall': recall, 'f1': f1, 'support': support})
    return {'accuracy': sum(matrix[i][i] for i in range(len(labels))) / len(truth),
            'macro_f1': sum(r['f1'] for r in classes) / len(labels), 'sample_count': len(truth),
            'classes': classes, 'confusion_matrix': matrix, 'labels': list(labels)}


def evaluate(root, limit=None):
    import numpy as np
    from app import CLASS_NAMES, WEIGHTS_PATH, prepare_image, get_model
    root = Path(root)
    truth, predictions, errors, rejected, pending = [], [], [], [], []
    digest = hashlib.sha256()
    attempted = 0

    def flush():
        if not pending:
            return
        batches = np.concatenate([item[2] for item in pending], axis=0)
        probs = np.asarray(get_model()(batches, training=False))
        for (label, path, _), scores in zip(pending, probs):
            if scores.shape != (len(CLASS_NAMES),) or not np.isfinite(scores).all():
                raise RuntimeError('Invalid model output during evaluation')
            index = int(np.argmax(scores)); predicted = CLASS_NAMES[index]
            truth.append(label); predictions.append(predicted)
            if predicted != label and len(errors) < 25:
                errors.append({'path': f'{label}/{path.name}', 'actual': label, 'predicted': predicted,
                               'confidence': round(float(scores[index]) * 100, 2)})
        pending.clear()

    for label in CLASS_NAMES:
        paths = sorted(p for p in (root / label).glob('*') if p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp', '.bmp'})
        if limit: paths = paths[:limit]
        for path in paths:
            attempted += 1
            image_bytes = path.read_bytes()
            digest.update(f'{label}/{path.name}'.encode()); digest.update(hashlib.sha256(image_bytes).digest())
            try:
                batch = prepare_image(path)
            except ValueError as exc:
                rejected.append({'path': f'{label}/{path.name}', 'reason': str(exc)})
                continue
            pending.append((label, path, batch))
            if len(pending) >= 32:
                flush()
        flush()
        print(f'{label}: {len(paths)} attempted', flush=True)
    metrics = calculate_metrics(truth, predictions, CLASS_NAMES)
    return {**metrics, 'status': 'evaluated', 'evaluated_at': datetime.now(timezone.utc).isoformat(),
            'model_sha256': hashlib.sha256(WEIGHTS_PATH.read_bytes()).hexdigest(),
            'dataset_sha256': digest.hexdigest(), 'split': root.name, 'dataset_path': str(root),
            'limited_per_class': limit, 'attempted_count': attempted, 'rejected_count': len(rejected),
            'rejected_examples': rejected[:25], 'label_audit_status': 'partial_visual_review',
            'error_examples': errors,
            'limitations': ['Metriklər yalnız qəbul edilən şəkillər üzrədir; rədd olunan fayllar ayrıca göstərilir.',
                            'Bu metriklər mövcud etiketlərə əsaslanır; bütün etiketlər vizual təsdiqlənməyib.',
                            'Yeni konveyer şəraitində dəqiqlik ayrıca ölçülməlidir.',
                            'Softmax göstəriciləri kalibrasiya olunmayıb; bu rəqəmlər obyekt aşkarlama dəqiqliyi deyil.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', default='dataset/test')
    parser.add_argument('--output', default='reports/evaluation.json')
    parser.add_argument('--limit-per-class', type=int)
    parser.add_argument('--audit', default='reports/dataset_audit.json')
    args = parser.parse_args()
    report = evaluate(Path(args.dataset), args.limit_per_class)
    audit = Path(args.audit)
    if audit.exists(): report['dataset_audit'] = json.loads(audit.read_text())
    output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Accuracy: {report['accuracy']:.4f}; macro F1: {report['macro_f1']:.4f}")
