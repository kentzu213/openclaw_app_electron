"""Upsell Recommender — Gợi ý sản phẩm upsell/cross-sell."""
async def execute(context, params=None):
    customer_id = (params or {}).get('customer_id', '')
    
    purchase_history = await context.memory.query({
        'type': 'conversation', 'customer_id': customer_id,
        'limit': 20, 'sort': '-timestamp'
    })
    
    prompt = f"""Dựa trên lịch sử của khách: {[h.get('message','')[:40] for h in (purchase_history or [])]}
Gợi ý 2-3 sản phẩm upsell/cross-sell phù hợp. Ngắn gọn, tự nhiên."""
    
    recommendations = await context.llm.generate(prompt)
    return {'status': 'success', 'recommendations': recommendations}
