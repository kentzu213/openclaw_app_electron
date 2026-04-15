"""Lead Qualifier — Phân loại lead: hot/warm/cold."""
from datetime import datetime

async def execute(context, params=None):
    leads = await context.memory.query({'type': 'lead_score_event', 'limit': 200})
    
    # Aggregate scores by customer
    scores = {}
    for event in (leads or []):
        cid = event.get('customer_id', '')
        scores[cid] = scores.get(cid, 0) + event.get('score_delta', 0)
    
    qualified = []
    for cid, score in scores.items():
        tier = 'hot' if score >= 15 else 'warm' if score >= 8 else 'cold'
        qualified.append({'customer_id': cid, 'score': score, 'tier': tier})
        await context.memory.add({
            'type': 'lead_qualification', 'customer_id': cid,
            'score': score, 'tier': tier, 'timestamp': datetime.now().isoformat()
        })
    
    return {'status': 'success', 'leads': qualified,
            'hot': len([q for q in qualified if q['tier'] == 'hot']),
            'warm': len([q for q in qualified if q['tier'] == 'warm']),
            'cold': len([q for q in qualified if q['tier'] == 'cold'])}
