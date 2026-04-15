"""
Audience Analyzer Skill — Phân tích demographics và engagement.
"""
from datetime import datetime

async def execute(context, params=None):
    """Analyze page audience demographics and engagement patterns."""
    gateway = context.gateway
    
    # Fetch page insights
    insights = await gateway.get_insights(platform='facebook', metrics=[
        'page_impressions', 'page_engaged_users', 'page_fan_adds',
        'page_fans_by_age_gender', 'page_fans_online'
    ])
    
    prompt = f"""Phân tích audience insights:
{insights}

Trả lời format:
📊 **Báo cáo Audience**
- Tổng followers: X
- Engagement rate: X%
- Giờ online cao nhất: X
- Demographics chính: X
- Đề xuất cải thiện: ..."""

    analysis = await context.llm.generate(prompt)
    
    await context.memory.add({
        'type': 'audience_report', 'content': analysis,
        'timestamp': datetime.now().isoformat()
    })
    
    return {'status': 'success', 'report': analysis}
