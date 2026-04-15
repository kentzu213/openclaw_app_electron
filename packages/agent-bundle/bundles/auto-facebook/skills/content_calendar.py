"""
Content Calendar Skill — Lên lịch content tự động.
"""
from datetime import datetime, timedelta

async def execute(context, params=None):
    """Generate weekly/monthly content calendar."""
    config = context.config
    period = (params or {}).get('period', 'week')
    days = 7 if period == 'week' else 30
    
    recent_posts = await context.memory.query({
        'type': 'post', 'limit': 20, 'sort': '-posted_at'
    })
    recent_topics = [p.get('topic', '') for p in (recent_posts or [])]
    
    prompt = f"""Lên lịch content Facebook cho {days} ngày tới.
Chủ đề gần đây (tránh lặp): {', '.join(recent_topics[:10])}
Tone: {config.get('tone_of_voice', 'Thân thiện')}

Format mỗi ngày:
📅 Ngày X — [chủ đề] — [post_type: text/image/video] — [giờ đăng]"""

    calendar = await context.llm.generate(prompt)
    
    await context.memory.add({
        'type': 'content_calendar', 'period': period,
        'content': calendar, 'created_at': datetime.now().isoformat()
    })
    
    return {'status': 'success', 'calendar': calendar, 'days': days}
