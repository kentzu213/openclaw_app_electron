"""Calendar Manager — Quản lý lịch, tạo sự kiện."""
from datetime import datetime

async def execute(context, params=None):
    action = (params or {}).get('action', 'list')  # list, add, remove
    
    if action == 'add':
        event = {
            'type': 'calendar_event', 'status': 'active',
            'title': (params or {}).get('title', ''),
            'start_time': (params or {}).get('start_time', ''),
            'end_time': (params or {}).get('end_time', ''),
            'location': (params or {}).get('location', ''),
            'created_at': datetime.now().isoformat()
        }
        await context.memory.add(event)
        return {'status': 'success', 'action': 'added', 'event': event}
    
    events = await context.memory.query({
        'type': 'calendar_event', 'status': 'active', 'sort': 'start_time'
    })
    return {'status': 'success', 'events': events or []}
