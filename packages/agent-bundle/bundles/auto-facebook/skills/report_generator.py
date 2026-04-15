"""
Report Generator Skill — Báo cáo hiệu suất Page.
"""
from datetime import datetime

async def execute(context, params=None):
    """Generate daily/weekly performance report."""
    period = (params or {}).get('period', 'daily')
    gateway = context.gateway
    
    metrics = await gateway.get_insights(platform='facebook', metrics=[
        'page_impressions', 'page_engaged_users', 'page_post_engagements',
        'page_fan_adds', 'page_views_total'
    ])
    
    posts = await context.memory.query({
        'type': 'post', 'limit': 10, 'sort': '-posted_at'
    })
    
    prompt = f"""Tạo báo cáo hiệu suất Facebook Page ({period}):
Metrics: {metrics}
Bài đăng gần đây: {len(posts or [])} bài

Format báo cáo:
📈 **Báo cáo {period}**
- Reach: X
- Engagement: X%
- Followers mới: +X
- Top bài: ...
- Đề xuất tuần tới: ..."""

    report = await context.llm.generate(prompt)
    
    await context.memory.add({
        'type': 'performance_report', 'period': period,
        'content': report, 'timestamp': datetime.now().isoformat()
    })
    
    return {'status': 'success', 'report': report}
