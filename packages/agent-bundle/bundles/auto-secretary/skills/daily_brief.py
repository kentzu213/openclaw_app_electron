"""
Daily Briefing Skill — Tóm tắt ngày: lịch, tasks, và insights.
"""

from datetime import datetime, timedelta


async def execute(context, params=None):
    """
    Generate and send daily briefing.
    Morning brief: today's schedule + pending tasks.
    Evening brief: today's summary + tomorrow's preview.
    """
    config = context.config
    gateway = context.gateway
    now = datetime.now()
    
    is_morning = now.hour < 12
    brief_type = 'morning' if is_morning else 'evening'
    
    # 1. Get today's events
    today_start = now.replace(hour=0, minute=0, second=0)
    today_end = today_start + timedelta(days=1)
    
    events = await context.memory.query({
        'type': 'calendar_event',
        'status': 'active',
        'sort': 'start_time',
    })
    
    today_events = [
        e for e in (events or [])
        if today_start.isoformat() <= e.get('start_time', '') < today_end.isoformat()
    ]
    
    # 2. Get pending tasks
    tasks = await context.memory.query({
        'type': 'task',
        'status': 'pending',
        'sort': 'priority',
    })
    
    # 3. Generate briefing with LLM
    events_text = "\n".join([
        f"- {e.get('start_time', '')[11:16]} {e.get('title', '')}"
        for e in today_events
    ]) or "Không có sự kiện"
    
    tasks_text = "\n".join([
        f"- [{t.get('priority', 'normal')}] {t.get('title', '')}"
        for t in (tasks or [])[:10]
    ]) or "Không có task pending"
    
    if brief_type == 'morning':
        prompt = f"""Viết briefing buổi sáng ngắn gọn, năng lượng:
        
📅 Lịch hôm nay:
{events_text}

📋 Tasks cần làm:
{tasks_text}

Format: emoji + text, tổng tối đa 300 ký tự. Kết thúc bằng 1 câu motivational ngắn."""
    else:
        prompt = f"""Viết tóm tắt cuối ngày:

📅 Sự kiện hôm nay:
{events_text}

📋 Tasks:
{tasks_text}

Format: tóm tắt highlights, nhắc task chưa xong, preview ngày mai nếu có. Tối đa 300 ký tự."""
    
    briefing = await context.llm.generate(prompt)
    
    # 4. Send briefing
    platform = config.get('reminder_platform', 'telegram')
    await gateway.send_message(
        platform=platform,
        recipient_id=config.get('owner_id', ''),
        text=briefing,
    )
    
    # 5. Log briefing
    await context.memory.add({
        'type': 'briefing',
        'brief_type': brief_type,
        'content': briefing,
        'events_count': len(today_events),
        'tasks_count': len(tasks or []),
        'timestamp': now.isoformat(),
    })
    
    return {
        'status': 'success',
        'type': brief_type,
        'events': len(today_events),
        'tasks': len(tasks or []),
    }
