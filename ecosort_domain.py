"""Conservative demo routing. This policy does not certify hardware safety."""
import math

LABELS = frozenset({'glass', 'metal', 'organic', 'paper', 'plastic'})
CONFIDENCE_THRESHOLD = 75
MARGIN_THRESHOLD = 15


def decision_for(label, confidence, top_results, metal_kind='unknown'):
    result = {'action': 'review', 'destination': 'Əl ilə yoxlama',
              'reason': 'Nəticə avtomatik çeşidləmə üçün kifayət deyil.',
              'policy': {'confidence_percent': CONFIDENCE_THRESHOLD, 'margin_points': MARGIN_THRESHOLD},
              'hardware_connected': False}
    if label not in LABELS or not isinstance(confidence, (int, float)) or not math.isfinite(confidence) or not 0 <= confidence <= 100:
        return result
    valid = [r for r in top_results if isinstance(r, dict) and r.get('label') in LABELS
             and isinstance(r.get('confidence'), (int, float)) and math.isfinite(r['confidence'])
             and 0 <= r['confidence'] <= 100]
    valid.sort(key=lambda r: r['confidence'], reverse=True)
    if len(valid) < 2 or valid[0]['label'] != label or abs(valid[0]['confidence'] - confidence) > 0.1:
        return result
    margin = valid[0]['confidence'] - valid[1]['confidence']
    result['margin_points'] = round(margin, 2)
    if confidence < CONFIDENCE_THRESHOLD or margin < MARGIN_THRESHOLD:
        return result
    if label == 'metal':
        if metal_kind == 'ferrous':
            return {**result, 'action': 'magnet', 'destination': 'Ferromaqnit metal', 'reason': 'Ferromaqnitlik operator tərəfindən təsdiqlənib.'}
        if metal_kind != 'nonferrous':
            return {**result, 'reason': 'Metalın ferromaqnit olub-olmadığını operator təsdiqləməlidir.'}
    if label == 'organic':
        return {**result, 'action': 'bypass', 'destination': 'Üzvi axın', 'reason': 'Qol götürmür; konveyer düz davam edir.'}
    destinations = {'plastic': 'Plastik', 'paper': 'Kağız / karton', 'glass': 'Şüşə', 'metal': 'Qeyri-ferromaqnit metal'}
    return {**result, 'action': 'grip', 'destination': destinations[label], 'reason': 'ReflexGrip ilə ayırma simulyasiyası.'}
