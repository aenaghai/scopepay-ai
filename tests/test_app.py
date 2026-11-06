"""Run with: pip install pytest httpx && pytest -q"""
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
import app as scopepay

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(scopepay, 'DB_PATH', tmp_path / 'unit_test.db')
    monkeypatch.setattr(scopepay, 'GEMINI_KEY', '')
    monkeypatch.setattr(scopepay, 'PAYPAL_CLIENT_ID', '')
    monkeypatch.setattr(scopepay, 'PAYPAL_CLIENT_SECRET', '')
    scopepay.init_db()
    with TestClient(scopepay.app) as c:
        yield c


def create_change(c):
    projects = c.get('/api/projects').json()
    assert projects[0]['client_name'] == 'Northstar Studio'
    response = c.post(f"/api/projects/{projects[0]['id']}/changes", json={
        'request_text': 'Can you also add an online booking portal and a payment checkout?'
    })
    assert response.status_code == 201, response.text
    return response.json()


def test_analysis_is_explicitly_not_ai_without_key(client):
    change = create_change(client)
    assert change['classification'] == 'OUT_OF_SCOPE'
    assert change['ai_mode'] == 'OFFLINE_PREVIEW'
    assert 'booking' in change['evidence']
    assert change['status'] == 'PROPOSED'


def test_approval_needs_price_and_price_locks(client):
    change = create_change(client)
    id = change['id']
    assert client.post(f'/api/changes/{id}/approve').status_code == 422
    assert client.patch(f'/api/changes/{id}/quote', json={'amount':'-10'}).status_code == 422
    assert client.patch(f'/api/changes/{id}/quote', json={'amount':'NaN'}).status_code == 422
    response = client.patch(f'/api/changes/{id}/quote', json={'amount':'150.00'})
    assert response.status_code == 200
    assert client.post(f'/api/changes/{id}/approve').json()['status'] == 'APPROVED'
    assert client.patch(f'/api/changes/{id}/quote',json={'amount':'5'}).status_code == 409
    assert client.post(f'/api/changes/{id}/paypal/create').status_code == 503


def test_payment_verification_and_browser_amount_ignored(client, monkeypatch):
    change = create_change(client)
    id = change['id']
    client.patch(f'/api/changes/{id}/quote',json={'amount':'175.00'})
    client.post(f'/api/changes/{id}/approve')
    monkeypatch.setattr(scopepay, 'PAYPAL_CLIENT_ID', 'fake-public-id')
    monkeypatch.setattr(scopepay, 'PAYPAL_CLIENT_SECRET', 'fake-secret')
    captured_calls=[]
    def fake_paypal(method,path,payload=None,request_id=None):
        captured_calls.append((method,path,payload))
        if path.endswith('/capture'):
            return {'id':'SANDBOX_ORDER_1','status':'COMPLETED','purchase_units':[{'payments':{'captures':[{
                'id':'CAPTURE_TEST_123','status':'COMPLETED', 'amount':{'currency_code':'USD','value':'175.00'}
            }]}}]}
        return {'id':'SANDBOX_ORDER_1','status':'CREATED'}
    monkeypatch.setattr(scopepay,'paypal_request',fake_paypal)
    result=client.post(f'/api/changes/{id}/paypal/create',json={'amount':'0.01'})
    assert result.status_code==200
    assert captured_calls[0][2]['purchase_units'][0]['amount']['value']=='175.00'
    assert client.post(f'/api/changes/{id}/paypal/capture',json={'orderID':'WRONG'}).status_code==400
    paid=client.post(f'/api/changes/{id}/paypal/capture',json={'orderID':'SANDBOX_ORDER_1'})
    assert paid.status_code==200,paid.text
    assert paid.json()['status']=='PAID'
    assert paid.json()['paypal_capture_id']=='CAPTURE_TEST_123'
    assert client.post(f'/api/changes/{id}/paypal/create').status_code==409


def test_payment_rejects_wrong_amount_even_if_paypal_says_completed(client,monkeypatch):
    change=create_change(client);id=change['id']
    client.patch(f'/api/changes/{id}/quote',json={'amount':'199.00'})
    client.post(f'/api/changes/{id}/approve')
    monkeypatch.setattr(scopepay, 'PAYPAL_CLIENT_ID','x')
    monkeypatch.setattr(scopepay, 'PAYPAL_CLIENT_SECRET','y')
    def wrong_amount(method,path,payload=None,request_id=None):
        if path.endswith('/capture'):
            return {'id':'ORDER_2','status':'COMPLETED','purchase_units':[{'payments':{'captures':[
                {'id':'bad','status':'COMPLETED','amount':{'value':'1.00','currency_code':'USD'}}
            ]}}]}
        return {'id':'ORDER_2'}
    monkeypatch.setattr(scopepay,'paypal_request',wrong_amount)
    client.post(f'/api/changes/{id}/paypal/create')
    result=client.post(f'/api/changes/{id}/paypal/capture',json={'orderID':'ORDER_2'})
    assert result.status_code==502
    assert client.get('/api/projects').json()[0]['changes'][0]['status']=='APPROVED'


def test_project_creation(client):
    created=client.post('/api/projects',json={'title':'Acme website','client_name':'Acme',
              'original_scope':'One landing page, including contact section and two revision rounds.'})
    assert created.status_code==201
    assert len(client.get('/api/projects').json())==2


def test_gemini_call_is_marked_as_actual_ai(client, monkeypatch):
    monkeypatch.setattr(scopepay, 'GEMINI_KEY', 'fake-test-key')
    calls=[]
    class Response:
        def raise_for_status(self): pass
        def json(self):
            return {'candidates':[{'content':{'parts':[{'text':'{"classification":"OUT_OF_SCOPE","explanation":"Booking was excluded.","evidence":"Original says no booking, request adds booking.","additions":["Booking feature"],"reply":"Happy to quote this addition before starting."}'}]}}]}
    def fake_post(url,**kwargs):
        calls.append((url,kwargs))
        return Response()
    monkeypatch.setattr(scopepay.requests,'post',fake_post)
    result=create_change(client)
    assert result['ai_mode']=='GEMINI'
    assert result['explanation']=='Booking was excluded.'
    assert calls[0][1]['headers']['x-goog-api-key']=='fake-test-key'


def test_frontend_serves_assets(client):
    assert client.get('/').status_code==200
    assert b'ScopePay' in client.get('/').content
    assert client.get('/static/app.js').status_code==200
    assert client.get('/static/style.css').status_code==200
