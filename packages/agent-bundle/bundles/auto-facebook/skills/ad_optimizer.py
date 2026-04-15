"""Ad Optimizer — Phân tích và đề xuất tối ưu Facebook Ads."""
from datetime import datetime

async def execute(context, params=None):
    campaign_id = (params or {}).get('campaign_id')
    gateway = context.gateway
    
    ad_data = await gateway.get_ad_insights(campaign_id=campaign_id) if campaign_id else {}
    
    prompt = f"""Phân tích hiệu suất Facebook Ads:
Data: {ad_data}

Đề xuất: CPC, CTR, audience targeting, creative improvements."""
    
    analysis = await context.llm.generate(prompt)
    await context.memory.add({
        'type': 'ad_report', 'content': analysis,
        'timestamp': datetime.now().isoformat()
    })
    return {'status': 'success', 'analysis': analysis}
