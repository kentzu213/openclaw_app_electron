"""Objection Handler — Xử lý từ chối khách hàng."""
async def execute(context, params=None):
    message = (params or {}).get('message', '')
    customer_id = (params or {}).get('customer_id', '')
    
    history = await context.memory.query({
        'type': 'conversation', 'customer_id': customer_id, 'limit': 10, 'sort': '-timestamp'
    })
    
    prompt = f"""Khách từ chối: "{message}"
Lịch sử: {[h.get('message','')[:40] for h in (history or [])]}

Áp dụng SPIN Selling để xử lý objection. Trả lời ngắn gọn, không pushy."""
    
    response = await context.llm.generate(prompt)
    return {'status': 'success', 'response': response}
