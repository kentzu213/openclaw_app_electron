"""Email Campaign Writer — Viết email marketing sequence."""
async def execute(context, params=None):
    campaign_type = (params or {}).get('type', 'welcome')  # welcome, nurture, promo
    product = (params or {}).get('product', '')
    brand = context.config.get('brand_name', '')
    
    prompt = f"""Viết {campaign_type} email sequence (3 emails):
Brand: {brand}, Product: {product}

Mỗi email: Subject line + Body (dưới 200 từ) + CTA
Email 1: {campaign_type} → Email 2: Value → Email 3: Convert"""
    
    sequence = await context.llm.generate(prompt)
    return {'status': 'success', 'campaign_type': campaign_type, 'sequence': sequence}
