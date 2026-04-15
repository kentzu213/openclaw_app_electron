"""Daily Sales Report — Báo cáo doanh số hàng ngày."""
from datetime import datetime

async def execute(context, params=None):
    conversations = await context.memory.query({'type': 'conversation', 'sort': '-timestamp', 'limit': 200})
    leads = await context.memory.query({'type': 'lead_qualification', 'sort': '-timestamp', 'limit': 100})
    follow_ups = await context.memory.query({'type': 'follow_up_sent', 'sort': '-timestamp', 'limit': 50})
    
    hot_leads = len([l for l in (leads or []) if l.get('tier') == 'hot'])
    warm_leads = len([l for l in (leads or []) if l.get('tier') == 'warm'])
    
    prompt = f"""Tạo báo cáo bán hàng ngày:
- Tổng tin nhắn: {len(conversations or [])}
- Leads hot: {hot_leads}, warm: {warm_leads}
- Follow-ups gửi: {len(follow_ups or [])}

Format: 📊 emoji + metrics + insights + recommendations"""
    
    report = await context.llm.generate(prompt)
    await context.memory.add({'type': 'sales_report', 'content': report, 'timestamp': datetime.now().isoformat()})
    return {'status': 'success', 'report': report}
