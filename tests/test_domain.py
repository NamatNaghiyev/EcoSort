import math

def domain():
    import ecosort_domain
    return ecosort_domain

def test_routing_requires_confidence_and_margin():
    d=domain()
    assert d.decision_for('plastic',90,[{'label':'plastic','confidence':90},{'label':'paper','confidence':8}])['action']=='grip'
    assert d.decision_for('plastic',60,[{'label':'plastic','confidence':60},{'label':'paper','confidence':35}])['action']=='review'
    assert d.decision_for('plastic',80,[{'label':'plastic','confidence':80},{'label':'paper','confidence':70}])['action']=='review'
    assert d.decision_for('plastic',90,[])['action']=='review'
    assert d.decision_for('unknown',99,[])['action']=='review'
    assert d.decision_for('plastic',math.nan,[])['action']=='review'

def test_organic_bypasses_robot_and_metal_needs_confirmation():
    d=domain()
    top=lambda c:[{'label':c,'confidence':95},{'label':'paper','confidence':3}]
    assert d.decision_for('organic',95,top('organic'))['action']=='bypass'
    assert d.decision_for('metal',95,top('metal'))['action']=='review'
    assert d.decision_for('metal',95,top('metal'),'ferrous')['action']=='magnet'
    assert d.decision_for('metal',95,top('metal'),'nonferrous')['action']=='grip'

def test_predict_cli_delegates_to_single_authoritative_pipeline():
    import predict
    assert predict.CLASS_NAMES == ['glass','metal','organic','paper','plastic']
    assert predict.predict_image is predict.web_predict_image
