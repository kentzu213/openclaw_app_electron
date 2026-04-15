"""CRM Sync — Đồng bộ thông tin khách hàng."""
from datetime import datetime

async def execute(context, params=None):
    leads = await context.memory.query({'type': 'lead_qualification', 'sort': '-timestamp', 'limit': 50})
    conversations = await context.memory.query({'type': 'conversation', 'sort': '-timestamp', 'limit': 100})
    
    # Group by customer
    customers = {}
    for conv in (conversations or []):
        cid = conv.get('customer_id', '')
        if cid not in customers:
            customers[cid] = {'messages': 0, 'last_contact': conv.get('timestamp')}
        customers[cid]['messages'] += 1
    
    for lead in (leads or []):
        cid = lead.get('customer_id', '')
        if cid in customers:
            customers[cid]['tier'] = lead.get('tier', 'cold')
            customers[cid]['score'] = lead.get('score', 0)
    
    await context.memory.add({
        'type': 'crm_sync', 'customer_count': len(customers),
        'timestamp': datetime.now().isoformat()
    })
    
    return {'status': 'success', 'synced': len(customers), 'customers': customers}
