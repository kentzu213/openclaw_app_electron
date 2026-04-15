"""
Smart Reminder Skill — Nhắc nhở thông minh dựa trên lịch và context.
"""

from datetime import datetime, timedelta


async def execute(context, params=None):
    """
    Check upcoming events and send timely reminders.
    Runs every 5 minutes via cron.
    """
    config = context.config
    gateway = context.gateway
    
    now = datetime.now()
    reminder_window = int(config.get('reminder_minutes', 15))
    
    # 1. Get upcoming events
    events = await context.memory.query({
        'type': 'calendar_event',
        'status': 'active',
        'sort': 'start_time',
        'limit': 20,
    })
    
    results = []
    
    for event in (events or []):
        start_time = datetime.fromisoformat(event.get('start_time', ''))
        time_until = (start_time - now).total_seconds() / 60  # minutes
        
        # Skip past events
        if time_until < 0:
            continue
        
        # Check if already reminded
        already_reminded = await context.memory.query({
            'type': 'reminder_sent',
            'event_id': event.get('id'),
            'limit': 1,
        })
        
        if already_reminded:
            continue
        
        # 2. Send reminder if within window
        if time_until <= reminder_window:
            message = await _format_reminder(context, event, int(time_until))
            
            # Send via preferred channel
            platform = config.get('reminder_platform', 'telegram')
            await gateway.send_message(
                platform=platform,
                recipient_id=config.get('owner_id', ''),
                text=message,
            )
            
            # Mark as reminded
            await context.memory.add({
                'type': 'reminder_sent',
                'event_id': event.get('id'),
                'event_title': event.get('title', ''),
                'timestamp': now.isoformat(),
            })
            
            results.append({
                'event': event.get('title'),
                'minutes_until': int(time_until),
                'status': 'reminded',
            })
    
    # 3. Check overdue tasks
    tasks = await context.memory.query({
        'type': 'task',
        'status': 'pending',
        'sort': 'due_date',
    })
    
    overdue_tasks = []
    for task in (tasks or []):
        due = task.get('due_date')
        if due and datetime.fromisoformat(due) < now:
            overdue_tasks.append(task)
    
    if overdue_tasks:
        overdue_msg = await _format_overdue_alert(context, overdue_tasks)
        platform = config.get('reminder_platform', 'telegram')
        await gateway.send_message(
            platform=platform,
            recipient_id=config.get('owner_id', ''),
            text=overdue_msg,
        )
    
    return {
        'status': 'success',
        'reminders_sent': len(results),
        'overdue_tasks': len(overdue_tasks),
        'results': results,
    }


async def _format_reminder(context, event, minutes):
    """Format a human-friendly reminder message."""
    title = event.get('title', 'Sự kiện')
    location = event.get('location', '')
    
    time_text = f"còn {minutes} phút" if minutes > 0 else "bắt đầu ngay"
    loc_text = f"\n📍 {location}" if location else ""
    
    return f"⏰ Nhắc nhở: **{title}** — {time_text}{loc_text}\n\nBạn đã sẵn sàng chưa?"


async def _format_overdue_alert(context, tasks):
    """Format overdue task alert."""
    task_list = "\n".join([
        f"• {t.get('title', 'Task')} (quá hạn {t.get('due_date', '')})"
        for t in tasks[:5]
    ])
    
    return f"🔴 **{len(tasks)} task quá hạn:**\n{task_list}\n\nBạn muốn gia hạn hay hoàn thành ngay?"
