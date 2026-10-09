"""Read-only dataset audit. Names are warnings, never ground-truth relabels."""
import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}


def audit_entries(entries):
    counts, hashes = Counter(), defaultdict(list)
    warnings = []
    for path, digest in entries:
        parts = Path(path).parts
        if len(parts) != 3 or parts[0] not in {'train', 'val', 'test'}:
            continue
        split, label, name = parts
        counts[f'{split}/{label}'] += 1
        hashes[digest].append(path)
        if label == 'glass' and name.lower().startswith('papier_carton'):
            warnings.append(path)
    duplicates = [paths for paths in hashes.values() if len({p.split('/')[0] for p in paths}) > 1]
    return {'counts': dict(sorted(counts.items())), 'cross_split_duplicates': len(duplicates),
            'duplicate_examples': duplicates[:20], 'filename_warnings': len(warnings),
            'filename_examples': warnings[:10], 'label_review': 'partial_visual_review',
            'notes': ['Fayl adları etiket səhvinin sübutu deyil. Baxılmış şüşə nümunələri düzgün etiketlidir.',
                      'Bütün şəkillərin məzmunu və yaxın dublikatları vizual yoxlanmayıb.']}


def audit_dataset(root):
    root = Path(root)
    return audit_entries((p.relative_to(root).as_posix(), hashlib.sha256(p.read_bytes()).hexdigest())
                         for p in sorted(root.rglob('*')) if p.is_file() and p.suffix.lower() in EXTENSIONS)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', nargs='?', default='dataset')
    parser.add_argument('--manifest', help='Git tree JSON for full exact-content hash audit')
    parser.add_argument('--output', default='reports/dataset_audit.json')
    args = parser.parse_args()
    if args.manifest:
        tree = json.loads(Path(args.manifest).read_text())
        report = audit_entries((t['path'][8:], t['sha']) for t in tree['tree']
                               if t['type'] == 'blob' and t['path'].startswith('dataset/')
                               and Path(t['path']).suffix.lower() in EXTENSIONS)
        report['repository_commit'] = tree['sha']
    else:
        report = audit_dataset(args.root)
    output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
