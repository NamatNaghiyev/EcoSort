import io
from PIL import Image
from app import app

def png(size=(224,224)):
    stream=io.BytesIO();Image.new('RGB',size,'green').save(stream,'PNG');stream.seek(0);return stream

def test_api_validation():
    client=app.test_client()
    assert client.post('/api/predict').status_code==400
    assert client.post('/api/predict',data={'image':(io.BytesIO(b'not image'),'x.png')}).status_code==400
    assert client.post('/api/predict',data={'image':(png((4,4)),'small.png')}).status_code==400

def test_actual_prediction_includes_conservative_decision():
    client=app.test_client()
    r=client.post('/api/predict',data={'image':(png(),'test.png')})
    assert r.status_code==200
    data=r.get_json()
    assert data['label'] in ['glass','metal','organic','paper','plastic']
    assert len(data['top_results'])==3
    assert data['decision']['hardware_connected'] is False
    assert data['model_version']

def test_quality_is_json_not_fake_success():
    response=app.test_client().get('/api/quality')
    assert response.status_code in (200,503)
    assert response.is_json
    assert response.get_json().get('status') in ('evaluated','not_evaluated')
