"""CLI uses exactly the same class order and preprocessing as the web API."""
from app import CLASS_NAMES, predict_image as web_predict_image

predict_image = web_predict_image

if __name__ == '__main__':
    path = input('Şəkilin yolunu yaz: ').strip()
    label, confidence, alternatives = predict_image(path)
    print(f'Nəticə: {label}\nConfidence: {confidence * 100:.2f}%')
    for item in alternatives:
        print(f"  {item['label']}: {item['confidence']:.2f}%")
