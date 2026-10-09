from pathlib import Path

def test_metrics_use_all_classes_and_count_errors():
    from tools.evaluate_model import calculate_metrics
    r=calculate_metrics(['glass','metal'],['glass','glass'],['glass','metal','organic'])
    assert r['accuracy']==0.5
    assert r['confusion_matrix']==[[1,0,0],[1,0,0],[0,0,0]]
    assert r['classes'][0]['precision']==0.5
    assert r['classes'][1]['recall']==0
    assert r['classes'][2]['support']==0

def test_audit_finds_cross_split_duplicate_without_changing_files(tmp_path):
    from tools.audit_dataset import audit_dataset
    for split in ['train','test']:
        p=tmp_path/split/'glass'/'papier_carton_1.jpg';p.parent.mkdir(parents=True);p.write_bytes(b'same')
    r=audit_dataset(tmp_path)
    assert r['cross_split_duplicates']==1
    assert r['filename_warnings']==2
    assert (tmp_path/'test/glass/papier_carton_1.jpg').read_bytes()==b'same'

def test_evaluation_reports_rejected_images_instead_of_losing_report(tmp_path):
    from PIL import Image
    from tools.evaluate_model import evaluate
    for label in ['glass','metal']:
        directory=tmp_path/label;directory.mkdir();Image.new('RGB',(224,224),'green').save(directory/'valid.png')
    (tmp_path/'glass/bad.jpg').write_bytes(b'not an image')
    report=evaluate(tmp_path)
    assert report['sample_count']==2
    assert report['attempted_count']==3
    assert report['rejected_count']==1
    assert report['rejected_examples'][0]['path']=='glass/bad.jpg'
    assert report['split']==tmp_path.name
