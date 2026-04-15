"""Proposal Writer — Tạo báo giá, proposal tự động."""
async def execute(context, params=None):
    customer_id = (params or {}).get('customer_id', '')
    products = (params or {}).get('products', [])
    
    history = await context.memory.query({
        'type': 'conversation', 'customer_id': customer_id, 'limit': 10, 'sort': '-timestamp'
    })
    
    prompt = f"""Tạo báo giá chuyên nghiệp:
Khách hàng: {customer_id}
Sản phẩm: {products}
Lịch sử: {[h.get('message','')[:50] for h in (history or [])]}

Format: Tiêu đề → Bảng giá → Ưu đãi → Điều khoản → CTA"""
    
    proposal = await context.llm.generate(prompt)
    return {'status': 'success', 'proposal': proposal}
